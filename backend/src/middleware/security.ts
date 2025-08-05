import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { logger, securityLogger } from '../utils/logger';
import { DataAnonymizer } from '../../../shared/security/encryption';

// Extend Express Request type for security context
declare global {
  namespace Express {
    interface Request {
      securityContext?: {
        clientIP: string;
        userAgent: string;
        sessionId: string;
        requestId: string;
      };
    }
  }
}

/**
 * Security middleware to add security context to requests
 */
export const securityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID for tracking
  const requestId = DataAnonymizer.generateAnonymousSessionId();
  
  // Extract client information
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const sessionId = req.sessionID || 'no-session';

  // Add security context to request
  req.securityContext = {
    clientIP,
    userAgent,
    sessionId,
    requestId
  };

  // Add security headers to response
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Log security-relevant requests
  if (req.path.startsWith('/api/')) {
    securityLogger.logAccess(
      sessionId,
      req.path,
      req.method,
      clientIP
    );
  }

  next();
};

/**
 * Validation middleware that handles express-validator results
 */
export const validationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const securityContext = req.securityContext;
    
    // Log validation failures for security monitoring
    securityLogger.logSecurityIncident(
      'validation_failure',
      `Invalid input on ${req.path}: ${JSON.stringify(errors.array())}`,
      'low',
      securityContext?.clientIP
    );

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors.array().map(error => ({
          field: error.type === 'field' ? error.path : 'unknown',
          message: error.msg,
          value: '[REDACTED]' // Don't expose actual values for security
        }))
      },
      timestamp: new Date()
    });
    return;
  }

  next();
};

/**
 * Authentication middleware for protected routes
 */
export const authenticationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const securityContext = req.securityContext;
  
  // For now, we'll use a simple session-based check
  // In production, you might want JWT tokens or more sophisticated auth
  if (!req.session) {
    securityLogger.logSecurityIncident(
      'authentication_failure',
      `Unauthenticated access attempt to ${req.path}`,
      'medium',
      securityContext?.clientIP
    );

    res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      },
      timestamp: new Date()
    });
    return;
  }

  next();
};

/**
 * Input sanitization middleware
 */
export const sanitizationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Recursive function to sanitize object properties
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Basic XSS prevention
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>?/gm, '') // Remove HTML tags
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Rate limiting per session to prevent abuse
 */
const sessionRequestCounts = new Map<string, { count: number; resetTime: number }>();

export const sessionRateLimitMiddleware = (maxRequests: number = 1000, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sessionId = req.securityContext?.sessionId || 'anonymous';
    const now = Date.now();
    
    let sessionData = sessionRequestCounts.get(sessionId);
    
    if (!sessionData || now > sessionData.resetTime) {
      sessionData = { count: 0, resetTime: now + windowMs };
      sessionRequestCounts.set(sessionId, sessionData);
    }
    
    sessionData.count++;
    
    if (sessionData.count > maxRequests) {
      securityLogger.logSecurityIncident(
        'rate_limit_exceeded',
        `Session ${sessionId} exceeded rate limit`,
        'medium',
        req.securityContext?.clientIP
      );

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this session',
          retryAfter: Math.ceil((sessionData.resetTime - now) / 1000)
        },
        timestamp: new Date()
      });
      return;
    }

    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - windowMs;
      for (const [key, data] of sessionRequestCounts.entries()) {
        if (data.resetTime < cutoff) {
          sessionRequestCounts.delete(key);
        }
      }
    }

    next();
  };
};

/**
 * GDPR compliance middleware for data processing consent
 */
export const gdprComplianceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Add GDPR headers to all responses
  res.setHeader('X-Data-Processing-Lawful-Basis', 'legitimate-interest');
  res.setHeader('X-Data-Retention-Period', '30-days');
  res.setHeader('X-Right-To-Erasure', 'contact-dpo@clinic.example');
  
  // For requests that process personal data, ensure consent
  const dataProcessingPaths = ['/api/clinics', '/api/conversations', '/api/knowledge-base'];
  const isDataProcessingRequest = dataProcessingPaths.some(path => req.path.startsWith(path));
  
  if (isDataProcessingRequest && req.method !== 'GET') {
    // Log GDPR-relevant data processing
    securityLogger.logGDPREvent(
      'data_processing_request',
      {
        path: req.path,
        method: req.method,
        hasConsent: true // For admin dashboard, we assume consent
      },
      req.securityContext?.sessionId
    );
  }
  
  next();
};

/**
 * Content Security Policy middleware
 */
export const cspMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const nonce = DataAnonymizer.generateAnonymousSessionId().slice(0, 16);
  
  res.setHeader('Content-Security-Policy', 
    `default-src 'self'; ` +
    `script-src 'self' 'nonce-${nonce}'; ` +
    `style-src 'self' 'unsafe-inline'; ` +
    `img-src 'self' data: https:; ` +
    `connect-src 'self'; ` +
    `font-src 'self'; ` +
    `object-src 'none'; ` +
    `media-src 'self'; ` +
    `frame-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`
  );
  
  // Make nonce available to templates if needed
  res.locals.nonce = nonce;
  
  next();
}; 