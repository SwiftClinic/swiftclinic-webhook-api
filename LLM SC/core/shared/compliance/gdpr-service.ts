/**
 * GDPR Compliance Service
 * Handles all GDPR requirements including data subject rights, audit trails, and regulatory compliance
 */

import { MultiTenantDatabase } from '../database/multi-tenant-database';
import { EncryptionService } from '../security/encryption';
import {
  GDPRRequest,
  Tenant,
  TenantUser,
  DataType,
  AuditLog
} from '../types/multi-tenant';

export interface DataSubjectRights {
  rightToAccess: boolean;
  rightToRectification: boolean;
  rightToErasure: boolean;
  rightToRestriction: boolean;
  rightToPortability: boolean;
  rightToObject: boolean;
}

export interface GDPRDataExport {
  requestId: string;
  dataSubject: {
    identifiers: string[];
    dateRange?: { start: Date; end: Date };
  };
  exportedData: {
    personalData: any[];
    conversationLogs: any[];
    appointmentData: any[];
    auditLogs: any[];
  };
  metadata: {
    exportDate: Date;
    dataProcessor: string;
    dataController: string;
    retentionPeriod: string;
    legalBasis: string;
  };
  signature: string; // Cryptographic signature for integrity
}

export interface GDPRComplianceReport {
  tenantId: string;
  reportPeriod: { start: Date; end: Date };
  dataProcessingActivities: {
    totalConversations: number;
    dataSubjectsCount: number;
    retentionCompliance: number; // percentage
    consentRate: number; // percentage
  };
  dataSubjectRequests: {
    total: number;
    byType: Record<string, number>;
    averageResponseTime: number; // hours
    complianceRate: number; // percentage within 30 days
  };
  breachReports: {
    total: number;
    severity: Record<string, number>;
    notificationCompliance: number; // percentage within 72 hours
  };
  recommendations: string[];
}

export class GDPRService {
  private database: MultiTenantDatabase;
  private encryptionService: EncryptionService;

  constructor(database: MultiTenantDatabase, encryptionService: EncryptionService) {
    this.database = database;
    this.encryptionService = encryptionService;
  }

  // ============================================================================
  // DATA SUBJECT RIGHTS
  // ============================================================================

  /**
   * Handle GDPR data subject access request (Article 15)
   */
  async handleAccessRequest(
    tenantId: string,
    requesterEmail: string,
    identifiers: string[],
    dateRange?: { start: Date; end: Date },
    verificationMethod?: string
  ): Promise<GDPRRequest> {
    const requestId = this.encryptionService.generateSecureToken(16);
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create GDPR request record
    const request: Omit<GDPRRequest, 'id'> = {
      tenantId,
      requestType: 'access',
      status: 'pending',
      requesterEmail,
      identityVerified: Boolean(verificationMethod),
      verificationMethod,
      dataSubject: {
        identifiers,
        dateRange,
        dataTypes: ['conversation_logs', 'appointment_data', 'user_data']
      },
      requestedAt: new Date(),
      dueDate,
      auditLog: []
    };

    await this.database.createGDPRRequest(request);

    // Log the request
    await this.database.logAuditEvent({
      tenantId,
      eventType: 'gdpr_request',
      eventCategory: 'compliance',
      action: 'access_request_created',
      resource: 'gdpr_request',
      resourceId: requestId,
      ipAddress: '127.0.0.1', // Would be actual IP in real implementation
      dataTypes: ['user_data'],
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: false,
      success: true,
      riskLevel: 'medium',
      complianceFlags: ['gdpr_article_15'],
      additionalData: { requestType: 'access', requesterEmail }
    });

    return { id: requestId, ...request };
  }

  /**
   * Handle GDPR data portability request (Article 20)
   */
  async handlePortabilityRequest(
    tenantId: string,
    requesterEmail: string,
    identifiers: string[],
    dataTypes: DataType[],
    format: 'json' | 'csv' | 'xml' = 'json'
  ): Promise<GDPRRequest> {
    const requestId = this.encryptionService.generateSecureToken(16);
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const request: Omit<GDPRRequest, 'id'> = {
      tenantId,
      requestType: 'portability',
      status: 'pending',
      requesterEmail,
      identityVerified: false, // Requires additional verification for portability
      dataSubject: {
        identifiers,
        dataTypes
      },
      requestedAt: new Date(),
      dueDate,
      auditLog: []
    };

    await this.database.createGDPRRequest(request);

    await this.database.logAuditEvent({
      tenantId,
      eventType: 'gdpr_request',
      eventCategory: 'compliance',
      action: 'portability_request_created',
      resource: 'gdpr_request',
      resourceId: requestId,
      ipAddress: '127.0.0.1',
      dataTypes: ['user_data'],
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: false,
      success: true,
      riskLevel: 'high', // Higher risk due to data export
      complianceFlags: ['gdpr_article_20'],
      additionalData: { requestType: 'portability', format, dataTypes }
    });

    return { id: requestId, ...request };
  }

  /**
   * Handle GDPR right to erasure request (Article 17)
   */
  async handleErasureRequest(
    tenantId: string,
    requesterEmail: string,
    identifiers: string[],
    reason: 'withdrawal_of_consent' | 'no_longer_necessary' | 'unlawful_processing' | 'compliance_obligation',
    clinicId?: string
  ): Promise<GDPRRequest> {
    const requestId = this.encryptionService.generateSecureToken(16);
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const request: Omit<GDPRRequest, 'id'> = {
      tenantId,
      clinicId,
      requestType: 'erasure',
      status: 'pending',
      requesterEmail,
      identityVerified: false, // Requires strong verification for erasure
      dataSubject: {
        identifiers,
        dataTypes: ['conversation_logs', 'appointment_data', 'user_data', 'audit_logs']
      },
      requestedAt: new Date(),
      dueDate,
      auditLog: []
    };

    await this.database.createGDPRRequest(request);

    await this.database.logAuditEvent({
      tenantId,
      clinicId,
      eventType: 'gdpr_request',
      eventCategory: 'compliance',
      action: 'erasure_request_created',
      resource: 'gdpr_request',
      resourceId: requestId,
      ipAddress: '127.0.0.1',
      dataTypes: ['user_data'],
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: true, // Likely contains health data
      success: true,
      riskLevel: 'critical', // Highest risk due to data deletion
      complianceFlags: ['gdpr_article_17'],
      reviewRequired: true,
      additionalData: { requestType: 'erasure', reason, identifiers: identifiers.length }
    });

    return { id: requestId, ...request };
  }

  // ============================================================================
  // DATA EXPORT & PROCESSING
  // ============================================================================

  /**
   * Generate comprehensive data export for data subject
   */
  async generateDataExport(requestId: string, tenantId: string): Promise<GDPRDataExport> {
    const request = await this.database.getGDPRRequest(requestId);
    if (!request || request.tenantId !== tenantId) {
      throw new Error('GDPR request not found or access denied');
    }

    const tenant = await this.database.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Collect all data for the data subject
    const exportData = await this.collectDataSubjectData(request.dataSubject, tenantId);

    const gdprExport: GDPRDataExport = {
      requestId,
      dataSubject: request.dataSubject,
      exportedData: exportData,
      metadata: {
        exportDate: new Date(),
        dataProcessor: 'LLM Chat System',
        dataController: tenant.name,
        retentionPeriod: `${tenant.compliance.gdprRequired ? '30 days' : 'As configured'}`,
        legalBasis: 'Consent (Article 6(1)(a)) and Legitimate Interest (Article 6(1)(f))'
      },
      signature: this.generateExportSignature(exportData)
    };

    // Log the export
    await this.database.logAuditEvent({
      tenantId,
      eventType: 'gdpr_export',
      eventCategory: 'compliance',
      action: 'data_export_generated',
      resource: 'gdpr_request',
      resourceId: requestId,
      ipAddress: '127.0.0.1',
      dataTypes: request.dataSubject.dataTypes,
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: true,
      success: true,
      riskLevel: 'high',
      complianceFlags: ['gdpr_data_export'],
      additionalData: {
        recordCount: Object.values(exportData).flat().length,
        exportSizeKB: Math.round(JSON.stringify(exportData).length / 1024)
      }
    });

    return gdprExport;
  }

  /**
   * Execute data erasure (right to be forgotten)
   */
  async executeDataErasure(requestId: string, tenantId: string, userId: string): Promise<{
    deletedRecords: number;
    anonymizedRecords: number;
    retainedRecords: number;
    retentionReasons: string[];
  }> {
    const request = await this.database.getGDPRRequest(requestId);
    if (!request || request.tenantId !== tenantId) {
      throw new Error('GDPR request not found or access denied');
    }

    if (request.requestType !== 'erasure') {
      throw new Error('Invalid request type for erasure operation');
    }

    let deletedRecords = 0;
    let anonymizedRecords = 0;
    let retainedRecords = 0;
    const retentionReasons: string[] = [];

    // Start transaction for atomic operation
    const results = await this.database.executeInTransaction(async () => {
      // Delete conversation logs (unless required for legal/regulatory retention)
      const conversationResults = await this.database.deleteDataSubjectConversations(
        request.dataSubject.identifiers,
        tenantId
      );
      deletedRecords += conversationResults.deleted;
      retainedRecords += conversationResults.retained;
      if (conversationResults.retained > 0) {
        retentionReasons.push('Legal retention requirement for healthcare records');
      }

      // Anonymize appointment data (may need to be retained for healthcare compliance)
      const appointmentResults = await this.database.anonymizeDataSubjectAppointments(
        request.dataSubject.identifiers,
        tenantId
      );
      anonymizedRecords += appointmentResults.anonymized;
      retainedRecords += appointmentResults.retained;
      if (appointmentResults.retained > 0) {
        retentionReasons.push('Healthcare regulatory requirement (HIPAA/medical records retention)');
      }

      // Delete user profile data (if not clinic staff)
      const userResults = await this.database.deleteDataSubjectUserData(
        request.dataSubject.identifiers,
        tenantId
      );
      deletedRecords += userResults.deleted;

      // Retain audit logs as required by law
      retentionReasons.push('Audit logs retained for regulatory compliance (7 years)');

      return { deletedRecords, anonymizedRecords, retainedRecords };
    });

    // Update request status
    await this.database.updateGDPRRequest(requestId, {
      status: 'completed',
      completedAt: new Date(),
      deletedRecords: results.deletedRecords,
      processedBy: userId
    });

    // Log the erasure
    await this.database.logAuditEvent({
      tenantId,
      userId,
      eventType: 'gdpr_deletion',
      eventCategory: 'compliance',
      action: 'data_erasure_executed',
      resource: 'gdpr_request',
      resourceId: requestId,
      ipAddress: '127.0.0.1',
      dataTypes: request.dataSubject.dataTypes,
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: true,
      success: true,
      riskLevel: 'critical',
      complianceFlags: ['gdpr_article_17', 'right_to_erasure'],
      reviewRequired: true,
      additionalData: {
        deletedRecords: results.deletedRecords,
        anonymizedRecords: results.anonymizedRecords,
        retainedRecords: results.retainedRecords,
        retentionReasons
      }
    });

    return { ...results, retentionReasons };
  }

  // ============================================================================
  // COMPLIANCE MONITORING
  // ============================================================================

  /**
   * Generate GDPR compliance report
   */
  async generateComplianceReport(
    tenantId: string,
    reportPeriod: { start: Date; end: Date }
  ): Promise<GDPRComplianceReport> {
    const [
      dataProcessingStats,
      requestStats,
      breachStats
    ] = await Promise.all([
      this.database.getDataProcessingStatistics(tenantId, reportPeriod),
      this.database.getGDPRRequestStatistics(tenantId, reportPeriod),
      this.database.getBreachStatistics(tenantId, reportPeriod)
    ]);

    const recommendations = this.generateComplianceRecommendations({
      dataProcessingStats,
      requestStats,
      breachStats
    });

    return {
      tenantId,
      reportPeriod,
      dataProcessingActivities: dataProcessingStats,
      dataSubjectRequests: requestStats,
      breachReports: breachStats,
      recommendations
    };
  }

  /**
   * Check automatic data retention compliance
   */
  async checkRetentionCompliance(tenantId: string): Promise<{
    expiredRecords: number;
    pendingDeletion: any[];
    complianceRate: number;
  }> {
    const expiredConversations = await this.database.getExpiredConversations(tenantId);
    const expiredRequests = await this.database.getExpiredGDPRRequests(tenantId);

    const totalExpired = expiredConversations.length + expiredRequests.length;
    const totalRecords = await this.database.getTotalDataRecords(tenantId);
    const complianceRate = totalRecords > 0 ? ((totalRecords - totalExpired) / totalRecords) * 100 : 100;

    return {
      expiredRecords: totalExpired,
      pendingDeletion: [...expiredConversations, ...expiredRequests],
      complianceRate
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async collectDataSubjectData(
    dataSubject: { identifiers: string[]; dataTypes: DataType[] },
    tenantId: string
  ): Promise<{
    personalData: any[];
    conversationLogs: any[];
    appointmentData: any[];
    auditLogs: any[];
  }> {
    const results = await Promise.all([
      this.database.getDataSubjectPersonalData(dataSubject.identifiers, tenantId),
      this.database.getDataSubjectConversations(dataSubject.identifiers, tenantId),
      this.database.getDataSubjectAppointments(dataSubject.identifiers, tenantId),
      this.database.getDataSubjectAuditLogs(dataSubject.identifiers, tenantId)
    ]);

    return {
      personalData: results[0],
      conversationLogs: results[1],
      appointmentData: results[2],
      auditLogs: results[3]
    };
  }

  private generateExportSignature(data: any): string {
    const dataString = JSON.stringify(data, null, 2);
    return this.encryptionService.generateSecureHash(dataString);
  }

  private generateComplianceRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.requestStats.complianceRate < 95) {
      recommendations.push('Improve GDPR request response times - current compliance rate below 95%');
    }

    if (stats.dataProcessingStats.consentRate < 90) {
      recommendations.push('Increase consent collection rates - current rate below recommended 90%');
    }

    if (stats.breachStats.notificationCompliance < 100) {
      recommendations.push('Improve breach notification procedures - ensure 72-hour notification compliance');
    }

    if (stats.dataProcessingStats.retentionCompliance < 95) {
      recommendations.push('Review data retention policies - automated cleanup may need adjustment');
    }

    return recommendations;
  }

  // ============================================================================
  // BREACH NOTIFICATION
  // ============================================================================

  /**
   * Report and handle data breach according to GDPR Article 33
   */
  async reportDataBreach(
    tenantId: string,
    breachDetails: {
      description: string;
      dataTypes: DataType[];
      affectedRecords: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      containmentMeasures: string[];
      notificationRequired: boolean;
    },
    reportedBy: string
  ): Promise<string> {
    const breachId = this.encryptionService.generateSecureToken(16);
    const reportTime = new Date();

    // Log the breach
    await this.database.logAuditEvent({
      tenantId,
      userId: reportedBy,
      eventType: 'security_incident',
      eventCategory: 'security',
      action: 'data_breach_reported',
      resource: 'security_incident',
      resourceId: breachId,
      ipAddress: '127.0.0.1',
      dataTypes: breachDetails.dataTypes,
      dataClassification: 'top_secret',
      piiInvolved: true,
      phiInvolved: breachDetails.dataTypes.includes('patient_data'),
      success: true,
      riskLevel: breachDetails.riskLevel,
      complianceFlags: ['gdpr_article_33', 'data_breach'],
      reviewRequired: true,
      additionalData: {
        breachId,
        description: breachDetails.description,
        affectedRecords: breachDetails.affectedRecords,
        containmentMeasures: breachDetails.containmentMeasures,
        notificationRequired: breachDetails.notificationRequired,
        reportTime: reportTime.toISOString()
      }
    });

    // If high risk, automatically trigger notification procedures
    if (breachDetails.riskLevel === 'high' || breachDetails.riskLevel === 'critical') {
      await this.triggerBreachNotifications(tenantId, breachId, breachDetails);
    }

    return breachId;
  }

  private async triggerBreachNotifications(
    tenantId: string,
    breachId: string,
    breachDetails: any
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Notify supervisory authority within 72 hours
    // 2. Notify affected data subjects if high risk
    // 3. Generate incident response workflows
    // 4. Create compliance documentation

    console.log(`🚨 High-risk data breach reported: ${breachId} for tenant: ${tenantId}`);
    console.log('📧 Automated notifications would be sent to compliance team and supervisory authority');
  }
} 