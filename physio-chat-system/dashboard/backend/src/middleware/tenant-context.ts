/**
 * Tenant Context Middleware
 * Handles tenant context management for multi-tenant operations
 */

import { Request, Response, NextFunction } from 'express';
import { MultiTenantDatabase } from '../../../../LLM SC/core/shared/database/multi-tenant-database';

// Extend global Request interface
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
      sessionId?: string;
      permissions?: string[];
      complianceContext?: {
        hipaaRequired: boolean;
        gdprRequired: boolean;
        auditRequired: boolean;
      };
    }
  }
}

export function tenantContextMiddleware(database: MultiTenantDatabase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Set tenant context in database if available
      if (req.tenantId) {
        database.setTenantContext(req.tenantId, req.userId);
      }

      // Generate session ID if not present
      if (!req.sessionId) {
        req.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Add compliance context headers for frontend
      if (req.complianceContext) {
        res.setHeader('X-HIPAA-Required', req.complianceContext.hipaaRequired.toString());
        res.setHeader('X-GDPR-Required', req.complianceContext.gdprRequired.toString());
        res.setHeader('X-Audit-Required', req.complianceContext.auditRequired.toString());
      }

      // Add tenant information to response headers (for debugging)
      if (process.env.NODE_ENV === 'development') {
        if (req.tenantId) {
          res.setHeader('X-Tenant-ID', req.tenantId);
        }
        if (req.userId) {
          res.setHeader('X-User-ID', req.userId);
        }
      }

      next();
    } catch (error) {
      console.error('Tenant context middleware error:', error);
      next(error);
    }
  };
}

/**
 * Middleware to validate tenant access for specific routes
 */
export function requireTenantAccess() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TENANT_REQUIRED',
          message: 'Tenant context is required for this operation'
        }
      });
    }

    next();
  };
}

/**
 * Middleware to validate tenant parameter matches authenticated tenant
 */
export function validateTenantParam(paramName: string = 'tenantId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const urlTenantId = req.params[paramName];
    
    if (!urlTenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TENANT_ID_REQUIRED',
          message: `Tenant ID parameter '${paramName}' is required`
        }
      });
    }

    // For authenticated requests, ensure URL tenant matches auth tenant
    if (req.tenantId && req.tenantId !== urlTenantId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: 'Tenant ID in URL does not match authenticated tenant'
        }
      });
    }

    // Set tenant ID if not already set (for public endpoints)
    if (!req.tenantId) {
      req.tenantId = urlTenantId;
    }

    next();
  };
}

/**
 * Middleware to clear tenant context (for cleanup)
 */
export function clearTenantContext(database: MultiTenantDatabase) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Clear database context on response finish
    res.on('finish', () => {
      database.clearTenantContext();
    });

    next();
  };
} 