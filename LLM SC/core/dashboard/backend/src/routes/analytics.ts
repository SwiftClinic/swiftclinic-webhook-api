import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebase';
import { EncryptionService } from '../../../../shared/security/encryption';
import { APIResponse } from '../../../../shared/types';
import { asyncErrorHandler } from '../middleware/errorHandler';

const createAnalyticsRoutes = (firebaseService: FirebaseService, encryptionService: EncryptionService) => {
  const router = Router();

  // Get dashboard analytics
  router.get('/dashboard', asyncErrorHandler(async (req: Request, res: Response) => {
    const stats = await firebaseService.getDashboardStats();
    
    const response: APIResponse<any> = {
      success: true,
      data: stats,
      timestamp: new Date()
    };
    res.json(response);
  }));

  // Get analytics for specific clinic
  router.get('/:clinicId', asyncErrorHandler(async (req: Request, res: Response) => {
    const clinicId = req.params.clinicId;
    const { startDate, endDate } = req.query;
    
    const analytics = await firebaseService.getAnalytics(
      clinicId,
      startDate as string,
      endDate as string
    );
    
    const response: APIResponse<any[]> = {
      success: true,
      data: analytics.map(record => ({
        id: record.id,
        clinicId: record.clinicId,
        date: record.date,
        totalConversations: record.totalConversations,
        totalBookings: record.totalBookings,
        avgResponseTime: record.avgResponseTime,
        clientSatisfaction: record.clientSatisfaction,
        createdAt: record.createdAt.toDate()
      })),
      timestamp: new Date()
    };
    res.json(response);
  }));

  // Record analytics data
  router.post('/', asyncErrorHandler(async (req: Request, res: Response) => {
    const {
      clinicId,
      date,
      totalConversations,
      totalBookings,
      avgResponseTime,
      clientSatisfaction
    } = req.body;

    if (!clinicId || !date) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clinicId and date are required'
        },
        timestamp: new Date()
      });
    }

    const analyticsId = await firebaseService.recordAnalytics({
      clinicId,
      date,
      totalConversations: totalConversations || 0,
      totalBookings: totalBookings || 0,
      avgResponseTime: avgResponseTime || 0,
      clientSatisfaction: clientSatisfaction || 0
    });

    const response: APIResponse<{ id: string }> = {
      success: true,
      data: { id: analyticsId },
      timestamp: new Date()
    };
    return res.status(201).json(response);
  }));

  return router;
};

export default createAnalyticsRoutes; 