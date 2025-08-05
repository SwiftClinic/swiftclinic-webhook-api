/**
 * Tenant Management Routes
 * Core SaaS platform tenant CRUD operations with enterprise security
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { MultiTenantDatabase } from '../mocks/multi-tenant-database';
import { MultiTenantAuth } from '../mocks/multi-tenant-auth';
import { EncryptionService } from '../mocks/encryption-service';
import { Tenant, TenantLimits } from '../mocks/types';
import { asyncHandler, createError } from '../middleware/error-handler';
import { validateTenantParam } from '../middleware/tenant-context';

export function createTenantRoutes(
  database: MultiTenantDatabase,
  auth: MultiTenantAuth,
  encryptionService: EncryptionService
): Router {
  const router = Router();

  // ============================================================================
  // TENANT CREATION (Admin Only)
  // ============================================================================

  /**
   * POST /api/tenants
   * Create a new tenant (instant clinic onboarding foundation)
   */
  router.post('/',
    [
      // Validation rules
      body('name').isLength({ min: 2, max: 100 }).withMessage('Tenant name must be 2-100 characters'),
      body('slug').optional().matches(/^[a-z0-9-]+$/).withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
      body('organizationType').isIn(['healthcare_provider', 'clinic_chain', 'hospital_system', 'individual_practice']),
      body('contactInfo.primaryEmail').isEmail().withMessage('Valid primary email required'),
      body('contactInfo.primaryPhone').optional().isMobilePhone('any'),
      body('contactInfo.address.country').isLength({ min: 2, max: 2 }).withMessage('Country must be 2-letter code'),
      body('subscription.plan').isIn(['starter', 'professional', 'enterprise', 'custom']),
      body('compliance.jurisdiction').isIn(['US', 'EU', 'UK', 'CA', 'AU', 'GLOBAL']),
      body('compliance.dataResidency').isIn(['US', 'EU', 'UK', 'CA', 'AU']),
    ],
    auth.requirePermissions(['tenant:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createError.validation('Invalid tenant data', errors.array());
      }

      const tenantData = req.body;

      // Generate unique slug if not provided
      if (!tenantData.slug) {
        tenantData.slug = generateSlugFromName(tenantData.name);
      }

      // Verify slug is unique
      const existingTenant = await checkSlugAvailability(database, tenantData.slug);
      if (existingTenant) {
        throw createError.conflict('Tenant slug already exists');
      }

      // Set default subscription limits based on plan
      const subscriptionLimits = getDefaultLimitsForPlan(tenantData.subscription.plan);

      // Set trial period for new tenants
      const trialDuration = parseInt(process.env.DEFAULT_TRIAL_DURATION_DAYS || '14');
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDuration);

      // Prepare tenant configuration
      const tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'> = {
        name: tenantData.name,
        slug: tenantData.slug,
        organizationType: tenantData.organizationType,
        contactInfo: tenantData.contactInfo,
        subscription: {
          plan: tenantData.subscription.plan,
          status: 'trial',
          billingCycle: tenantData.subscription.billingCycle || 'monthly',
          trialEndsAt,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
          limits: subscriptionLimits
        },
        compliance: {
          jurisdiction: tenantData.compliance.jurisdiction,
          dataResidency: tenantData.compliance.dataResidency,
          hipaaRequired: tenantData.compliance.hipaaRequired || false,
          gdprRequired: tenantData.compliance.gdprRequired || false,
          complianceCertifications: tenantData.compliance.complianceCertifications || [],
          dataProcessingAgreement: false,
          businessAssociateAgreement: tenantData.compliance.hipaaRequired || false
        },
        security: {
          encryptionLevel: tenantData.security?.encryptionLevel || 'standard',
          ipWhitelist: tenantData.security?.ipWhitelist,
          ssoEnabled: false,
          mfaRequired: tenantData.security?.mfaRequired || false,
          sessionTimeout: tenantData.security?.sessionTimeout || 60,
          passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            maxAge: 90,
            preventReuse: 5
          },
          auditRetention: tenantData.compliance.hipaaRequired ? 2555 : 365 // 7 years for HIPAA
        },
        branding: tenantData.branding,
        isActive: true,
        createdBy: req.userId || 'system'
      };

      // Create tenant
      const createdTenant = await database.createTenant(tenant);

      // Create default admin user for the tenant
      const adminUser = await createDefaultAdminUser(database, createdTenant, tenantData.contactInfo.primaryEmail);

      res.status(201).json({
        success: true,
        data: {
          tenant: sanitizeTenant(createdTenant),
          adminUser: {
            id: adminUser.id,
            email: adminUser.email,
            role: adminUser.role
          },
          webhookUrl: null, // Will be generated when first clinic is created
          trialEndsAt: createdTenant.subscription.trialEndsAt
        },
        message: 'Tenant created successfully'
      });
    })
  );

  // ============================================================================
  // TENANT RETRIEVAL
  // ============================================================================

  /**
   * GET /api/tenants
   * List all tenants (Super Admin only)
   */
  router.get('/',
    [
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('status').optional().isIn(['trial', 'active', 'suspended', 'cancelled']),
      query('jurisdiction').optional().isIn(['US', 'EU', 'UK', 'CA', 'AU', 'GLOBAL'])
    ],
    auth.requirePermissions(['system:monitor']),
    asyncHandler(async (req: Request, res: Response) => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const jurisdiction = req.query.jurisdiction as string;

      const tenants = await database.getAllTenants({
        page,
        limit,
        status,
        jurisdiction
      });

      const sanitizedTenants = tenants.map(sanitizeTenant);

      res.json({
        success: true,
        data: {
          tenants: sanitizedTenants,
          pagination: {
            page,
            limit,
            total: tenants.length,
            hasMore: tenants.length === limit
          }
        }
      });
    })
  );

  /**
   * GET /api/tenants/:tenantId
   * Get specific tenant details
   */
  router.get('/:tenantId',
    [
      param('tenantId').isString().withMessage('Valid tenant ID required')
    ],
    validateTenantParam(),
    auth.requirePermissions(['tenant:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await database.getTenant(req.params.tenantId);
      
      if (!tenant) {
        throw createError.notFound('Tenant');
      }

      res.json({
        success: true,
        data: {
          tenant: sanitizeTenant(tenant)
        }
      });
    })
  );

  // ============================================================================
  // TENANT UPDATES
  // ============================================================================

  /**
   * PUT /api/tenants/:tenantId
   * Update tenant configuration
   */
  router.put('/:tenantId',
    [
      param('tenantId').isString(),
      body('name').optional().isLength({ min: 2, max: 100 }),
      body('contactInfo.primaryEmail').optional().isEmail(),
      body('subscription.plan').optional().isIn(['starter', 'professional', 'enterprise', 'custom']),
      body('compliance.jurisdiction').optional().isIn(['US', 'EU', 'UK', 'CA', 'AU', 'GLOBAL'])
    ],
    validateTenantParam(),
    auth.requirePermissions(['tenant:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const updates = req.body;

      const existingTenant = await database.getTenant(tenantId);
      if (!existingTenant) {
        throw createError.notFound('Tenant');
      }

      // Update tenant
      const updatedTenant = await database.updateTenant(tenantId, updates);

      res.json({
        success: true,
        data: {
          tenant: sanitizeTenant(updatedTenant)
        },
        message: 'Tenant updated successfully'
      });
    })
  );

  /**
   * PATCH /api/tenants/:tenantId/status
   * Update tenant status (suspend, activate, etc.)
   */
  router.patch('/:tenantId/status',
    [
      param('tenantId').isString(),
      body('status').isIn(['trial', 'active', 'suspended', 'cancelled']),
      body('reason').optional().isString()
    ],
    validateTenantParam(),
    auth.requirePermissions(['tenant:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const { status, reason } = req.body;

      const tenant = await database.updateTenantStatus(tenantId, status, reason, req.userId!);

      res.json({
        success: true,
        data: {
          tenant: sanitizeTenant(tenant)
        },
        message: `Tenant status updated to ${status}`
      });
    })
  );

  // ============================================================================
  // TENANT ANALYTICS
  // ============================================================================

  /**
   * GET /api/tenants/:tenantId/analytics
   * Get tenant usage analytics
   */
  router.get('/:tenantId/analytics',
    [
      param('tenantId').isString(),
      query('period').optional().isIn(['7d', '30d', '90d', '1y'])
    ],
    validateTenantParam(),
    auth.requirePermissions(['tenant:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const period = req.query.period as string || '30d';

      const analytics = await database.getTenantAnalytics(tenantId, period);

      res.json({
        success: true,
        data: {
          analytics,
          period
        }
      });
    })
  );

  return router;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

async function checkSlugAvailability(database: MultiTenantDatabase, slug: string): Promise<boolean> {
  try {
    const existing = await database.getTenantBySlug(slug);
    return !!existing;
  } catch (error) {
    return false;
  }
}

function getDefaultLimitsForPlan(plan: string): TenantLimits {
  const limits = {
    starter: {
      maxClinics: 1,
      maxUsers: 5,
      maxConversationsPerMonth: 1000,
      maxStorageGB: 1,
      maxApiCallsPerHour: 100
    },
    professional: {
      maxClinics: 5,
      maxUsers: 25,
      maxConversationsPerMonth: 10000,
      maxStorageGB: 10,
      maxApiCallsPerHour: 1000
    },
    enterprise: {
      maxClinics: 50,
      maxUsers: 100,
      maxConversationsPerMonth: 100000,
      maxStorageGB: 100,
      maxApiCallsPerHour: 10000
    },
    custom: {
      maxClinics: 999,
      maxUsers: 999,
      maxConversationsPerMonth: 9999999,
      maxStorageGB: 1000,
      maxApiCallsPerHour: 100000
    }
  };

  return limits[plan as keyof typeof limits] || limits.starter;
}

async function createDefaultAdminUser(
  database: MultiTenantDatabase,
  tenant: Tenant,
  email: string
): Promise<any> {
  // This would create a default admin user for the tenant
  // Implementation depends on your user management system
  return {
    id: 'user_' + tenant.id,
    email,
    role: 'tenant_owner'
  };
}

function sanitizeTenant(tenant: Tenant): any {
  // Remove sensitive information before sending to client
  const sanitized = { ...tenant };
  
  // Remove sensitive fields
  if (sanitized.security) {
    delete sanitized.security.passwordPolicy;
  }

  return sanitized;
} 