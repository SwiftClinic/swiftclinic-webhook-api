import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebase';
import { EncryptionService } from '../../../../shared/security/encryption';
import { APIResponse } from '../../../../shared/types';
import { asyncErrorHandler } from '../middleware/errorHandler';

const createWebhookRoutes = (firebaseService: FirebaseService, encryptionService: EncryptionService) => {
  const router = Router();

  // Get all webhooks
  router.get('/', asyncErrorHandler(async (req: Request, res: Response) => {
    const clinicId = req.query.clinicId as string;
    const webhooks = await firebaseService.getWebhooks(clinicId);
    
    const response: APIResponse<any[]> = {
      success: true,
      data: webhooks.map(webhook => ({
        id: webhook.id,
        clinicId: webhook.clinicId,
        name: webhook.name,
        url: webhook.url,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt.toDate(),
        lastTriggered: webhook.lastTriggered?.toDate()
      })),
      timestamp: new Date()
    };
    res.json(response);
  }));

  // Create new webhook
  router.post('/', asyncErrorHandler(async (req: Request, res: Response) => {
    const { clinicId, name, url } = req.body;
    
    if (!clinicId || !name || !url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clinicId, name, and url are required'
        },
        timestamp: new Date()
      });
    }

    const webhookId = await firebaseService.createWebhook({
      clinicId,
      name,
      url,
      isActive: true
    });

    const response: APIResponse<{ id: string }> = {
      success: true,
      data: { id: webhookId },
      timestamp: new Date()
    };
    return res.status(201).json(response);
  }));

  // Test webhook
  router.post('/:id/test', asyncErrorHandler(async (req: Request, res: Response) => {
    const webhookId = req.params.id;
    
    // Update last triggered timestamp
    await firebaseService.updateWebhookLastTriggered(webhookId);
    
    const response: APIResponse<{ message: string }> = {
      success: true,
      data: { message: 'Webhook test completed successfully' },
      timestamp: new Date()
    };
    res.json(response);
  }));

  // Delete webhook
  router.delete('/:id', asyncErrorHandler(async (req: Request, res: Response) => {
    const webhookId = req.params.id;
    await firebaseService.deleteWebhook(webhookId);
    
    const response: APIResponse<{ message: string }> = {
      success: true,
      data: { message: 'Webhook deleted successfully' },
      timestamp: new Date()
    };
    res.json(response);
  }));

  return router;
};

export default createWebhookRoutes; 