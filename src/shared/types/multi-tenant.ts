/**
 * Multi-Tenant Architecture Types
 * Provides enterprise-grade data isolation, compliance, and security
 */

// ============================================================================
// TENANT MANAGEMENT
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string; // URL-safe identifier
  organizationType: 'healthcare_provider' | 'clinic_chain' | 'hospital_system' | 'individual_practice';
  
  // Contact and billing information
  contactInfo: {
    primaryEmail: string;
    primaryPhone: string;
    billingEmail: string;
    technicalEmail: string;
    address: TenantAddress;
  };
  
  // Subscription and billing
  subscription: {
    plan: 'starter' | 'professional' | 'enterprise' | 'custom';
    status: 'trial' | 'active' | 'suspended' | 'cancelled';
    billingCycle: 'monthly' | 'yearly';
    trialEndsAt?: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    limits: TenantLimits;
  };
  
  // Compliance and jurisdiction
  compliance: {
    jurisdiction: 'US' | 'EU' | 'UK' | 'CA' | 'AU' | 'GLOBAL';
    dataResidency: 'US' | 'EU' | 'UK' | 'CA' | 'AU';
    hipaaRequired: boolean;
    gdprRequired: boolean;
    complianceCertifications: string[];
    dataProcessingAgreement: boolean;
    businessAssociateAgreement?: boolean;
  };
  
  // Security settings
  security: {
    encryptionLevel: 'standard' | 'enhanced' | 'enterprise';
    ipWhitelist?: string[];
    ssoEnabled: boolean;
    mfaRequired: boolean;
    sessionTimeout: number; // minutes
    passwordPolicy: PasswordPolicy;
    auditRetention: number; // days
  };
  
  // Customization
  branding?: {
    primaryColor: string;
    logoUrl?: string;
    customDomain?: string;
    whiteLabel: boolean;
  };
  
  // System metadata
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // User ID who created the tenant
  lastAccessAt?: Date;
}

export interface TenantAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string; // IANA timezone
}

export interface TenantLimits {
  maxClinics: number;
  maxUsers: number;
  maxConversationsPerMonth: number;
  maxStorageGB: number;
  maxApiCallsPerHour: number;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number; // days
  preventReuse: number; // number of previous passwords to prevent
}

// ============================================================================
// USER MANAGEMENT & AUTHORIZATION
// ============================================================================

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: TenantRole;
  permissions: Permission[];
  
  // Authentication
  passwordHash: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  lastLoginAt?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  
  // Access control
  clinicAccess: string[]; // Clinic IDs this user can access
  ipRestrictions?: string[];
  activeHours?: {
    start: string; // HH:mm
    end: string; // HH:mm
    timezone: string;
  };
  
  // Compliance
  acceptedTermsAt?: Date;
  hipaaTrainingCompleted?: boolean;
  lastAuditAt?: Date;
  
  // System metadata
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type TenantRole = 
  | 'tenant_owner'       // Full access to everything
  | 'tenant_admin'       // Admin access, cannot delete tenant
  | 'clinic_manager'     // Manage specific clinics
  | 'clinic_staff'       // View/operate specific clinics
  | 'support_viewer'     // Read-only access for support
  | 'auditor'           // Audit log access only

export type Permission = 
  // Tenant management
  | 'tenant:manage'
  | 'tenant:billing'
  | 'tenant:users'
  
  // Clinic management
  | 'clinics:create'
  | 'clinics:manage'
  | 'clinics:delete'
  | 'clinics:view'
  
  // Conversations
  | 'conversations:view'
  | 'conversations:export'
  | 'conversations:delete'
  
  // Compliance
  | 'audit:view'
  | 'audit:export'
  | 'gdpr:manage'
  | 'hipaa:manage'
  
  // System
  | 'system:monitor'
  | 'system:configure';

// ============================================================================
// ENHANCED CLINIC CONFIGURATION (TENANT-AWARE)
// ============================================================================

export interface MultiTenantClinicConfig {
  id: string;
  tenantId: string; // NEW: Tenant isolation
  name: string;
  
  contactInfo: {
    email: string;
    phone: string;
    address: string;
  };
  
  businessHours: {
    monday?: { open: string; close: string } | null;
    tuesday?: { open: string; close: string } | null;
    wednesday?: { open: string; close: string } | null;
    thursday?: { open: string; close: string } | null;
    friday?: { open: string; close: string } | null;
    saturday?: { open: string; close: string } | null;
    sunday?: { open: string; close: string } | null;
  };
  
  services: string[];
  bookingSystem: BookingSystemType;
  apiCredentials: EncryptedCredentials;
  knowledgeBase?: KnowledgeBase;
  
  // Enhanced GDPR/HIPAA settings
  compliance: ClinicComplianceSettings;
  
  webhookUrl: string;
  timezone: string;
  isActive: boolean;
  
  // Access control
  authorizedUsers: string[]; // User IDs who can access this clinic
  
  // System metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ClinicComplianceSettings {
  // Data retention
  dataRetentionDays: number;
  autoDeleteExpiredData: boolean;
  
  // GDPR
  gdprEnabled: boolean;
  gdprDataProcessorName: string;
  gdprDataControllerName: string;
  privacyPolicyUrl?: string;
  consentText?: string;
  rightToErasure: boolean;
  rightToPortability: boolean;
  
  // HIPAA
  hipaaEnabled: boolean;
  hipaaEntityType: 'covered_entity' | 'business_associate';
  minimumNecessary: boolean;
  accessLogging: boolean;
  encryptionRequired: boolean;
  
  // Audit requirements
  auditLogRetention: number; // days
  detailedAuditLog: boolean;
  realTimeMonitoring: boolean;
}

// ============================================================================
// AUDIT LOGGING & COMPLIANCE
// ============================================================================

export interface AuditLog {
  id: string;
  tenantId: string;
  clinicId?: string;
  userId?: string;
  sessionId?: string;
  
  // Event details
  eventType: AuditEventType;
  eventCategory: AuditCategory;
  action: string;
  resource: string;
  resourceId?: string;
  
  // Context
  ipAddress: string;
  userAgent: string;
  location?: {
    country: string;
    region: string;
    city: string;
  };
  
  // Data involved
  dataTypes: DataType[];
  dataClassification: DataClassification;
  piiInvolved: boolean;
  phiInvolved: boolean; // Protected Health Information
  
  // Results
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  
  // Compliance
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  complianceFlags: string[];
  reviewRequired: boolean;
  
  // Metadata
  timestamp: Date;
  processingTimeMs: number;
  additionalData?: Record<string, any>;
}

export type AuditEventType = 
  // Authentication
  | 'user_login'
  | 'user_logout'
  | 'user_login_failed'
  | 'password_change'
  | 'mfa_enable'
  | 'mfa_disable'
  
  // Data access
  | 'data_read'
  | 'data_create'
  | 'data_update'
  | 'data_delete'
  | 'data_export'
  | 'data_import'
  
  // System operations
  | 'system_config_change'
  | 'user_permission_change'
  | 'clinic_create'
  | 'clinic_update'
  | 'clinic_delete'
  
  // Compliance
  | 'gdpr_request'
  | 'gdpr_export'
  | 'gdpr_deletion'
  | 'hipaa_access'
  | 'audit_access'
  
  // Security
  | 'security_incident'
  | 'access_denied'
  | 'suspicious_activity'
  | 'rate_limit_exceeded';

export type AuditCategory = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'system_administration'
  | 'compliance'
  | 'security'
  | 'business_operation';

export type DataType = 
  | 'patient_data'
  | 'appointment_data'
  | 'conversation_logs'
  | 'user_data'
  | 'clinic_configuration'
  | 'system_logs'
  | 'billing_data'
  | 'audit_logs';

export type DataClassification = 
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'
  | 'top_secret';

// ============================================================================
// GDPR & HIPAA COMPLIANCE
// ============================================================================

export interface GDPRRequest {
  id: string;
  tenantId: string;
  clinicId?: string;
  requestType: 'access' | 'portability' | 'erasure' | 'rectification' | 'restriction';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  
  // Requester information
  requesterEmail: string;
  requesterPhone?: string;
  identityVerified: boolean;
  verificationMethod?: string;
  
  // Request details
  dataSubject: {
    identifiers: string[]; // emails, phones, etc.
    dateRange?: {
      start: Date;
      end: Date;
    };
    dataTypes: DataType[];
  };
  
  // Processing
  assignedTo?: string; // User ID
  requestedAt: Date;
  dueDate: Date; // Must be within 30 days for GDPR
  completedAt?: Date;
  rejectionReason?: string;
  
  // Results
  exportUrl?: string; // For portability requests
  deletedRecords?: number; // For erasure requests
  modifiedRecords?: number; // For rectification requests
  
  // Audit trail
  processedBy?: string;
  reviewedBy?: string;
  auditLog: string[]; // IDs of related audit log entries
}

export interface HIPAAAccessLog {
  id: string;
  tenantId: string;
  clinicId: string;
  userId: string;
  
  // PHI access details
  patientIdentifier?: string; // Hashed patient ID
  accessType: 'view' | 'create' | 'update' | 'delete' | 'export' | 'print';
  accessReason: 'treatment' | 'payment' | 'healthcare_operations' | 'patient_request' | 'other';
  accessJustification?: string;
  
  // System details
  ipAddress: string;
  userAgent: string;
  applicationUsed: string;
  
  // Data accessed
  dataElements: string[];
  minimumNecessary: boolean;
  
  // Timing
  accessStartTime: Date;
  accessEndTime?: Date;
  duration?: number; // seconds
  
  // Compliance
  authorizedAccess: boolean;
  supervisorNotified?: boolean;
  patientNotified?: boolean;
}

// ============================================================================
// DATA SOVEREIGNTY & ENCRYPTION
// ============================================================================

export interface DataSovereigntyConfig {
  tenantId: string;
  
  // Data residency requirements
  primaryRegion: 'us-east-1' | 'eu-west-1' | 'eu-central-1' | 'ap-southeast-2' | 'ca-central-1';
  allowedRegions: string[];
  restrictedRegions: string[];
  
  // Cross-border transfer
  crossBorderTransferAllowed: boolean;
  adequacyDecisionRequired: boolean;
  safeguardMechanisms: string[];
  
  // Encryption requirements
  encryptionAtRest: {
    enabled: boolean;
    algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
    keyRotationDays: number;
    customerManagedKeys: boolean;
  };
  
  encryptionInTransit: {
    minTLSVersion: '1.2' | '1.3';
    certificateValidation: boolean;
    perfectForwardSecrecy: boolean;
  };
  
  // Backup and disaster recovery
  backupEncryption: boolean;
  backupRetention: number; // days
  crossRegionBackup: boolean;
  
  // Compliance attestations
  certifications: string[]; // SOC2, ISO27001, etc.
  lastAuditDate?: Date;
  nextAuditDue?: Date;
}

// ============================================================================
// TENANT CONFIGURATION & CUSTOMIZATION
// ============================================================================

export interface TenantConfiguration {
  tenantId: string;
  
  // Feature flags
  features: {
    conversationPersistence: boolean;
    multipleBookingSystems: boolean;
    advancedAnalytics: boolean;
    customBranding: boolean;
    ssoIntegration: boolean;
    apiAccess: boolean;
    webhooksEnabled: boolean;
    realtimeMonitoring: boolean;
  };
  
  // Rate limiting
  rateLimits: {
    apiCallsPerMinute: number;
    conversationsPerHour: number;
    dataExportPerDay: number;
    simultaneousUsers: number;
  };
  
  // Notification preferences
  notifications: {
    securityAlerts: boolean;
    complianceReports: boolean;
    usageWarnings: boolean;
    systemMaintenance: boolean;
    billing: boolean;
    
    channels: {
      email: boolean;
      sms: boolean;
      webhook: boolean;
      inApp: boolean;
    };
  };
  
  // Integration settings
  integrations: {
    allowedDomains: string[];
    webhookEndpoints: string[];
    apiKeys: Array<{
      id: string;
      name: string;
      permissions: Permission[];
      lastUsed?: Date;
      expiresAt?: Date;
    }>;
  };
  
  // Customization
  customization: {
    defaultTimezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    language: string;
    locale: string;
  };
  
  // System settings
  system: {
    sessionTimeout: number; // minutes
    autoSaveInterval: number; // seconds
    maxFileUploadSize: number; // MB
    allowedFileTypes: string[];
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export type BookingSystemType = 
  | 'cliniko' 
  | 'jane-app' 
  | 'acuity' 
  | 'simple-practice' 
  | 'square-appointments' 
  | 'custom';

// Re-export existing types for compatibility
export * from './index'; 