/**
 * Authentication Routes
 * Enterprise-grade authentication for admin dashboard
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { MultiTenantDatabase } from '../mocks/multi-tenant-database';
import { MultiTenantAuth } from '../mocks/multi-tenant-auth';
import { asyncHandler, createError } from '../middleware/error-handler';

export function createAuthRoutes(
  auth: MultiTenantAuth,
  database: MultiTenantDatabase
): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Admin authentication
   */
  router.post('/login',
    [
      body('email').isEmail().withMessage('Valid email required'),
      body('password').isLength({ min: 8 }).withMessage('Password required'),
      body('mfaCode').optional().isLength({ min: 6, max: 6 })
    ],
    asyncHandler(async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createError.validation('Invalid credentials', errors.array());
      }

      const { email, password, mfaCode } = req.body;

      // Authenticate user
      const authResult = await auth.authenticateUser(email, password, mfaCode);

      if (!authResult.success) {
        throw createError.unauthorized(authResult.message);
      }

      res.json({
        success: true,
        data: {
          token: authResult.token,
          user: {
            id: authResult.user!.id,
            email: authResult.user!.email,
            role: authResult.user!.role,
            permissions: authResult.user!.permissions
          },
          tenant: authResult.tenant ? {
            id: authResult.tenant.id,
            name: authResult.tenant.name,
            slug: authResult.tenant.slug
          } : null,
          requiresMfa: authResult.requiresMfa,
          sessionExpiresAt: authResult.sessionExpiresAt
        },
        message: 'Authentication successful'
      });
    })
  );

  /**
   * POST /api/auth/logout
   * Logout and invalidate session
   */
  router.post('/logout',
    auth.authenticateRequest(),
    asyncHandler(async (req: Request, res: Response) => {
      await auth.invalidateSession(req.headers.authorization!);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    })
  );

  /**
   * GET /api/auth/me
   * Get current user information
   */
  router.get('/me',
    auth.authenticateRequest(),
    asyncHandler(async (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          user: {
            id: req.userId,
            tenantId: req.tenantId,
            permissions: req.permissions
          }
        }
      });
    })
  );

  return router;
} 