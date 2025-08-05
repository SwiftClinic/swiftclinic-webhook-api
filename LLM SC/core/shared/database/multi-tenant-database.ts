/**
 * Multi-Tenant Database Implementation
 * Provides enterprise-grade data isolation, compliance, and security
 */

import Database from 'better-sqlite3';
import { EncryptionService } from '../security/encryption';
import {
  Tenant,
  TenantUser,
  MultiTenantClinicConfig,
  AuditLog,
  GDPRRequest,
  HIPAAAccessLog,
  DataSovereigntyConfig,
  TenantConfiguration,
  AuditEventType,
  AuditCategory,
  DataType,
  DataClassification,
  Permission,
  TenantRole
} from '../types/multi-tenant';

export class MultiTenantDatabase {
  private db: Database.Database | null = null;
  private encryptionService: EncryptionService;
  private currentTenantId?: string;
  private currentUserId?: string;

  constructor(dbPath: string, masterPassword: string) {
    this.encryptionService = new EncryptionService(masterPassword);
  }

  /**
   * Set tenant context for all subsequent operations
   */
  setTenantContext(tenantId: string, userId?: string): void {
    this.currentTenantId = tenantId;
    this.currentUserId = userId;
  }

  /**
   * Clear tenant context
   */
  clearTenantContext(): void {
    this.currentTenantId = undefined;
    this.currentUserId = undefined;
  }

  async initialize(): Promise<void> {
    this.db = new Database(process.env.DATABASE_PATH || './data/multi-tenant.db');
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('foreign_keys = ON');

    await this.createTables();
    await this.createIndexes();
    await this.setupTriggers();
    
    console.log('✅ Multi-tenant database initialized with enterprise security');
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // ========================================================================
    // TENANT MANAGEMENT
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        organization_type TEXT NOT NULL CHECK (organization_type IN ('healthcare_provider', 'clinic_chain', 'hospital_system', 'individual_practice')),
        
        -- Contact Information (encrypted)
        contact_info TEXT NOT NULL, -- JSON encrypted
        
        -- Subscription
        subscription_plan TEXT NOT NULL CHECK (subscription_plan IN ('starter', 'professional', 'enterprise', 'custom')),
        subscription_status TEXT NOT NULL CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
        billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
        trial_ends_at DATETIME,
        current_period_start DATETIME NOT NULL,
        current_period_end DATETIME NOT NULL,
        tenant_limits TEXT NOT NULL, -- JSON
        
        -- Compliance
        jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('US', 'EU', 'UK', 'CA', 'AU', 'GLOBAL')),
        data_residency TEXT NOT NULL CHECK (data_residency IN ('US', 'EU', 'UK', 'CA', 'AU')),
        hipaa_required BOOLEAN NOT NULL DEFAULT 0,
        gdpr_required BOOLEAN NOT NULL DEFAULT 0,
        compliance_certifications TEXT, -- JSON array
        data_processing_agreement BOOLEAN NOT NULL DEFAULT 0,
        business_associate_agreement BOOLEAN DEFAULT 0,
        
        -- Security
        security_config TEXT NOT NULL, -- JSON encrypted
        
        -- Branding (encrypted - may contain sensitive info)
        branding_config TEXT, -- JSON encrypted
        
        -- System metadata
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        last_access_at DATETIME
      )
    `);

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('tenant_owner', 'tenant_admin', 'clinic_manager', 'clinic_staff', 'support_viewer', 'auditor')),
        permissions TEXT NOT NULL, -- JSON array
        
        -- Authentication (encrypted)
        password_hash TEXT NOT NULL,
        mfa_enabled BOOLEAN NOT NULL DEFAULT 0,
        mfa_secret TEXT, -- encrypted
        last_login_at DATETIME,
        login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until DATETIME,
        
        -- Access control
        clinic_access TEXT, -- JSON array of clinic IDs
        ip_restrictions TEXT, -- JSON array
        active_hours TEXT, -- JSON object
        
        -- Compliance
        accepted_terms_at DATETIME,
        hipaa_training_completed BOOLEAN DEFAULT 0,
        last_audit_at DATETIME,
        
        -- System metadata
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
        UNIQUE(tenant_id, email)
      )
    `);

    // ========================================================================
    // ENHANCED CLINIC MANAGEMENT
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mt_clinics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        
        -- Contact info (encrypted)
        contact_info TEXT NOT NULL, -- JSON encrypted
        
        -- Business configuration
        business_hours TEXT NOT NULL, -- JSON
        services TEXT NOT NULL, -- JSON array
        booking_system TEXT NOT NULL,
        api_credentials TEXT NOT NULL, -- encrypted
        timezone TEXT NOT NULL,
        
        -- Compliance settings (encrypted)
        compliance_settings TEXT NOT NULL, -- JSON encrypted
        
        -- Access control
        authorized_users TEXT, -- JSON array of user IDs
        
        -- System metadata
        webhook_url TEXT UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT NOT NULL,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
      )
    `);

    // ========================================================================
    // COMPREHENSIVE AUDIT LOGGING
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT,
        user_id TEXT,
        session_id TEXT,
        
        -- Event details
        event_type TEXT NOT NULL,
        event_category TEXT NOT NULL CHECK (event_category IN ('authentication', 'authorization', 'data_access', 'data_modification', 'system_administration', 'compliance', 'security', 'business_operation')),
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        
        -- Context (encrypted)
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        location_data TEXT, -- JSON encrypted
        
        -- Data classification
        data_types TEXT NOT NULL, -- JSON array
        data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted', 'top_secret')),
        pii_involved BOOLEAN NOT NULL DEFAULT 0,
        phi_involved BOOLEAN NOT NULL DEFAULT 0,
        
        -- Results
        success BOOLEAN NOT NULL,
        error_code TEXT,
        error_message TEXT,
        
        -- Compliance
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        compliance_flags TEXT, -- JSON array
        review_required BOOLEAN NOT NULL DEFAULT 0,
        
        -- Metadata
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        processing_time_ms INTEGER,
        additional_data TEXT, -- JSON encrypted
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
        FOREIGN KEY (clinic_id) REFERENCES mt_clinics (id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES tenant_users (id) ON DELETE SET NULL
      )
    `);

    // ========================================================================
    // GDPR COMPLIANCE
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gdpr_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT,
        request_type TEXT NOT NULL CHECK (request_type IN ('access', 'portability', 'erasure', 'rectification', 'restriction')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
        
        -- Requester information (encrypted)
        requester_email TEXT NOT NULL,
        requester_phone TEXT,
        identity_verified BOOLEAN NOT NULL DEFAULT 0,
        verification_method TEXT,
        
        -- Request details (encrypted)
        data_subject TEXT NOT NULL, -- JSON encrypted
        
        -- Processing
        assigned_to TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        due_date DATETIME NOT NULL,
        completed_at DATETIME,
        rejection_reason TEXT,
        
        -- Results (encrypted)
        results_data TEXT, -- JSON encrypted
        
        -- Audit trail
        processed_by TEXT,
        reviewed_by TEXT,
        audit_log_ids TEXT, -- JSON array
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
        FOREIGN KEY (clinic_id) REFERENCES mt_clinics (id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to) REFERENCES tenant_users (id) ON DELETE SET NULL
      )
    `);

    // ========================================================================
    // HIPAA ACCESS LOGGING
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hipaa_access_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        
        -- PHI access details (encrypted)
        patient_identifier TEXT, -- hashed
        access_type TEXT NOT NULL CHECK (access_type IN ('view', 'create', 'update', 'delete', 'export', 'print')),
        access_reason TEXT NOT NULL CHECK (access_reason IN ('treatment', 'payment', 'healthcare_operations', 'patient_request', 'other')),
        access_justification TEXT,
        
        -- System details
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        application_used TEXT NOT NULL,
        
        -- Data accessed (encrypted)
        data_elements TEXT, -- JSON encrypted
        minimum_necessary BOOLEAN NOT NULL DEFAULT 1,
        
        -- Timing
        access_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        access_end_time DATETIME,
        duration INTEGER,
        
        -- Compliance flags
        authorized_access BOOLEAN NOT NULL DEFAULT 1,
        supervisor_notified BOOLEAN DEFAULT 0,
        patient_notified BOOLEAN DEFAULT 0,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
        FOREIGN KEY (clinic_id) REFERENCES mt_clinics (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES tenant_users (id) ON DELETE CASCADE
      )
    `);

    // ========================================================================
    // DATA SOVEREIGNTY
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_sovereignty_configs (
        tenant_id TEXT PRIMARY KEY,
        
        -- Data residency (encrypted)
        residency_config TEXT NOT NULL, -- JSON encrypted
        
        -- Encryption configuration (encrypted)
        encryption_config TEXT NOT NULL, -- JSON encrypted
        
        -- Compliance attestations
        certifications TEXT, -- JSON array
        last_audit_date DATETIME,
        next_audit_due DATETIME,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
      )
    `);

    // ========================================================================
    // TENANT CONFIGURATION
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_configurations (
        tenant_id TEXT PRIMARY KEY,
        
        -- Feature flags
        features TEXT NOT NULL, -- JSON
        
        -- Rate limits
        rate_limits TEXT NOT NULL, -- JSON
        
        -- Notification preferences
        notifications TEXT NOT NULL, -- JSON
        
        -- Integration settings (encrypted)
        integrations TEXT NOT NULL, -- JSON encrypted
        
        -- Customization
        customization TEXT NOT NULL, -- JSON
        
        -- System settings
        system_settings TEXT NOT NULL, -- JSON
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
      )
    `);

    // ========================================================================
    // TENANT-AWARE CONVERSATION LOGS
    // ========================================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mt_conversation_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        clinic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        messages TEXT NOT NULL, -- JSON encrypted
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        user_consent BOOLEAN NOT NULL DEFAULT 0,
        anonymized BOOLEAN DEFAULT 0,
        retention_expiry DATETIME NOT NULL,
        contains_pii BOOLEAN DEFAULT 0,
        contains_phi BOOLEAN DEFAULT 0,
        
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
        FOREIGN KEY (clinic_id) REFERENCES mt_clinics (id) ON DELETE CASCADE
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Tenant indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tenants_jurisdiction ON tenants(jurisdiction)');

    // User indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_tenant ON tenant_users(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON tenant_users(tenant_id, email)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON tenant_users(tenant_id, role)');

    // Clinic indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_clinics_tenant ON mt_clinics(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_clinics_webhook ON mt_clinics(webhook_url)');

    // Audit log indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(tenant_id, user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_logs(risk_level)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_phi ON audit_logs(phi_involved)');

    // GDPR indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_gdpr_tenant ON gdpr_requests(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_gdpr_status ON gdpr_requests(status)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_gdpr_due ON gdpr_requests(due_date)');

    // HIPAA indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hipaa_tenant ON hipaa_access_logs(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hipaa_clinic ON hipaa_access_logs(clinic_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hipaa_user ON hipaa_access_logs(user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hipaa_time ON hipaa_access_logs(access_start_time)');

    // Conversation indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conv_tenant ON mt_conversation_logs(tenant_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conv_clinic ON mt_conversation_logs(clinic_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conv_expiry ON mt_conversation_logs(retention_expiry)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conv_phi ON mt_conversation_logs(contains_phi)');
  }

  private async setupTriggers(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Auto-update timestamps
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_tenant_timestamp 
      AFTER UPDATE ON tenants
      BEGIN
        UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_user_timestamp 
      AFTER UPDATE ON tenant_users
      BEGIN
        UPDATE tenant_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_clinic_timestamp 
      AFTER UPDATE ON mt_clinics
      BEGIN
        UPDATE mt_clinics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    // Security triggers - log sensitive operations
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_user_deletion
      BEFORE DELETE ON tenant_users
      BEGIN
        INSERT INTO audit_logs (
          id, tenant_id, user_id, event_type, event_category, action, resource, 
          ip_address, data_types, data_classification, pii_involved, 
          success, risk_level, compliance_flags
        ) VALUES (
          hex(randomblob(16)), OLD.tenant_id, OLD.id, 'data_delete', 'system_administration', 
          'user_delete', 'tenant_user', '127.0.0.1', '["user_data"]', 'confidential', 1, 
          1, 'high', '["user_deletion"]'
        );
      END
    `);
  }

  // ============================================================================
  // TENANT MANAGEMENT
  // ============================================================================

  async createTenant(tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    if (!this.db) throw new Error('Database not initialized');
    
    const id = this.encryptionService.generateSecureToken(16);
    const now = new Date();

    // Encrypt sensitive data
    const encryptedContactInfo = this.encryptionService.encrypt(JSON.stringify(tenant.contactInfo));
    const encryptedSecurityConfig = this.encryptionService.encrypt(JSON.stringify(tenant.security));
    const encryptedBranding = tenant.branding ? this.encryptionService.encrypt(JSON.stringify(tenant.branding)) : null;

    const stmt = this.db.prepare(`
      INSERT INTO tenants (
        id, name, slug, organization_type, contact_info, subscription_plan, 
        subscription_status, billing_cycle, trial_ends_at, current_period_start, 
        current_period_end, tenant_limits, jurisdiction, data_residency, 
        hipaa_required, gdpr_required, compliance_certifications, 
        data_processing_agreement, business_associate_agreement, security_config, 
        branding_config, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      id,
      tenant.name,
      tenant.slug,
      tenant.organizationType,
      encryptedContactInfo,
      tenant.subscription.plan,
      tenant.subscription.status,
      tenant.subscription.billingCycle,
      tenant.subscription.trialEndsAt?.toISOString(),
      tenant.subscription.currentPeriodStart.toISOString(),
      tenant.subscription.currentPeriodEnd.toISOString(),
      JSON.stringify(tenant.subscription.limits),
      tenant.compliance.jurisdiction,
      tenant.compliance.dataResidency,
      tenant.compliance.hipaaRequired ? 1 : 0,
      tenant.compliance.gdprRequired ? 1 : 0,
      JSON.stringify(tenant.compliance.complianceCertifications),
      tenant.compliance.dataProcessingAgreement ? 1 : 0,
      tenant.compliance.businessAssociateAgreement ? 1 : 0,
      encryptedSecurityConfig,
      encryptedBranding,
      tenant.isActive ? 1 : 0,
      tenant.createdBy
    ]);

    // Log tenant creation
    await this.logAuditEvent({
      tenantId: id,
      eventType: 'system_config_change',
      eventCategory: 'system_administration',
      action: 'tenant_create',
      resource: 'tenant',
      resourceId: id,
      ipAddress: '127.0.0.1',
      dataTypes: ['user_data', 'billing_data'],
      dataClassification: 'confidential',
      piiInvolved: true,
      phiInvolved: false,
      success: true,
      riskLevel: 'medium',
      complianceFlags: ['tenant_creation']
    });

    return {
      ...tenant,
      id,
      createdAt: now,
      updatedAt: now
    };
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    if (!row) return null;

    // Decrypt sensitive data
    const contactInfo = JSON.parse(this.encryptionService.decrypt(row.contact_info));
    const securityConfig = JSON.parse(this.encryptionService.decrypt(row.security_config));
    const branding = row.branding_config ? JSON.parse(this.encryptionService.decrypt(row.branding_config)) : undefined;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      organizationType: row.organization_type,
      contactInfo,
      subscription: {
        plan: row.subscription_plan,
        status: row.subscription_status,
        billingCycle: row.billing_cycle,
        trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : undefined,
        currentPeriodStart: new Date(row.current_period_start),
        currentPeriodEnd: new Date(row.current_period_end),
        limits: JSON.parse(row.tenant_limits)
      },
      compliance: {
        jurisdiction: row.jurisdiction,
        dataResidency: row.data_residency,
        hipaaRequired: Boolean(row.hipaa_required),
        gdprRequired: Boolean(row.gdpr_required),
        complianceCertifications: JSON.parse(row.compliance_certifications || '[]'),
        dataProcessingAgreement: Boolean(row.data_processing_agreement),
        businessAssociateAgreement: Boolean(row.business_associate_agreement)
      },
      security: securityConfig,
      branding,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      lastAccessAt: row.last_access_at ? new Date(row.last_access_at) : undefined
    };
  }

  // ============================================================================
  // AUDIT LOGGING
  // ============================================================================

  async logAuditEvent(event: Omit<AuditLog, 'id' | 'timestamp' | 'processingTimeMs'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = this.encryptionService.generateSecureToken(16);
    const startTime = Date.now();

    // Encrypt sensitive data
    const encryptedLocation = event.location ? this.encryptionService.encrypt(JSON.stringify(event.location)) : null;
    const encryptedAdditionalData = event.additionalData ? this.encryptionService.encrypt(JSON.stringify(event.additionalData)) : null;

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, tenant_id, clinic_id, user_id, session_id, event_type, event_category,
        action, resource, resource_id, ip_address, user_agent, location_data,
        data_types, data_classification, pii_involved, phi_involved, success,
        error_code, error_message, risk_level, compliance_flags, review_required,
        processing_time_ms, additional_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const processingTime = Date.now() - startTime;

    stmt.run([
      id,
      event.tenantId,
      event.clinicId || null,
      event.userId || null,
      event.sessionId || null,
      event.eventType,
      event.eventCategory,
      event.action,
      event.resource,
      event.resourceId || null,
      event.ipAddress,
      event.userAgent || null,
      encryptedLocation,
      JSON.stringify(event.dataTypes),
      event.dataClassification,
      event.piiInvolved ? 1 : 0,
      event.phiInvolved ? 1 : 0,
      event.success ? 1 : 0,
      event.errorCode || null,
      event.errorMessage || null,
      event.riskLevel,
      JSON.stringify(event.complianceFlags || []),
      event.reviewRequired ? 1 : 0,
      processingTime,
      encryptedAdditionalData
    ]);
  }

  // ============================================================================
  // COMPLIANCE UTILITIES
  // ============================================================================

  private validateTenantAccess(tenantId: string): void {
    if (this.currentTenantId && this.currentTenantId !== tenantId) {
      throw new Error('Cross-tenant access denied - data isolation violation');
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
} 