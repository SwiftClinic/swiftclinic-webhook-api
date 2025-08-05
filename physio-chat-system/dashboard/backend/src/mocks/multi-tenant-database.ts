/**
 * Mock Multi-Tenant Database
 * Temporary implementation for development/testing
 */

export class MultiTenantDatabase {
  private tenants: any[] = [];
  private clinics: any[] = [];
  private users: any[] = [];
  private webhookMappings: any[] = [];
  private auditLogs: any[] = [];
  private currentTenantId: string | null = null;
  private currentUserId: string | null = null;

  constructor(dbPath: string, _masterPassword: string) {
    console.log(`📄 Mock Database initialized (${dbPath})`);
  }

  async initialize(): Promise<void> {
    console.log('✅ Mock database initialized');
  }

  async close(): Promise<void> {
    console.log('✅ Mock database closed');
  }

  setTenantContext(tenantId: string, userId?: string): void {
    this.currentTenantId = tenantId;
    this.currentUserId = userId || null;
  }

  clearTenantContext(): void {
    this.currentTenantId = null;
    this.currentUserId = null;
  }

  // Tenant operations
  async createTenant(tenant: any): Promise<any> {
    const newTenant = {
      id: `tenant_${Date.now()}`,
      ...tenant,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.tenants.push(newTenant);
    return newTenant;
  }

  async getTenant(tenantId: string): Promise<any> {
    return this.tenants.find(t => t.id === tenantId) || null;
  }

  async getTenantBySlug(slug: string): Promise<any> {
    return this.tenants.find(t => t.slug === slug) || null;
  }

  async getAllTenants(options: any = {}): Promise<any[]> {
    return this.tenants.slice(0, options.limit || 20);
  }

  async updateTenant(tenantId: string, updates: any): Promise<any> {
    const index = this.tenants.findIndex(t => t.id === tenantId);
    if (index >= 0) {
      this.tenants[index] = { ...this.tenants[index], ...updates, updatedAt: new Date() };
      return this.tenants[index];
    }
    return null;
  }

  async updateTenantStatus(tenantId: string, status: string, reason: string, userId: string): Promise<any> {
    return this.updateTenant(tenantId, { status, statusReason: reason, statusUpdatedBy: userId });
  }

  async getTenantAnalytics(tenantId: string, period: string): Promise<any> {
    return {
      period,
      clinics: this.clinics.filter(c => c.tenantId === tenantId).length,
      users: this.users.filter(u => u.tenantId === tenantId).length,
      webhooks: this.webhookMappings.filter(w => w.tenantId === tenantId).length
    };
  }

  // Clinic operations
  async createClinic(clinic: any): Promise<any> {
    const newClinic = {
      id: `clinic_${Date.now()}`,
      ...clinic,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.clinics.push(newClinic);
    return newClinic;
  }

  async getClinic(clinicId: string, tenantId?: string): Promise<any> {
    return this.clinics.find(c => c.id === clinicId && (!tenantId || c.tenantId === tenantId)) || null;
  }

  async getClinicsByTenant(tenantId: string, options: any = {}): Promise<any[]> {
    return this.clinics.filter(c => c.tenantId === tenantId).slice(0, options.limit || 20);
  }

  async updateClinic(clinicId: string, updates: any): Promise<any> {
    const index = this.clinics.findIndex(c => c.id === clinicId);
    if (index >= 0) {
      this.clinics[index] = { ...this.clinics[index], ...updates, updatedAt: new Date() };
      return this.clinics[index];
    }
    return null;
  }

  // Webhook operations
  async createWebhookMapping(mapping: any): Promise<any> {
    const newMapping = {
      id: `webhook_${Date.now()}`,
      ...mapping,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.webhookMappings.push(newMapping);
    return newMapping;
  }

  async getWebhookMapping(webhookId: string): Promise<any> {
    return this.webhookMappings.find(w => w.webhookId === webhookId) || null;
  }

  async getWebhookMappingByLegacyParams(clinicParam: string, tenantParam: string): Promise<any> {
    return this.webhookMappings.find(w => 
      w.tenantId === tenantParam && w.webhookId.includes(clinicParam)
    ) || null;
  }

  async getWebhookMappingByClinicIdentifier(clinicParam: string): Promise<any> {
    return this.webhookMappings.find(w => w.webhookId.includes(clinicParam)) || null;
  }

  async deactivateWebhookMapping(webhookId: string, userId: string, reason: string): Promise<void> {
    const mapping = this.webhookMappings.find(w => w.webhookId === webhookId);
    if (mapping) {
      mapping.isActive = false;
      mapping.deactivatedBy = userId;
      mapping.deactivationReason = reason;
      mapping.deactivatedAt = new Date();
    }
  }

  // Audit logging
  async logAuditEvent(event: any): Promise<void> {
    const auditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...event,
      timestamp: new Date(),
      tenantId: event.tenantId || this.currentTenantId,
      userId: event.userId || this.currentUserId
    };
    this.auditLogs.push(auditEvent);
    
    if (event.riskLevel === 'critical' || event.riskLevel === 'high') {
      console.warn(`🚨 ${event.riskLevel.toUpperCase()} audit event:`, auditEvent.action);
    }
  }

  // Development helpers
  async getAuditLogs(tenantId?: string): Promise<any[]> {
    if (tenantId) {
      return this.auditLogs.filter(log => log.tenantId === tenantId);
    }
    return this.auditLogs;
  }

  getMockData(): any {
    return {
      tenants: this.tenants.length,
      clinics: this.clinics.length,
      users: this.users.length,
      webhooks: this.webhookMappings.length,
      auditLogs: this.auditLogs.length
    };
  }
} 