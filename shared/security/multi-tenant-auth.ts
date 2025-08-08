/**
 * Multi-Tenant Authentication & Authorization
 * Provides enterprise-grade security with tenant isolation and compliance
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { EncryptionService } from './encryption';
import { MultiTenantDatabase } from '../database/multi-tenant-database';
import {
  TenantUser,
  TenantRole,
  Permission,
  Tenant,
  AuditEventType
} from '../types/multi-tenant';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      user?: TenantUser;
      tenantId?: string;
      userId?: string;
      permissions?: Permission[];
      clientIp?: string;
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      complianceContext?: {
        hipaaRequired: boolean;
        gdprRequired: boolean;
        auditRequired: boolean;
      };
    }
  }
}

export interface AuthenticationResult {
  success: boolean;
  user?: TenantUser;
  tenant?: Tenant;
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  error?: string;
  riskAssessment?: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    requiresAdditionalAuth?: boolean;
  };
}

export class MultiTenantAuth {
  private database: MultiTenantDatabase;
  private encryptionService: EncryptionService;
  private jwtSecret: string;

  constructor(database: MultiTenantDatabase, encryptionService: EncryptionService) {
    this.database = database;
    this.encryptionService = encryptionService;
    this.jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-change-in-production';
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Authenticate user with email/password
   */
  async authenticate(
    email: string,
    password: string,
    tenantSlug: string,
    clientIp: string,
    userAgent: string,
    mfaToken?: string
  ): Promise<AuthenticationResult> {
    const startTime = Date.now();

    try {
      // Get tenant by slug
      const tenant = await this.getTenantBySlug(tenantSlug);
      if (!tenant) {
        await this.logSecurityEvent('user_login_failed', null, clientIp, userAgent, {
          reason: 'invalid_tenant',
          tenantSlug,
          email
        });
        return { success: false, error: 'Invalid tenant or credentials' };
      }

      // Get user by email within tenant
      const user = await this.getUserByEmail(tenant.id, email);
      if (!user) {
        await this.logSecurityEvent('user_login_failed', tenant.id, clientIp, userAgent, {
          reason: 'invalid_user',
          email
        });
        return { success: false, error: 'Invalid tenant or credentials' };
      }

      // Check if account is locked
      if (user.lockedUntil && new Date() < user.lockedUntil) {
        await this.logSecurityEvent('user_login_failed', tenant.id, clientIp, userAgent, {
          reason: 'account_locked',
          userId: user.id,
          lockedUntil: user.lockedUntil
        });
        return { success: false, error: 'Account is temporarily locked' };
      }

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        await this.incrementLoginAttempts(user);
        await this.logSecurityEvent('user_login_failed', tenant.id, clientIp, userAgent, {
          reason: 'invalid_password',
          userId: user.id,
          attempts: user.loginAttempts + 1
        });
        return { success: false, error: 'Invalid tenant or credentials' };
      }

      // Check MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaToken) {
          return { 
            success: false, 
            mfaRequired: true, 
            error: 'MFA token required' 
          };
        }

        const mfaValid = await this.verifyMFAToken(user, mfaToken);
        if (!mfaValid) {
          await this.logSecurityEvent('user_login_failed', tenant.id, clientIp, userAgent, {
            reason: 'invalid_mfa',
            userId: user.id
          });
          return { success: false, error: 'Invalid MFA token' };
        }
      }

      // Risk assessment
      const riskAssessment = await this.assessLoginRisk(user, tenant, clientIp, userAgent);

      // Check if additional authentication is required
      if (riskAssessment.requiresAdditionalAuth) {
        return {
          success: false,
          error: 'Additional authentication required',
          riskAssessment
        };
      }

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(user, tenant);

      // Reset login attempts and update last login
      await this.resetLoginAttempts(user);
      await this.updateLastLogin(user);

      // Log successful login
      await this.logSecurityEvent('user_login', tenant.id, clientIp, userAgent, {
        userId: user.id,
        riskLevel: riskAssessment.level,
        processingTimeMs: Date.now() - startTime
      });

      return {
        success: true,
        user,
        tenant,
        accessToken,
        refreshToken,
        riskAssessment
      };

    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication service unavailable' };
    }
  }

  /**
   * Verify JWT token and extract tenant/user context
   */
  async verifyToken(token: string): Promise<{ user: TenantUser; tenant: Tenant } | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      const tenant = await this.database.getTenant(decoded.tenantId);
      if (!tenant || !tenant.isActive) {
        return null;
      }

      const user = await this.getUserById(decoded.tenantId, decoded.userId);
      if (!user || !user.isActive) {
        return null;
      }

      return { user, tenant };
    } catch (error) {
      return null;
    }
  }

  // ============================================================================
  // AUTHORIZATION MIDDLEWARE
  // ============================================================================

  /**
   * Middleware to authenticate requests and set tenant context
   */
  authenticateRequest() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          return res.status(401).json({
            success: false,
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication token required' }
          });
        }

        const authResult = await this.verifyToken(token);
        if (!authResult) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
          });
        }

        // Set request context
        req.user = authResult.user;
        req.tenant = authResult.tenant;
        req.tenantId = authResult.tenant.id;
        req.userId = authResult.user.id;
        req.permissions = authResult.user.permissions;
        req.clientIp = this.getClientIp(req);

        // Set compliance context
        req.complianceContext = {
          hipaaRequired: authResult.tenant.compliance.hipaaRequired,
          gdprRequired: authResult.tenant.compliance.gdprRequired,
          auditRequired: authResult.tenant.compliance.hipaaRequired || authResult.tenant.compliance.gdprRequired
        };

        // Set database tenant context
        this.database.setTenantContext(authResult.tenant.id, authResult.user.id);

        next();
      } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({
          success: false,
          error: { code: 'AUTHENTICATION_ERROR', message: 'Authentication service error' }
        });
      }
    };
  }

  /**
   * Middleware to check specific permissions
   */
  requirePermissions(requiredPermissions: Permission[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !req.permissions) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' }
        });
      }

      const hasPermissions = requiredPermissions.every(permission => 
        req.permissions!.includes(permission)
      );

      if (!hasPermissions) {
        // Log authorization failure
        this.logSecurityEvent('access_denied', req.tenantId!, req.clientIp!, req.get('User-Agent') || '', {
          userId: req.userId,
          requiredPermissions,
          userPermissions: req.permissions,
          resource: req.path
        });

        return res.status(403).json({
          success: false,
          error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' }
        });
      }

      next();
    };
  }

  /**
   * Middleware to check role-based access
   */
  requireRole(allowedRoles: TenantRole[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' }
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        this.logSecurityEvent('access_denied', req.tenantId!, req.clientIp!, req.get('User-Agent') || '', {
          userId: req.userId,
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          resource: req.path
        });

        return res.status(403).json({
          success: false,
          error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient role privileges' }
        });
      }

      next();
    };
  }

  /**
   * Middleware to validate clinic access
   */
  requireClinicAccess(clinicIdParam: string = 'clinicId') {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' }
        });
      }

      const clinicId = req.params[clinicIdParam];
      if (!clinicId) {
        return res.status(400).json({
          success: false,
          error: { code: 'CLINIC_ID_REQUIRED', message: 'Clinic ID is required' }
        });
      }

      // Check if user has access to this clinic
      const hasAccess = req.user.clinicAccess.includes(clinicId) || 
                       ['tenant_owner', 'tenant_admin'].includes(req.user.role);

      if (!hasAccess) {
        this.logSecurityEvent('access_denied', req.tenantId!, req.clientIp!, req.get('User-Agent') || '', {
          userId: req.userId,
          clinicId,
          userClinicAccess: req.user.clinicAccess,
          resource: req.path
        });

        return res.status(403).json({
          success: false,
          error: { code: 'CLINIC_ACCESS_DENIED', message: 'Access to this clinic is not allowed' }
        });
      }

      next();
    };
  }

  // ============================================================================
  // COMPLIANCE & AUDIT MIDDLEWARE
  // ============================================================================

  /**
   * Middleware for HIPAA audit logging
   */
  hipaaAuditLog(accessType: 'view' | 'create' | 'update' | 'delete' | 'export', accessReason: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.complianceContext?.hipaaRequired) {
        return next();
      }

      // Log HIPAA access
      const hipaaLog = {
        tenantId: req.tenantId!,
        clinicId: req.params.clinicId || '',
        userId: req.userId!,
        accessType,
        accessReason,
        accessJustification: req.headers['x-access-justification'] as string,
        ipAddress: req.clientIp!,
        userAgent: req.get('User-Agent') || '',
        applicationUsed: 'webhook-api',
        dataElements: [req.path],
        minimumNecessary: true
      };

      // Store for later logging (after response)
      res.locals.hipaaLog = hipaaLog;

      next();
    };
  }

  // ============================================================================
  // RISK ASSESSMENT
  // ============================================================================

  private async assessLoginRisk(
    user: TenantUser,
    tenant: Tenant,
    clientIp: string,
    userAgent: string
  ): Promise<{
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    requiresAdditionalAuth?: boolean;
  }> {
    const factors: string[] = [];
    let riskScore = 0;

    // Check unusual login time
    const now = new Date();
    const hour = now.getHours();
    if (hour < 6 || hour > 22) {
      factors.push('unusual_time');
      riskScore += 10;
    }

    // Check if IP is new/different
    const isNewIp = await this.isNewIpForUser(user.id, clientIp);
    if (isNewIp) {
      factors.push('new_ip_address');
      riskScore += 20;
    }

    // Check failed attempts in last hour
    const recentFailures = await this.getRecentFailedAttempts(user.id);
    if (recentFailures > 3) {
      factors.push('recent_failed_attempts');
      riskScore += 30;
    }

    // Check if tenant has high security requirements
    if (tenant.security.encryptionLevel === 'enterprise') {
      riskScore += 5; // Higher baseline for enterprise
    }

    // Check compliance requirements
    if (tenant.compliance.hipaaRequired && !user.hipaaTrainingCompleted) {
      factors.push('hipaa_training_missing');
      riskScore += 25;
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore < 15) {
      level = 'low';
    } else if (riskScore < 35) {
      level = 'medium';
    } else if (riskScore < 60) {
      level = 'high';
    } else {
      level = 'critical';
    }

    return {
      level,
      factors,
      requiresAdditionalAuth: level === 'critical' || (level === 'high' && !user.mfaEnabled)
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  private getClientIp(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           '127.0.0.1';
  }

  private generateTokens(user: TenantUser, tenant: Tenant): { accessToken: string; refreshToken: string } {
    const payload = {
      userId: user.id,
      tenantId: tenant.id,
      role: user.role,
      permissions: user.permissions
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, this.jwtSecret, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  private async verifyMFAToken(user: TenantUser, token: string): Promise<boolean> {
    if (!user.mfaSecret) return false;

    const decryptedSecret = this.encryptionService.decrypt(user.mfaSecret);
    return speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 2
    });
  }

  private async logSecurityEvent(
    eventType: AuditEventType,
    tenantId: string | null,
    ipAddress: string,
    userAgent: string,
    details: any
  ): Promise<void> {
    if (!tenantId) return;

    await this.database.logAuditEvent({
      tenantId,
      userId: details.userId,
      eventType,
      eventCategory: 'security',
      action: eventType,
      resource: 'authentication',
      ipAddress,
      userAgent,
      dataTypes: ['user_data'],
      dataClassification: 'confidential',
      piiInvolved: true,
      phiInvolved: false,
      success: !eventType.includes('failed'),
      riskLevel: details.riskLevel || 'medium',
      complianceFlags: [eventType],
      additionalData: details
    });
  }

  // Placeholder methods - implement based on your database design
  private async getTenantBySlug(slug: string): Promise<Tenant | null> {
    // Implementation depends on your database structure
    return null;
  }

  private async getUserByEmail(tenantId: string, email: string): Promise<TenantUser | null> {
    // Implementation depends on your database structure
    return null;
  }

  private async getUserById(tenantId: string, userId: string): Promise<TenantUser | null> {
    // Implementation depends on your database structure
    return null;
  }

  private async incrementLoginAttempts(user: TenantUser): Promise<void> {
    // Implementation depends on your database structure
  }

  private async resetLoginAttempts(user: TenantUser): Promise<void> {
    // Implementation depends on your database structure
  }

  private async updateLastLogin(user: TenantUser): Promise<void> {
    // Implementation depends on your database structure
  }

  private async isNewIpForUser(userId: string, ip: string): Promise<boolean> {
    // Check if this IP has been used by this user before
    return false;
  }

  private async getRecentFailedAttempts(userId: string): Promise<number> {
    // Get failed login attempts in the last hour
    return 0;
  }
} 