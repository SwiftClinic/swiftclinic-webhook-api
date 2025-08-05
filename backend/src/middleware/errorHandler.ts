import { Request, Response, NextFunction } from 'express';
import { logger, securityLogger } from '../utils/logger';
import { APIResponse } from '../../../shared/types';

export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export class APIError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'APIError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends APIError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends APIError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Main error handling middleware
 */
export const errorHandler = (
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const securityContext = req.securityContext;
  
  // Determine if this is an operational error or a programming error
  const isOperationalError = error instanceof APIError && error.name === 'APIError';
  
  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  if (isOperationalError) {
    const apiError = error as APIError;
    statusCode = apiError.statusCode;
    errorCode = apiError.code;
    message = apiError.message;
  } else {
    // Log programming errors with full stack trace
    logger.error('Programming error occurred:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      requestId: securityContext?.requestId,
      sessionId: securityContext?.sessionId
    });

    // Log as security incident if it might be suspicious
    if (error.name === 'SyntaxError' && req.body) {
      securityLogger.logSecurityIncident(
        'malformed_request',
        `Malformed JSON in request: ${error.message}`,
        'low',
        securityContext?.clientIP
      );
    }
  }

  // Handle specific error types
  switch (error.name) {
    case 'ValidationError':
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = error.message;
      break;

    case 'CastError':
      statusCode = 400;
      errorCode = 'INVALID_DATA_FORMAT';
      message = 'Invalid data format provided';
      break;

    case 'JsonWebTokenError':
      statusCode = 401;
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
      securityLogger.logSecurityIncident(
        'invalid_token',
        'Invalid JWT token provided',
        'medium',
        securityContext?.clientIP
      );
      break;

    case 'TokenExpiredError':
      statusCode = 401;
      errorCode = 'TOKEN_EXPIRED';
      message = 'Authentication token has expired';
      break;

    case 'SecurityError':
      securityLogger.logSecurityIncident(
        'security_error',
        error.message,
        'high',
        securityContext?.clientIP
      );
      break;

    case 'GDPRComplianceError':
      securityLogger.logGDPREvent(
        'gdpr_violation',
        { error: error.message, path: req.path },
        securityContext?.sessionId
      );
      break;

    // Database-related errors
    case 'SequelizeValidationError':
    case 'SQLiteError':
      statusCode = 400;
      errorCode = 'DATABASE_VALIDATION_ERROR';
      message = 'Data validation failed';
      logger.error('Database error:', error);
      break;

    case 'SequelizeConnectionError':
      statusCode = 503;
      errorCode = 'DATABASE_CONNECTION_ERROR';
      message = 'Database temporarily unavailable';
      logger.error('Database connection error:', error);
      break;
  }

  // Don't expose sensitive information in production
  if (process.env.NODE_ENV === 'production') {
    // Remove stack traces and sensitive details
    if (statusCode >= 500) {
      message = 'Internal server error';
      details = undefined;
    }
  } else {
    // In development, include more details
    if (!isOperationalError) {
      details = {
        stack: error.stack,
        originalError: error.message
      };
    }
  }

  // Rate limiting for error responses to prevent information leakage
  const errorKey = `${securityContext?.clientIP || 'unknown'}:${req.path}`;
  
  // Create standardized error response
  const errorResponse: APIResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      details
    },
    timestamp: new Date()
  };

  // Log the error response (but not sensitive details)
  logger.error('Error response sent:', {
    statusCode,
    errorCode,
    message,
    path: req.path,
    method: req.method,
    requestId: securityContext?.requestId,
    sessionId: securityContext?.sessionId,
    clientIP: securityContext?.clientIP
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Not found middleware (should be used before error handler)
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Unhandled rejection and exception handlers
 */
export const setupGlobalErrorHandlers = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString()
    });
    
    securityLogger.logSecurityIncident(
      'unhandled_rejection',
      `Unhandled promise rejection: ${reason?.message || 'Unknown'}`,
      'high'
    );
    
    // In production, you might want to restart the process
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack
    });
    
    securityLogger.logSecurityIncident(
      'uncaught_exception',
      `Uncaught exception: ${error.message}`,
      'critical'
    );
    
    // Always exit on uncaught exceptions
    process.exit(1);
  });
};

/**
 * Helper function to create and throw errors
 */
export const throwError = (message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR'): never => {
  throw new APIError(message, statusCode, code);
}; 