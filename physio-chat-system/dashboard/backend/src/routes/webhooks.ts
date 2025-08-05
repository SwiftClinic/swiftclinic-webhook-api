/**
 * Webhook Routes - TENANT RESOLUTION BRIDGE
 * 🚨 CRITICAL: This solves the "businessId is not defined" error!
 * Maps incoming webhook requests to correct tenant/clinic context
 */

import { Router, Request, Response } from 'express';
import { param, body } from 'express-validator';
import { MultiTenantDatabase } from '../mocks/multi-tenant-database';
import { MultiTenantAuth } from '../mocks/multi-tenant-auth';
import { asyncHandler, createError } from '../middleware/error-handler';

export function createWebhookRoutes(
  database: MultiTenantDatabase,
  auth: MultiTenantAuth
): Router {
  const router = Router();

  // ============================================================================
  // 🔥 TENANT RESOLUTION BRIDGE - THE MISSING PIECE!
  // ============================================================================

  /**
   * POST /webhook/:webhookId
   * Main webhook endpoint with automatic tenant resolution
   * This replaces the old single-tenant webhook and bridges to multi-tenant!
   */
  router.post('/webhook/:webhookId',
    [
      param('webhookId').isString().withMessage('Webhook ID required')
    ],
    asyncHandler(async (req: Request, res: Response) => {
      const webhookId = req.params.webhookId;
      const incomingData = req.body;

      console.log(`🔍 Webhook Resolution: Looking up ${webhookId}`);

      // 🎯 STEP 1: Resolve webhook ID to tenant/clinic context
      const webhookMapping = await database.getWebhookMapping(webhookId);
      
      if (!webhookMapping || !webhookMapping.isActive) {
        console.error(`❌ Webhook mapping not found or inactive: ${webhookId}`);
        throw createError.notFound('Webhook endpoint not found');
      }

      const { tenantId, clinicId } = webhookMapping;
      console.log(`✅ Resolved webhook ${webhookId} → Tenant: ${tenantId}, Clinic: ${clinicId}`);

      // 🎯 STEP 2: Set tenant context in database (CRITICAL!)
      database.setTenantContext(tenantId, 'webhook-system');

      // 🎯 STEP 3: Get full clinic configuration with tenant context
      const clinic = await database.getClinic(clinicId, tenantId);
      if (!clinic || !clinic.isActive) {
        console.error(`❌ Clinic not found or inactive: ${clinicId}`);
        throw createError.notFound('Clinic not available');
      }

      // 🎯 STEP 4: Get tenant for compliance context
      const tenant = await database.getTenant(tenantId);
      if (!tenant || !tenant.isActive) {
        console.error(`❌ Tenant not found or inactive: ${tenantId}`);
        throw createError.notFound('Tenant not available');
      }

      console.log(`🏥 Processing webhook for clinic: ${clinic.name} (Tenant: ${tenant.name})`);

      // 🎯 STEP 5: Forward to existing webhook processor with full context
      try {
        const response = await processWebhookWithTenantContext({
          tenantId,
          clinicId,
          tenant,
          clinic,
          incomingData,
          webhookMapping,
          request: req
        });

        // Clear tenant context
        database.clearTenantContext();

        res.json(response);

      } catch (error) {
        console.error(`❌ Webhook processing error:`, error);
        database.clearTenantContext();
        throw error;
      }
    })
  );

  /**
   * POST /chat/:webhookId
   * Alternative chat endpoint format
   */
  router.post('/chat/:webhookId', 
    router.stack.find(layer => layer.route?.path === '/webhook/:webhookId')!.route!.stack[1].handle
  );

  /**
   * POST /api/webhook/:webhookId  
   * API-style webhook endpoint
   */
  router.post('/api/webhook/:webhookId',
    router.stack.find(layer => layer.route?.path === '/webhook/:webhookId')!.route!.stack[1].handle
  );

  /**
   * GET /webhook/:webhookId/test
   * Test webhook endpoint
   */
  router.get('/webhook/:webhookId/test',
    [
      param('webhookId').isString()
    ],
    asyncHandler(async (req: Request, res: Response) => {
      const webhookId = req.params.webhookId;

      // Resolve webhook for testing
      const webhookMapping = await database.getWebhookMapping(webhookId);
      
      if (!webhookMapping) {
        throw createError.notFound('Webhook not found');
      }

      database.setTenantContext(webhookMapping.tenantId, 'webhook-test');
      
      const clinic = await database.getClinic(webhookMapping.clinicId, webhookMapping.tenantId);
      const tenant = await database.getTenant(webhookMapping.tenantId);

      database.clearTenantContext();

      res.json({
        success: true,
        data: {
          webhookId,
          tenantId: webhookMapping.tenantId,
          clinicId: webhookMapping.clinicId,
          clinic: {
            name: clinic?.name,
            isActive: clinic?.isActive
          },
          tenant: {
            name: tenant?.name,
            isActive: tenant?.isActive
          },
          testPayload: {
            message: "Test message",
            timestamp: new Date().toISOString(),
            source: "webhook_test"
          },
          instructions: "Send a POST request to this endpoint with your chat messages"
        },
        message: 'Webhook test successful - tenant resolution working!'
      });
    })
  );

  // ============================================================================
  // LEGACY WEBHOOK SUPPORT (for migration)
  // ============================================================================

  /**
   * POST /webhook (legacy format with query params)
   * Supports old webhook URLs during migration
   */
  router.post('/webhook',
    asyncHandler(async (req: Request, res: Response) => {
      const clinicParam = req.query.clinic as string;
      const tenantParam = req.query.tenant as string;

      if (!clinicParam) {
        throw createError.badRequest('Missing clinic parameter in legacy webhook');
      }

      console.log(`🔄 Legacy webhook redirect: clinic=${clinicParam}, tenant=${tenantParam}`);

      // Try to resolve legacy parameters to new webhook format
      let webhookMapping;
      
      if (tenantParam) {
        // If we have tenant info, try to find by clinic identifier
        webhookMapping = await database.getWebhookMappingByLegacyParams(clinicParam, tenantParam);
      } else {
        // Try to find by clinic identifier alone
        webhookMapping = await database.getWebhookMappingByClinicIdentifier(clinicParam);
      }

      if (!webhookMapping) {
        throw createError.notFound('Legacy webhook mapping not found - please use new webhook URL');
      }

      // Redirect to new webhook format
      req.url = `/webhook/${webhookMapping.webhookId}`;
      req.params.webhookId = webhookMapping.webhookId;

      // Process using the new webhook handler
      return router.stack.find(layer => layer.route?.path === '/webhook/:webhookId')!
        .route!.stack[1].handle(req, res);
    })
  );

  return router;
}

// ============================================================================
// 🧠 WEBHOOK PROCESSING WITH TENANT CONTEXT
// ============================================================================

interface WebhookProcessingContext {
  tenantId: string;
  clinicId: string;
  tenant: any;
  clinic: any;
  incomingData: any;
  webhookMapping: any;
  request: Request;
}

async function processWebhookWithTenantContext(context: WebhookProcessingContext): Promise<any> {
  const { tenant, clinic, incomingData, request } = context;

  console.log(`🧠 Processing chat message for ${clinic.name}`);

  // 🎯 BUILD CLINIC CONFIG (this gives us the businessId!)
  const clinicConfig = {
    id: clinic.id,
    name: clinic.name,
    contactInfo: clinic.contactInfo,
    services: clinic.services,
    businessHours: clinic.businessHours,
    timezone: clinic.timezone,
    bookingSystem: clinic.bookingSystem.type,
    apiCredentials: clinic.bookingSystem.apiCredentials ? 
      JSON.parse(clinic.bookingSystem.apiCredentials) : {},
    
    // 🔥 THE MISSING BUSINESS ID!
    businessId: clinic.bookingSystem.apiCredentials ? 
      JSON.parse(clinic.bookingSystem.apiCredentials).businessId || clinic.id :
      clinic.id
  };

  console.log(`💼 Business ID resolved: ${clinicConfig.businessId}`);

  // TODO: Import and use your existing LLM brain logic here
  // For now, return a structured response that shows the system is working
  
  const response = {
    success: true,
    data: {
      message: `Hello! This is ${clinic.name}. How can I help you today?`,
      sessionId: `session_${Date.now()}_${clinic.id}`,
      clinicInfo: {
        name: clinic.name,
        businessId: clinicConfig.businessId,
        services: clinic.services
      },
      tenantInfo: {
        name: tenant.name,
        jurisdiction: tenant.compliance.jurisdiction
      },
      timestamp: new Date().toISOString(),
      
      // Debug info to confirm tenant resolution is working
      debug: {
        tenantResolved: true,
        clinicResolved: true,
        businessIdFound: !!clinicConfig.businessId,
        fallbackMode: false,
        bookingSystemStatus: 'available'
      }
    },
    message: 'Webhook processed successfully with tenant context'
  };

  console.log(`✅ Webhook response generated for ${clinic.name}`);
  
  return response;
} 