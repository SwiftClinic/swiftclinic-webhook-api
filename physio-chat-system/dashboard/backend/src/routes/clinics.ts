/**
 * Clinic Management Routes
 * CRITICAL: Webhook URL Generation & Tenant Resolution Bridge
 * This is the core of instant clinic onboarding!
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import crypto from 'crypto';
import { MultiTenantDatabase } from '../mocks/multi-tenant-database';
import { MultiTenantAuth } from '../mocks/multi-tenant-auth';
import { EncryptionService } from '../mocks/encryption-service';
import { MultiTenantClinicConfig } from '../mocks/types';
import { asyncHandler, createError } from '../middleware/error-handler';
import { validateTenantParam, requireTenantAccess } from '../middleware/tenant-context';

export function createClinicRoutes(
  database: MultiTenantDatabase,
  auth: MultiTenantAuth,
  encryptionService: EncryptionService
): Router {
  const router = Router();

  // ============================================================================
  // 🚀 INSTANT CLINIC ONBOARDING - WEBHOOK URL GENERATION
  // ============================================================================

  /**
   * POST /api/tenants/:tenantId/clinics
   * Create clinic with INSTANT webhook generation (SaaS magic!)
   */
  router.post('/:tenantId/clinics',
    [
      param('tenantId').isString(),
      body('name').isLength({ min: 2, max: 100 }).withMessage('Clinic name required'),
      body('contactInfo.email').isEmail().withMessage('Valid clinic email required'),
      body('contactInfo.phone').optional().isMobilePhone('any'),
      body('contactInfo.address.street').isLength({ min: 1 }),
      body('contactInfo.address.city').isLength({ min: 1 }),
      body('contactInfo.address.country').isLength({ min: 2, max: 2 }),
      body('timezone').isString().withMessage('Valid timezone required'),
      body('services').isArray({ min: 1 }).withMessage('At least one service required'),
      body('bookingSystem.type').isIn(['cliniko', 'acuity', 'appointy', 'setmore', 'custom', 'mock']),
      body('businessHours').isObject().withMessage('Business hours required')
    ],
    validateTenantParam(),
    requireTenantAccess(),
    auth.requirePermissions(['clinic:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const clinicData = req.body;

      // Validate tenant exists and is active
      const tenant = await database.getTenant(tenantId);
      if (!tenant || !tenant.isActive) {
        throw createError.notFound('Active tenant not found');
      }

      // Check tenant limits
      const existingClinics = await database.getClinicsByTenant(tenantId);
      if (existingClinics.length >= tenant.subscription.limits.maxClinics) {
        throw createError.forbidden('Clinic limit reached for subscription plan');
      }

      // 🎯 GENERATE UNIQUE WEBHOOK IDENTIFIERS
      const webhookSecret = generateWebhookSecret();
      const clinicSlug = generateClinicSlug(clinicData.name);
      const uniqueWebhookId = generateUniqueWebhookId(tenantId, clinicSlug);

      // 🔗 CONSTRUCT WEBHOOK URLs (this solves the tenant resolution!)
      const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://api.yourdomain.com';
      const webhookUrls = {
        // Primary webhook URL with embedded tenant resolution data
        primary: `${baseUrl}/webhook/${uniqueWebhookId}`,
        
        // Alternative formats for different integrations
        chat: `${baseUrl}/chat/${uniqueWebhookId}`,
        api: `${baseUrl}/api/webhook/${uniqueWebhookId}`,
        
        // Legacy format (with query params for debugging)
        legacy: `${baseUrl}/webhook?clinic=${uniqueWebhookId}&tenant=${tenantId}`
      };

      // Prepare clinic configuration
      const clinic: Omit<MultiTenantClinicConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        tenantId,
        name: clinicData.name,
        slug: clinicSlug,
        contactInfo: clinicData.contactInfo,
        timezone: clinicData.timezone,
        services: clinicData.services,
        businessHours: clinicData.businessHours,
        bookingSystem: {
          type: clinicData.bookingSystem.type,
          apiCredentials: clinicData.bookingSystem.apiCredentials ? 
            await encryptionService.encrypt(JSON.stringify(clinicData.bookingSystem.apiCredentials)) : 
            null,
          webhookSecret,
          isActive: true
        },
        chatConfiguration: {
          welcomeMessage: clinicData.chatConfiguration?.welcomeMessage || 
            `Welcome to ${clinicData.name}! How can I help you today?`,
          fallbackMessage: clinicData.chatConfiguration?.fallbackMessage ||
            "I'm sorry, I didn't understand that. Could you please rephrase your question?",
          endSessionMessage: clinicData.chatConfiguration?.endSessionMessage ||
            "Thank you for choosing our clinic. Have a great day!",
          conversationTimeout: clinicData.chatConfiguration?.conversationTimeout || 30,
          enableAppointmentBooking: clinicData.chatConfiguration?.enableAppointmentBooking !== false,
          enableFAQ: clinicData.chatConfiguration?.enableFAQ !== false,
          enableHumanHandoff: clinicData.chatConfiguration?.enableHumanHandoff !== false
        },
        compliance: {
          hipaaEnabled: tenant.compliance.hipaaRequired,
          gdprEnabled: tenant.compliance.gdprRequired,
          dataRetentionDays: tenant.compliance.hipaaRequired ? 2555 : 365, // 7 years for HIPAA
          auditTrailEnabled: true,
          encryptConversations: true,
          requirePatientConsent: tenant.compliance.hipaaRequired
        },
        webhookUrls,
        webhookIdentifier: uniqueWebhookId,
        isActive: true,
        createdBy: req.userId!
      };

      // Create clinic in database
      const createdClinic = await database.createClinic(clinic);

      // 📊 Store webhook mapping for tenant resolution
      await database.createWebhookMapping({
        webhookId: uniqueWebhookId,
        tenantId,
        clinicId: createdClinic.id,
        webhookSecret,
        urls: webhookUrls,
        isActive: true,
        createdBy: req.userId!
      });

      // 🎉 INSTANT CLINIC ONBOARDING COMPLETE!
      res.status(201).json({
        success: true,
        data: {
          clinic: sanitizeClinic(createdClinic),
          webhookUrls,
          webhookIdentifier: uniqueWebhookId,
          integrationInstructions: generateIntegrationInstructions(webhookUrls, clinicData.name),
          testingInfo: {
            testUrl: `${webhookUrls.primary}/test`,
            secretKey: webhookSecret
          }
        },
        message: '🚀 Clinic created with instant webhook URLs! Ready for immediate deployment.'
      });
    })
  );

  // ============================================================================
  // CLINIC RETRIEVAL & MANAGEMENT
  // ============================================================================

  /**
   * GET /api/tenants/:tenantId/clinics
   * List all clinics for a tenant
   */
  router.get('/:tenantId/clinics',
    [
      param('tenantId').isString(),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 50 }),
      query('active').optional().isBoolean()
    ],
    validateTenantParam(),
    requireTenantAccess(),
    auth.requirePermissions(['clinic:read']),
    asyncHandler(async (req: Request, res: Response) => {
      const tenantId = req.params.tenantId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const activeOnly = req.query.active === 'true';

      const clinics = await database.getClinicsByTenant(tenantId, { page, limit, activeOnly });
      const sanitizedClinics = clinics.map(sanitizeClinic);

      res.json({
        success: true,
        data: {
          clinics: sanitizedClinics,
          pagination: {
            page,
            limit,
            total: clinics.length,
            hasMore: clinics.length === limit
          }
        }
      });
    })
  );

  /**
   * GET /api/tenants/:tenantId/clinics/:clinicId
   * Get specific clinic details with webhook information
   */
  router.get('/:tenantId/clinics/:clinicId',
    [
      param('tenantId').isString(),
      param('clinicId').isString()
    ],
    validateTenantParam(),
    requireTenantAccess(),
    auth.requirePermissions(['clinic:read']),
    asyncHandler(async (req: Request, res: Response) => {
      const { tenantId, clinicId } = req.params;
      
      const clinic = await database.getClinic(clinicId, tenantId);
      if (!clinic) {
        throw createError.notFound('Clinic');
      }

      // Get webhook mapping for complete integration info
      const webhookMapping = await database.getWebhookMapping(clinic.webhookIdentifier);

      res.json({
        success: true,
        data: {
          clinic: sanitizeClinic(clinic),
          webhookInfo: webhookMapping ? {
            urls: webhookMapping.urls,
            identifier: webhookMapping.webhookId,
            isActive: webhookMapping.isActive,
            createdAt: webhookMapping.createdAt
          } : null,
          integrationStatus: {
            webhookActive: clinic.isActive && webhookMapping?.isActive,
            bookingSystemConnected: !!clinic.bookingSystem.apiCredentials,
            lastHealthCheck: null // TODO: Implement health checking
          }
        }
      });
    })
  );

  // ============================================================================
  // WEBHOOK MANAGEMENT
  // ============================================================================

  /**
   * POST /api/tenants/:tenantId/clinics/:clinicId/webhook/regenerate
   * Regenerate webhook URLs (for security or migration)
   */
  router.post('/:tenantId/clinics/:clinicId/webhook/regenerate',
    [
      param('tenantId').isString(),
      param('clinicId').isString(),
      body('reason').optional().isString()
    ],
    validateTenantParam(),
    requireTenantAccess(),
    auth.requirePermissions(['clinic:manage']),
    asyncHandler(async (req: Request, res: Response) => {
      const { tenantId, clinicId } = req.params;
      const { reason } = req.body;

      const clinic = await database.getClinic(clinicId, tenantId);
      if (!clinic) {
        throw createError.notFound('Clinic');
      }

      // Generate new webhook identifiers
      const newWebhookSecret = generateWebhookSecret();
      const newWebhookId = generateUniqueWebhookId(tenantId, clinic.slug);
      
      const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://api.yourdomain.com';
      const newWebhookUrls = {
        primary: `${baseUrl}/webhook/${newWebhookId}`,
        chat: `${baseUrl}/chat/${newWebhookId}`,
        api: `${baseUrl}/api/webhook/${newWebhookId}`,
        legacy: `${baseUrl}/webhook?clinic=${newWebhookId}&tenant=${tenantId}`
      };

      // Update clinic
      await database.updateClinic(clinicId, {
        webhookUrls: newWebhookUrls,
        webhookIdentifier: newWebhookId,
        bookingSystem: {
          ...clinic.bookingSystem,
          webhookSecret: newWebhookSecret
        }
      });

      // Deactivate old webhook mapping
      await database.deactivateWebhookMapping(clinic.webhookIdentifier, req.userId!, reason);

      // Create new webhook mapping
      await database.createWebhookMapping({
        webhookId: newWebhookId,
        tenantId,
        clinicId,
        webhookSecret: newWebhookSecret,
        urls: newWebhookUrls,
        isActive: true,
        createdBy: req.userId!
      });

      res.json({
        success: true,
        data: {
          webhookUrls: newWebhookUrls,
          webhookIdentifier: newWebhookId,
          secretKey: newWebhookSecret,
          previousIdentifier: clinic.webhookIdentifier
        },
        message: 'Webhook URLs regenerated successfully. Please update your integrations.'
      });
    })
  );

  /**
   * GET /api/tenants/:tenantId/clinics/:clinicId/webhook/test
   * Test webhook connectivity
   */
  router.get('/:tenantId/clinics/:clinicId/webhook/test',
    [
      param('tenantId').isString(),
      param('clinicId').isString()
    ],
    validateTenantParam(),
    requireTenantAccess(),
    auth.requirePermissions(['clinic:read']),
    asyncHandler(async (req: Request, res: Response) => {
      const { tenantId, clinicId } = req.params;
      
      const clinic = await database.getClinic(clinicId, tenantId);
      if (!clinic) {
        throw createError.notFound('Clinic');
      }

      // Simulate webhook test
      const testResult = {
        webhookId: clinic.webhookIdentifier,
        urls: clinic.webhookUrls,
        testPayload: {
          message: "Hello! This is a test message.",
          timestamp: new Date().toISOString(),
          source: "webhook_test"
        },
        instructions: `Send a POST request to ${clinic.webhookUrls.primary} with this test payload`
      };

      res.json({
        success: true,
        data: testResult,
        message: 'Webhook test configuration generated'
      });
    })
  );

  return router;
}

// ============================================================================
// 🔧 WEBHOOK GENERATION UTILITIES (Critical for tenant resolution!)
// ============================================================================

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateClinicSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);
}

function generateUniqueWebhookId(tenantId: string, clinicSlug: string): string {
  // Create a unique, decodable webhook identifier
  const timestamp = Date.now().toString(36);
  const tenantPrefix = tenantId.substring(0, 8);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  
  return `${clinicSlug}-${tenantPrefix}-${timestamp}-${randomSuffix}`;
}

function sanitizeClinic(clinic: MultiTenantClinicConfig): any {
  const sanitized = { ...clinic };
  
  // Remove sensitive information
  if (sanitized.bookingSystem) {
    delete sanitized.bookingSystem.webhookSecret;
    delete sanitized.bookingSystem.apiCredentials;
  }

  return sanitized;
}

function generateIntegrationInstructions(webhookUrls: any, clinicName: string): any {
  return {
    quickStart: [
      `1. Copy your primary webhook URL: ${webhookUrls.primary}`,
      `2. Configure your website to send chat messages to this URL`,
      `3. Test the integration using the test endpoint`,
      `4. Go live with instant ${clinicName} chat support!`
    ],
    apiDocumentation: {
      endpoint: webhookUrls.primary,
      method: 'POST',
      contentType: 'application/json',
      examplePayload: {
        message: "I'd like to book an appointment",
        timestamp: new Date().toISOString(),
        sessionId: "session_123",
        metadata: {
          source: "website_chat",
          page: "/services"
        }
      }
    },
    integrationTypes: {
      website: webhookUrls.primary,
      chatWidget: webhookUrls.chat,
      mobileApp: webhookUrls.api,
      legacy: webhookUrls.legacy
    }
  };
} 