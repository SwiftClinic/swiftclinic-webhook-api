/**
 * Request Logger Middleware
 * Captures all API requests for compliance and audit purposes
 */

import { Request, Response, NextFunction } from 'express';
import { MultiTenantDatabase } from '../../../../LLM SC/core/shared/database/multi-tenant-database';

export interface RequestLogData {
  method: string;
  url: string;
  path: string;
  query: any;
  headers: any;
  body?: any;
  userAgent: string;
  ipAddress: string;
  timestamp: Date;
  responseTime?: number;
  statusCode?: number;
  responseSize?: number;
}

export function requestLogger(database: MultiTenantDatabase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Extract client information
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '127.0.0.1';
    
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store request ID for response correlation
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Capture original request data
    const requestData: RequestLogData = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      headers: sanitizeHeaders(req.headers),
      body: sanitizeBody(req.body, req.path),
      userAgent,
      ipAddress: clientIp,
      timestamp: new Date()
    };

    // Override res.end to capture response details
    const originalEnd = res.end;
    let responseBody: any;
    let responseSize = 0;

    const originalSend = res.send;
    res.send = function(body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.end = function(chunk?: any, encoding?: any) {
      // Calculate response time and size
      const responseTime = Date.now() - startTime;
      if (chunk) {
        responseSize = Buffer.byteLength(chunk, encoding);
      }

      // Log the request/response
      logRequest(database, {
        ...requestData,
        responseTime,
        statusCode: res.statusCode,
        responseSize
      }, req, res, responseBody).catch(error => {
        console.error('Failed to log request:', error);
      });

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

async function logRequest(
  database: MultiTenantDatabase,
  logData: RequestLogData,
  req: Request,
  res: Response,
  responseBody?: any
): Promise<void> {
  try {
    // Determine if this is a sensitive operation
    const isSensitiveOperation = checkSensitiveOperation(req.path, req.method);
    const containsPII = checkForPII(req.body, responseBody);
    const containsPHI = checkForPHI(req.path, req.body, responseBody);

    // Determine data classification
    let dataClassification: 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret' = 'internal';
    if (containsPHI) {
      dataClassification = 'restricted';
    } else if (containsPII || isSensitiveOperation) {
      dataClassification = 'confidential';
    } else if (req.path.startsWith('/api/auth/') || req.path.includes('/admin/')) {
      dataClassification = 'confidential';
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (res.statusCode >= 500) {
      riskLevel = 'high';
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      riskLevel = 'medium';
    } else if (isSensitiveOperation) {
      riskLevel = 'medium';
    } else if (containsPHI) {
      riskLevel = 'high';
    }

    // Generate compliance flags
    const complianceFlags: string[] = ['api_request'];
    if (isSensitiveOperation) complianceFlags.push('sensitive_operation');
    if (containsPII) complianceFlags.push('pii_involved');
    if (containsPHI) complianceFlags.push('phi_involved');
    if (req.path.includes('/compliance/')) complianceFlags.push('compliance_endpoint');
    if (req.path.includes('/audit/')) complianceFlags.push('audit_endpoint');

    // Log to audit system
    await database.logAuditEvent({
      tenantId: req.tenantId || 'system',
      userId: req.userId,
      sessionId: req.sessionId,
      eventType: mapMethodToEventType(req.method),
      eventCategory: 'business_operation',
      action: `${req.method.toLowerCase()}_${getResourceType(req.path)}`,
      resource: req.path,
      resourceId: req.params.id || req.params.tenantId || req.params.clinicId,
      ipAddress: logData.ipAddress,
      userAgent: logData.userAgent,
      dataTypes: determineDataTypes(req.path),
      dataClassification,
      piiInvolved: containsPII,
      phiInvolved: containsPHI,
      success: res.statusCode < 400,
      errorCode: res.statusCode >= 400 ? res.statusCode.toString() : undefined,
      riskLevel,
      complianceFlags,
      reviewRequired: riskLevel === 'critical' || res.statusCode >= 500,
      additionalData: {
        requestId: req.headers['x-request-id'],
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        responseTime: logData.responseTime,
        responseSize: logData.responseSize,
        statusCode: res.statusCode,
        userAgent: logData.userAgent
      }
    });

  } catch (error) {
    console.error('Failed to log request to audit system:', error);
  }
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  delete sanitized['x-auth-token'];
  
  return sanitized;
}

function sanitizeBody(body: any, path: string): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  
  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.apiKey;
  delete sanitized.privateKey;
  
  // Remove PII/PHI data in logs for compliance
  if (path.includes('/patients/') || path.includes('/phi/')) {
    delete sanitized.email;
    delete sanitized.phone;
    delete sanitized.ssn;
    delete sanitized.dateOfBirth;
    delete sanitized.medicalRecord;
  }

  return sanitized;
}

function checkSensitiveOperation(path: string, method: string): boolean {
  const sensitivePatterns = [
    '/api/auth/',
    '/api/admin/',
    '/api/tenants/',
    '/api/compliance/',
    '/api/users/',
    '/webhooks/generate',
    '/billing/',
    '/api/analytics/',
    '/audit/'
  ];

  return sensitivePatterns.some(pattern => path.includes(pattern)) ||
         (method === 'DELETE' && path.includes('/api/'));
}

function checkForPII(requestBody: any, responseBody: any): boolean {
  const piiFields = ['email', 'phone', 'firstName', 'lastName', 'address', 'ssn'];
  
  const checkObject = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    
    return Object.keys(obj).some(key => {
      const lowerKey = key.toLowerCase();
      return piiFields.some(field => lowerKey.includes(field));
    });
  };

  return checkObject(requestBody) || checkObject(responseBody);
}

function checkForPHI(path: string, requestBody: any, responseBody: any): boolean {
  // Check path for PHI indicators
  const phiPaths = ['/patients/', '/medical/', '/health/', '/clinical/', '/phi/'];
  if (phiPaths.some(pattern => path.includes(pattern))) {
    return true;
  }

  // Check for PHI fields
  const phiFields = ['medicalRecord', 'diagnosis', 'treatment', 'medication', 'dateOfBirth', 'patientId'];
  
  const checkObject = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    
    return Object.keys(obj).some(key => {
      const lowerKey = key.toLowerCase();
      return phiFields.some(field => lowerKey.includes(field));
    });
  };

  return checkObject(requestBody) || checkObject(responseBody);
}

function mapMethodToEventType(method: string): 'data_read' | 'data_create' | 'data_update' | 'data_delete' | 'data_export' {
  switch (method.toUpperCase()) {
    case 'GET': return 'data_read';
    case 'POST': return 'data_create';
    case 'PUT':
    case 'PATCH': return 'data_update';
    case 'DELETE': return 'data_delete';
    default: return 'data_read';
  }
}

function getResourceType(path: string): string {
  if (path.includes('/tenants/')) return 'tenant';
  if (path.includes('/clinics/')) return 'clinic';
  if (path.includes('/users/')) return 'user';
  if (path.includes('/webhooks/')) return 'webhook';
  if (path.includes('/compliance/')) return 'compliance';
  if (path.includes('/analytics/')) return 'analytics';
  if (path.includes('/auth/')) return 'authentication';
  return 'api';
}

function determineDataTypes(path: string): string[] {
  const dataTypes: string[] = [];
  
  if (path.includes('/tenants/')) dataTypes.push('user_data', 'billing_data');
  if (path.includes('/clinics/')) dataTypes.push('clinic_configuration');
  if (path.includes('/users/')) dataTypes.push('user_data');
  if (path.includes('/patients/') || path.includes('/phi/')) dataTypes.push('patient_data');
  if (path.includes('/appointments/')) dataTypes.push('appointment_data');
  if (path.includes('/conversations/')) dataTypes.push('conversation_logs');
  if (path.includes('/compliance/')) dataTypes.push('audit_logs');
  if (path.includes('/analytics/')) dataTypes.push('system_logs');
  
  return dataTypes.length > 0 ? dataTypes : ['system_logs'];
} 