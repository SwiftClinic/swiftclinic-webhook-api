/**
 * Mock Multi-Tenant Authentication
 * Temporary implementation for development/testing
 */

import { Request, Response, NextFunction } from 'express';

export class MultiTenantAuth {
  constructor(_database: any, _encryptionService: any) {
    console.log('🔐 Mock MultiTenantAuth initialized');
  }

  async authenticateUser(email: string, password: string, _mfaCode?: string): Promise<any> {
    // Mock authentication - always succeeds in development
    if (email === 'admin@example.com' && password === 'password') {
      return {
        success: true,
        token: 'mock-jwt-token-' + Date.now(),
        user: {
          id: 'user_admin',
          email: email,
          role: 'super_admin',
          permissions: ['system:monitor', 'tenant:manage', 'clinic:manage', 'user:read', 'analytics:read', 'compliance:read']
        },
        tenant: null, // Super admin has no specific tenant
        requiresMfa: false,
        sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };
    }

    return {
      success: false,
      message: 'Invalid credentials'
    };
  }

  async invalidateSession(authHeader: string): Promise<void> {
    console.log('🔓 Session invalidated:', authHeader.substring(0, 20) + '...');
  }

  authenticateRequest() {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Mock authentication - set admin user for all requests
      req.userId = 'user_admin';
      req.tenantId = 'system';
      req.sessionId = 'session_mock_' + Date.now();
      req.permissions = ['system:monitor', 'tenant:manage', 'clinic:manage', 'user:read', 'analytics:read', 'compliance:read'];
      
      next();
    };
  }

  requirePermissions(requiredPermissions: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Mock permission check - always allow in development
      const userPermissions = req.permissions || [];
      const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
      
      if (!hasPermission) {
        console.warn(`⚠️ Mock auth: Missing permissions ${requiredPermissions.join(', ')}`);
        // In development, we'll allow it but log a warning
      }
      
      next();
    };
  }

  requireRole(allowedRoles: string[]) {
    return (_req: Request, _res: Response, next: NextFunction) => {
      // Mock role check - always allow in development
      console.log(`🎭 Mock auth: Role check for ${allowedRoles.join(', ')}`);
      next();
    };
  }

  requireClinicAccess(clinicIdParam: string = 'clinicId') {
    return (_req: Request, _res: Response, next: NextFunction) => {
      // Mock clinic access check - always allow in development
      console.log(`🏥 Mock auth: Clinic access check for ${clinicIdParam}`);
      next();
    };
  }

  hipaaAuditLog(accessType: string, accessReason: string) {
    return (_req: Request, _res: Response, next: NextFunction) => {
      // Mock HIPAA audit logging
      console.log(`📋 Mock HIPAA audit: ${accessType} - ${accessReason}`);
      next();
    };
  }
} 