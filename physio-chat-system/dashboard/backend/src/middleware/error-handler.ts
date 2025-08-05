/**
 * Enterprise Error Handler
 * Provides secure error handling with comprehensive audit logging
 */

import { Request, Response, NextFunction } from 'express';
import { MultiTenantDatabase } from '../../../../LLM SC/core/shared/database/multi-tenant-database';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  details?: any;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;
  public details: any;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(database: MultiTenantDatabase) {
  return async (error: AppError, req: Request, res: Response, next: NextFunction) => {
    // Set default error values
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let isOperational = error.isOperational !== undefined ? error.isOperational : false;

    // Get client information
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '127.0.0.1';
    
    const userAgent = req.get('User-Agent') || 'Unknown';

    // Determine error classification
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let complianceFlags: string[] = ['api_error'];

    if (statusCode >= 500) {
      riskLevel = 'high';
      complianceFlags.push('server_error');
    } else if (statusCode === 401 || statusCode === 403) {
      riskLevel = 'medium';
      complianceFlags.push('authentication_error');
    } else if (statusCode === 429) {
      riskLevel = 'medium';
      complianceFlags.push('rate_limit_exceeded');
    } else {
      riskLevel = 'low';
      complianceFlags.push('client_error');
    }

    // Check for security-related errors
    if (message.includes('access denied') || message.includes('unauthorized') || message.includes('forbidden')) {
      riskLevel = 'high';
      complianceFlags.push('security_violation');
    }

    // Check for compliance-related errors
    if (message.includes('GDPR') || message.includes('HIPAA') || message.includes('compliance')) {
      riskLevel = 'critical';
      complianceFlags.push('compliance_violation');
    }

    // Log error to audit system
    try {
      await database.logAuditEvent({
        tenantId: req.tenantId || 'system',
        userId: req.userId,
        sessionId: req.sessionId,
        eventType: 'security_incident',
        eventCategory: 'security',
        action: 'api_error',
        resource: req.path,
        resourceId: req.params.id,
        ipAddress: clientIp,
        userAgent,
        dataTypes: ['system_logs'],
        dataClassification: statusCode >= 500 ? 'restricted' : 'internal',
        piiInvolved: false,
        phiInvolved: false,
        success: false,
        errorCode: statusCode.toString(),
        errorMessage: message,
        riskLevel,
        complianceFlags,
        reviewRequired: riskLevel === 'critical' || statusCode >= 500,
        additionalData: {
          method: req.method,
          url: req.url,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          details: error.details,
          isOperational
        }
      });
    } catch (auditError) {
      console.error('Failed to log error to audit system:', auditError);
    }

    // Log error to console (for development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Details:', {
        message: error.message,
        statusCode,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: clientIp,
        user: req.userId,
        tenant: req.tenantId
      });
    }

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation failed';
    } else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid data format';
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Authentication token expired';
    } else if (error.message.includes('duplicate key')) {
      statusCode = 409;
      message = 'Resource already exists';
    }

    // Prepare error response
    const errorResponse: any = {
      success: false,
      error: {
        code: getErrorCode(statusCode),
        message: isOperational ? message : 'Internal Server Error',
        timestamp: new Date().toISOString()
      }
    };

    // Add additional details in development
    if (process.env.NODE_ENV === 'development' && isOperational) {
      errorResponse.error.details = error.details;
      errorResponse.error.path = req.path;
      errorResponse.error.method = req.method;
    }

    // Add request ID for tracking
    if (req.headers['x-request-id']) {
      errorResponse.error.requestId = req.headers['x-request-id'];
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
  };
}

function getErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'VALIDATION_ERROR';
    case 429: return 'RATE_LIMITED';
    case 500: return 'INTERNAL_ERROR';
    case 502: return 'BAD_GATEWAY';
    case 503: return 'SERVICE_UNAVAILABLE';
    case 504: return 'GATEWAY_TIMEOUT';
    default: return 'UNKNOWN_ERROR';
  }
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Common error generators
export const createError = {
  badRequest: (message: string, details?: any) => 
    new CustomError(message, 400, true, details),
  
  unauthorized: (message: string = 'Authentication required') => 
    new CustomError(message, 401, true),
  
  forbidden: (message: string = 'Access denied') => 
    new CustomError(message, 403, true),
  
  notFound: (resource: string = 'Resource') => 
    new CustomError(`${resource} not found`, 404, true),
  
  conflict: (message: string) => 
    new CustomError(message, 409, true),
  
  validation: (message: string, details?: any) => 
    new CustomError(message, 422, true, details),
  
  rateLimited: (message: string = 'Rate limit exceeded') => 
    new CustomError(message, 429, true),
  
  internal: (message: string = 'Internal server error', details?: any) => 
    new CustomError(message, 500, false, details)
}; 