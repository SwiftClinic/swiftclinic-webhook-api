import winston from 'winston';
import path from 'path';
import { DataAnonymizer } from '../../../../shared/security/encryption';

// Custom log format that removes PII
const gdprCompliantFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // Anonymize any potential PII in log messages
    const cleanMessage = typeof message === 'string' ? DataAnonymizer.anonymizeText(message) : message;
    const cleanMeta = JSON.stringify(meta, (key, value) => {
      if (typeof value === 'string') {
        return DataAnonymizer.anonymizeText(value);
      }
      return value;
    });

    let logEntry = `${timestamp} [${level.toUpperCase()}]: ${cleanMessage}`;
    
    if (Object.keys(meta).length > 0) {
      logEntry += ` ${cleanMeta}`;
    }
    
    if (stack) {
      logEntry += `\n${stack}`;
    }
    
    return logEntry;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../../../logs');

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: gdprCompliantFormat,
  defaultMeta: { service: 'physio-dashboard' },
  transports: [
    // Error log - only errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Combined log - all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    }),

    // Security audit log - for GDPR compliance
    new winston.transports.File({
      filename: path.join(logsDir, 'security-audit.log'),
      level: 'warn',
      maxsize: 10485760, // 10MB
      maxFiles: 20, // Keep longer for compliance
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 10485760,
      maxFiles: 5
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

// Console logging for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        const cleanMessage = typeof message === 'string' ? DataAnonymizer.anonymizeText(message) : message;
        let logEntry = `${level}: ${cleanMessage}`;
        if (stack) {
          logEntry += `\n${stack}`;
        }
        return logEntry;
      })
    )
  }));
}

// GDPR-specific security audit logging
export const securityLogger = {
  logAccess: (userId: string, resource: string, action: string, ip?: string) => {
    logger.warn('SECURITY_ACCESS', {
      event: 'data_access',
      userId: DataAnonymizer.anonymizeText(userId),
      resource,
      action,
      ip: ip ? DataAnonymizer.anonymizeText(ip) : undefined,
      timestamp: new Date().toISOString()
    });
  },

  logDataModification: (userId: string, dataType: string, operation: string, recordId?: string) => {
    logger.warn('SECURITY_DATA_MODIFICATION', {
      event: 'data_modification',
      userId: DataAnonymizer.anonymizeText(userId),
      dataType,
      operation,
      recordId: recordId ? DataAnonymizer.anonymizeText(recordId) : undefined,
      timestamp: new Date().toISOString()
    });
  },

  logGDPREvent: (event: string, details: any, userId?: string) => {
    logger.warn('GDPR_EVENT', {
      event,
      details: JSON.parse(JSON.stringify(details, (key, value) => 
        typeof value === 'string' ? DataAnonymizer.anonymizeText(value) : value
      )),
      userId: userId ? DataAnonymizer.anonymizeText(userId) : undefined,
      timestamp: new Date().toISOString()
    });
  },

  logSecurityIncident: (type: string, description: string, severity: 'low' | 'medium' | 'high' | 'critical', ip?: string) => {
    logger.error('SECURITY_INCIDENT', {
      type,
      description: DataAnonymizer.anonymizeText(description),
      severity,
      ip: ip ? DataAnonymizer.anonymizeText(ip) : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

export default logger; 