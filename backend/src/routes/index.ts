import { Application } from 'express';
import { FirebaseService } from '../services/firebase';
import { EncryptionService } from '../../../shared/security/encryption';
import { createClinicRoutes } from './clinics';
import knowledgeBaseRoutes from './knowledgeBase';
import webhookRoutes from './webhooks';
import analyticsRoutes from './analytics';

/**
 * Setup all API routes for the dashboard
 */
export const setupRoutes = (
  app: Application, 
  firebaseService: FirebaseService, 
  encryptionService: EncryptionService
): void => {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0',
        uptime: process.uptime()
      }
    });
  });

  // Dashboard stats endpoint
  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const stats = await firebaseService.getDashboardStats();
      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FETCH_ERROR',
          message: error.message
        },
        timestamp: new Date()
      });
    }
  });

  // Mount route modules
  app.use('/api/clinics', createClinicRoutes(firebaseService, encryptionService));
  app.use('/api/knowledge-base', knowledgeBaseRoutes(firebaseService, encryptionService));
  app.use('/api/webhooks', webhookRoutes(firebaseService, encryptionService));
  app.use('/api/analytics', analyticsRoutes(firebaseService, encryptionService));
};

export default setupRoutes; 