/**
 * HIPAA Compliance Service
 * Handles all HIPAA requirements including PHI access logging, BAA compliance, and Security/Privacy Rules
 */

import { MultiTenantDatabase } from '../database/multi-tenant-database';
import { EncryptionService } from '../security/encryption';
import {
  HIPAAAccessLog,
  Tenant,
  TenantUser,
  DataType,
  AuditLog
} from '../types/multi-tenant';

export interface HIPAAEntityType {
  type: 'covered_entity' | 'business_associate' | 'subcontractor';
  description: string;
  obligations: string[];
}

export interface BusinessAssociateAgreement {
  id: string;
  tenantId: string;
  entityName: string;
  entityType: HIPAAEntityType;
  agreementDate: Date;
  expirationDate: Date;
  permittedUses: string[];
  permittedDisclosures: string[];
  safeguardRequirements: string[];
  breachNotificationRequirements: string;
  returnDestructionRequirements: string;
  isActive: boolean;
  signedBy: string;
  lastReviewDate?: Date;
}

export interface PHIAccessContext {
  purpose: 'treatment' | 'payment' | 'healthcare_operations' | 'patient_request' | 'emergency' | 'legal_requirement';
  minimumNecessary: boolean;
  patientConsent: boolean;
  authorization?: string; // Authorization form reference
  emergencyOverride?: boolean;
  supervisorApproval?: string; // Supervisor user ID
}

export interface HIPAAComplianceReport {
  tenantId: string;
  reportPeriod: { start: Date; end: Date };
  accessStatistics: {
    totalAccesses: number;
    byPurpose: Record<string, number>;
    byUser: Record<string, number>;
    unauthorizedAttempts: number;
    emergencyAccesses: number;
  };
  minimumNecessaryCompliance: {
    compliantAccesses: number;
    totalAccesses: number;
    complianceRate: number; // percentage
    violations: any[];
  };
  securityIncidents: {
    total: number;
    bySeverity: Record<string, number>;
    phiBreaches: number;
    containedWithin72Hours: number;
  };
  auditLogIntegrity: {
    totalEntries: number;
    integrityViolations: number;
    missingEntries: number;
    tamperingAttempts: number;
  };
  recommendations: string[];
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationRequired: boolean;
  };
}

export interface PHIDataMap {
  dataElement: string;
  dataLocation: string;
  accessLevel: 'unrestricted' | 'restricted' | 'highly_restricted';
  retentionPeriod: number; // years
  encryptionRequired: boolean;
  auditRequired: boolean;
  minimumNecessaryApplies: boolean;
}

export class HIPAAService {
  private database: MultiTenantDatabase;
  private encryptionService: EncryptionService;

  constructor(database: MultiTenantDatabase, encryptionService: EncryptionService) {
    this.database = database;
    this.encryptionService = encryptionService;
  }

  // ============================================================================
  // PHI ACCESS LOGGING
  // ============================================================================

  /**
   * Log PHI access according to HIPAA Security Rule § 164.312(b)
   */
  async logPHIAccess(
    tenantId: string,
    clinicId: string,
    userId: string,
    accessContext: PHIAccessContext,
    dataAccessed: {
      patientIdentifier?: string;
      dataElements: string[];
      accessType: 'view' | 'create' | 'update' | 'delete' | 'export' | 'print';
    },
    systemContext: {
      ipAddress: string;
      userAgent: string;
      sessionId?: string;
    }
  ): Promise<string> {
    const logId = this.encryptionService.generateSecureToken(16);
    const accessStartTime = new Date();

    // Validate minimum necessary compliance
    const minimumNecessaryCompliant = await this.validateMinimumNecessary(
      accessContext,
      dataAccessed.dataElements,
      tenantId
    );

    // Check for authorization requirements
    const authorizationValid = await this.validateAuthorization(
      accessContext,
      dataAccessed.patientIdentifier,
      tenantId
    );

    // Create HIPAA access log
    const hipaaLog: Omit<HIPAAAccessLog, 'id'> = {
      tenantId,
      clinicId,
      userId,
      patientIdentifier: dataAccessed.patientIdentifier ? 
        this.encryptionService.generateSecureHash(dataAccessed.patientIdentifier) : undefined,
      accessType: dataAccessed.accessType,
      accessReason: accessContext.purpose,
      accessJustification: this.generateAccessJustification(accessContext),
      ipAddress: systemContext.ipAddress,
      userAgent: systemContext.userAgent,
      applicationUsed: 'webchat-system',
      dataElements: dataAccessed.dataElements,
      minimumNecessary: minimumNecessaryCompliant,
      accessStartTime,
      authorizedAccess: authorizationValid && minimumNecessaryCompliant,
      supervisorNotified: Boolean(accessContext.supervisorApproval),
      patientNotified: accessContext.purpose === 'patient_request'
    };

    await this.database.createHIPAAAccessLog(hipaaLog);

    // Log in main audit trail
    await this.database.logAuditEvent({
      tenantId,
      clinicId,
      userId,
      sessionId: systemContext.sessionId,
      eventType: 'hipaa_access',
      eventCategory: 'compliance',
      action: `phi_${dataAccessed.accessType}`,
      resource: 'protected_health_information',
      resourceId: dataAccessed.patientIdentifier,
      ipAddress: systemContext.ipAddress,
      userAgent: systemContext.userAgent,
      dataTypes: ['patient_data'],
      dataClassification: 'restricted',
      piiInvolved: true,
      phiInvolved: true,
      success: authorizationValid && minimumNecessaryCompliant,
      riskLevel: this.assessPHIAccessRisk(accessContext, dataAccessed),
      complianceFlags: this.generateComplianceFlags(accessContext, minimumNecessaryCompliant),
      reviewRequired: !authorizationValid || !minimumNecessaryCompliant || accessContext.emergencyOverride,
      additionalData: {
        hipaaLogId: logId,
        accessPurpose: accessContext.purpose,
        dataElementCount: dataAccessed.dataElements.length,
        emergencyAccess: accessContext.emergencyOverride,
        minimumNecessaryCompliant,
        authorizationValid
      }
    });

    // Alert if unauthorized access
    if (!authorizationValid || !minimumNecessaryCompliant) {
      await this.triggerUnauthorizedAccessAlert(tenantId, userId, accessContext, hipaaLog);
    }

    return logId;
  }

  /**
   * End PHI access session and calculate duration
   */
  async endPHIAccess(logId: string, tenantId: string): Promise<void> {
    const accessEndTime = new Date();
    const accessLog = await this.database.getHIPAAAccessLog(logId);
    
    if (!accessLog || accessLog.tenantId !== tenantId) {
      throw new Error('Access log not found or access denied');
    }

    const duration = Math.round((accessEndTime.getTime() - accessLog.accessStartTime.getTime()) / 1000);

    await this.database.updateHIPAAAccessLog(logId, {
      accessEndTime,
      duration
    });

    // Log unusual access patterns
    if (duration > 3600) { // More than 1 hour
      await this.database.logAuditEvent({
        tenantId,
        userId: accessLog.userId,
        eventType: 'suspicious_activity',
        eventCategory: 'security',
        action: 'prolonged_phi_access',
        resource: 'protected_health_information',
        ipAddress: accessLog.ipAddress,
        dataTypes: ['patient_data'],
        dataClassification: 'restricted',
        piiInvolved: true,
        phiInvolved: true,
        success: true,
        riskLevel: 'medium',
        complianceFlags: ['prolonged_access', 'hipaa_security'],
        reviewRequired: true,
        additionalData: {
          accessDuration: duration,
          hipaaLogId: logId
        }
      });
    }
  }

  // ============================================================================
  // BUSINESS ASSOCIATE AGREEMENTS
  // ============================================================================

  /**
   * Create and manage Business Associate Agreement
   */
  async createBusinessAssociateAgreement(
    tenantId: string,
    agreementDetails: Omit<BusinessAssociateAgreement, 'id' | 'tenantId'>
  ): Promise<BusinessAssociateAgreement> {
    const baaId = this.encryptionService.generateSecureToken(16);
    
    const baa: BusinessAssociateAgreement = {
      id: baaId,
      tenantId,
      ...agreementDetails
    };

    await this.database.createBusinessAssociateAgreement(baa);

    // Log BAA creation
    await this.database.logAuditEvent({
      tenantId,
      eventType: 'system_config_change',
      eventCategory: 'compliance',
      action: 'baa_created',
      resource: 'business_associate_agreement',
      resourceId: baaId,
      ipAddress: '127.0.0.1',
      dataTypes: ['clinic_configuration'],
      dataClassification: 'restricted',
      piiInvolved: false,
      phiInvolved: false,
      success: true,
      riskLevel: 'medium',
      complianceFlags: ['hipaa_baa', 'compliance_agreement'],
      additionalData: {
        entityName: agreementDetails.entityName,
        entityType: agreementDetails.entityType.type,
        expirationDate: agreementDetails.expirationDate.toISOString()
      }
    });

    return baa;
  }

  /**
   * Validate BAA compliance for tenant operations
   */
  async validateBAACompliance(tenantId: string): Promise<{
    isCompliant: boolean;
    activeAgreements: number;
    expiringSoon: BusinessAssociateAgreement[];
    violations: string[];
  }> {
    const agreements = await this.database.getBusinessAssociateAgreements(tenantId);
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const activeAgreements = agreements.filter(baa => baa.isActive && baa.expirationDate > now);
    const expiringSoon = agreements.filter(baa => 
      baa.isActive && baa.expirationDate > now && baa.expirationDate <= thirtyDaysFromNow
    );

    const violations: string[] = [];
    
    // Check for required BAA
    if (activeAgreements.length === 0) {
      violations.push('No active Business Associate Agreement found');
    }

    // Check for expiring agreements
    if (expiringSoon.length > 0) {
      violations.push(`${expiringSoon.length} agreement(s) expiring within 30 days`);
    }

    // Check for overdue reviews
    const overdueReviews = agreements.filter(baa => {
      const reviewDue = new Date(baa.lastReviewDate || baa.agreementDate);
      reviewDue.setFullYear(reviewDue.getFullYear() + 1); // Annual review
      return reviewDue < now;
    });

    if (overdueReviews.length > 0) {
      violations.push(`${overdueReviews.length} agreement(s) require annual review`);
    }

    return {
      isCompliant: violations.length === 0,
      activeAgreements: activeAgreements.length,
      expiringSoon,
      violations
    };
  }

  // ============================================================================
  // MINIMUM NECESSARY COMPLIANCE
  // ============================================================================

  /**
   * Validate minimum necessary standard compliance
   */
  private async validateMinimumNecessary(
    accessContext: PHIAccessContext,
    dataElements: string[],
    tenantId: string
  ): Promise<boolean> {
    // Emergency access overrides minimum necessary
    if (accessContext.emergencyOverride) {
      return true;
    }

    // Patient requests have different rules
    if (accessContext.purpose === 'patient_request') {
      return true; // Patients can access their own complete record
    }

    // Get data classification for elements
    const dataMap = await this.database.getPHIDataMap(tenantId);
    
    // Check if access is limited to minimum necessary
    const unnecessaryAccess = dataElements.some(element => {
      const mapping = dataMap.find(dm => dm.dataElement === element);
      return mapping && !mapping.minimumNecessaryApplies;
    });

    return !unnecessaryAccess;
  }

  /**
   * Generate access justification for audit purposes
   */
  private generateAccessJustification(context: PHIAccessContext): string {
    const justifications: string[] = [];

    switch (context.purpose) {
      case 'treatment':
        justifications.push('Access required for patient treatment and care coordination');
        break;
      case 'payment':
        justifications.push('Access required for billing and payment processing');
        break;
      case 'healthcare_operations':
        justifications.push('Access required for healthcare operations and quality improvement');
        break;
      case 'patient_request':
        justifications.push('Patient-requested access to their own health information');
        break;
      case 'emergency':
        justifications.push('Emergency access for immediate patient care needs');
        break;
      case 'legal_requirement':
        justifications.push('Access required to comply with legal or regulatory requirements');
        break;
    }

    if (context.emergencyOverride) {
      justifications.push('Emergency override applied for urgent patient care');
    }

    if (context.supervisorApproval) {
      justifications.push('Supervisor approval obtained for access');
    }

    return justifications.join('. ');
  }

  // ============================================================================
  // COMPLIANCE REPORTING
  // ============================================================================

  /**
   * Generate comprehensive HIPAA compliance report
   */
  async generateComplianceReport(
    tenantId: string,
    reportPeriod: { start: Date; end: Date }
  ): Promise<HIPAAComplianceReport> {
    const [
      accessStats,
      minimumNecessaryStats,
      securityIncidents,
      auditLogStats
    ] = await Promise.all([
      this.database.getHIPAAAccessStatistics(tenantId, reportPeriod),
      this.database.getMinimumNecessaryStatistics(tenantId, reportPeriod),
      this.database.getSecurityIncidentStatistics(tenantId, reportPeriod),
      this.database.getAuditLogIntegrityStatistics(tenantId, reportPeriod)
    ]);

    const riskAssessment = this.performRiskAssessment({
      accessStats,
      minimumNecessaryStats,
      securityIncidents,
      auditLogStats
    });

    const recommendations = this.generateHIPAARecommendations({
      accessStats,
      minimumNecessaryStats,
      securityIncidents,
      auditLogStats,
      riskAssessment
    });

    return {
      tenantId,
      reportPeriod,
      accessStatistics: accessStats,
      minimumNecessaryCompliance: minimumNecessaryStats,
      securityIncidents,
      auditLogIntegrity: auditLogStats,
      recommendations,
      riskAssessment
    };
  }

  /**
   * Perform automated risk assessment
   */
  private performRiskAssessment(stats: any): {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationRequired: boolean;
  } {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Assess unauthorized access attempts
    if (stats.accessStats.unauthorizedAttempts > 0) {
      riskFactors.push('Unauthorized access attempts detected');
      riskScore += stats.accessStats.unauthorizedAttempts * 10;
    }

    // Assess minimum necessary compliance
    if (stats.minimumNecessaryStats.complianceRate < 95) {
      riskFactors.push('Low minimum necessary compliance rate');
      riskScore += (100 - stats.minimumNecessaryStats.complianceRate) * 2;
    }

    // Assess security incidents
    if (stats.securityIncidents.phiBreaches > 0) {
      riskFactors.push('PHI breaches occurred during reporting period');
      riskScore += stats.securityIncidents.phiBreaches * 50;
    }

    // Assess audit log integrity
    if (stats.auditLogStats.integrityViolations > 0) {
      riskFactors.push('Audit log integrity violations detected');
      riskScore += stats.auditLogStats.integrityViolations * 25;
    }

    // Determine overall risk level
    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore < 20) {
      overallRisk = 'low';
    } else if (riskScore < 50) {
      overallRisk = 'medium';
    } else if (riskScore < 100) {
      overallRisk = 'high';
    } else {
      overallRisk = 'critical';
    }

    return {
      overallRisk,
      riskFactors,
      mitigationRequired: riskScore >= 50
    };
  }

  // ============================================================================
  // SECURITY INCIDENT HANDLING
  // ============================================================================

  /**
   * Report PHI breach according to HIPAA Breach Notification Rule
   */
  async reportPHIBreach(
    tenantId: string,
    breachDetails: {
      description: string;
      discoveryDate: Date;
      occurrenceDate?: Date;
      affectedPatients: number;
      dataTypes: string[];
      breachLocation: string;
      causeOfBreach: string;
      containmentMeasures: string[];
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
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
      action: 'phi_breach_reported',
      resource: 'protected_health_information',
      resourceId: breachId,
      ipAddress: '127.0.0.1',
      dataTypes: ['patient_data'],
      dataClassification: 'top_secret',
      piiInvolved: true,
      phiInvolved: true,
      success: true,
      riskLevel: breachDetails.riskLevel,
      complianceFlags: ['hipaa_breach', 'phi_incident'],
      reviewRequired: true,
      additionalData: {
        breachId,
        description: breachDetails.description,
        affectedPatients: breachDetails.affectedPatients,
        discoveryDate: breachDetails.discoveryDate.toISOString(),
        containmentMeasures: breachDetails.containmentMeasures,
        reportTime: reportTime.toISOString()
      }
    });

    // Trigger notification workflows if required
    if (breachDetails.affectedPatients >= 500 || breachDetails.riskLevel === 'critical') {
      await this.triggerBreachNotifications(tenantId, breachId, breachDetails);
    }

    return breachId;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async validateAuthorization(
    context: PHIAccessContext,
    patientIdentifier?: string,
    tenantId?: string
  ): Promise<boolean> {
    // Emergency access is always authorized
    if (context.emergencyOverride) {
      return true;
    }

    // Patient requests are authorized if patient consent exists
    if (context.purpose === 'patient_request') {
      return context.patientConsent;
    }

    // Treatment, payment, operations are generally authorized
    if (['treatment', 'payment', 'healthcare_operations'].includes(context.purpose)) {
      return true;
    }

    // Legal requirements are authorized
    if (context.purpose === 'legal_requirement') {
      return true;
    }

    return false;
  }

  private assessPHIAccessRisk(
    context: PHIAccessContext,
    dataAccessed: any
  ): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    // Emergency access increases risk
    if (context.emergencyOverride) {
      riskScore += 20;
    }

    // Large data access increases risk
    if (dataAccessed.dataElements.length > 10) {
      riskScore += 15;
    }

    // Export/print operations are higher risk
    if (['export', 'print'].includes(dataAccessed.accessType)) {
      riskScore += 25;
    }

    // Lack of patient consent increases risk
    if (!context.patientConsent && context.purpose === 'patient_request') {
      riskScore += 30;
    }

    if (riskScore < 15) return 'low';
    if (riskScore < 35) return 'medium';
    if (riskScore < 60) return 'high';
    return 'critical';
  }

  private generateComplianceFlags(
    context: PHIAccessContext,
    minimumNecessaryCompliant: boolean
  ): string[] {
    const flags = ['hipaa_access'];

    if (context.emergencyOverride) {
      flags.push('emergency_override');
    }

    if (!minimumNecessaryCompliant) {
      flags.push('minimum_necessary_violation');
    }

    if (context.supervisorApproval) {
      flags.push('supervisor_approved');
    }

    flags.push(`purpose_${context.purpose}`);

    return flags;
  }

  private async triggerUnauthorizedAccessAlert(
    tenantId: string,
    userId: string,
    context: PHIAccessContext,
    accessLog: any
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Send immediate alerts to security team
    // 2. Trigger incident response workflow
    // 3. Potentially lock user account
    // 4. Escalate to compliance officer

    console.log(`🚨 Unauthorized PHI access detected: User ${userId} in tenant ${tenantId}`);
    console.log('🔒 Security team and compliance officer would be notified immediately');
  }

  private async triggerBreachNotifications(
    tenantId: string,
    breachId: string,
    breachDetails: any
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Notify HHS within 60 days (or immediately if >500 patients)
    // 2. Notify affected patients within 60 days
    // 3. Notify media if >500 patients in same state/jurisdiction
    // 4. Generate required documentation and forms

    console.log(`🚨 Major PHI breach reported: ${breachId} affecting ${breachDetails.affectedPatients} patients`);
    console.log('📧 HHS notification and patient notification workflows would be triggered');
  }

  private generateHIPAARecommendations(data: any): string[] {
    const recommendations: string[] = [];

    if (data.minimumNecessaryStats.complianceRate < 95) {
      recommendations.push('Implement stricter minimum necessary access controls');
    }

    if (data.accessStats.unauthorizedAttempts > 0) {
      recommendations.push('Review user access permissions and implement additional security training');
    }

    if (data.securityIncidents.phiBreaches > 0) {
      recommendations.push('Conduct comprehensive security assessment and implement additional safeguards');
    }

    if (data.auditLogStats.integrityViolations > 0) {
      recommendations.push('Strengthen audit log protection and implement tamper-evident logging');
    }

    if (data.riskAssessment.overallRisk === 'high' || data.riskAssessment.overallRisk === 'critical') {
      recommendations.push('Immediate risk mitigation required - engage compliance officer');
    }

    return recommendations;
  }
} 