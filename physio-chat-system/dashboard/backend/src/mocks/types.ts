/**
 * Mock Types for Development
 * Basic type definitions for the admin dashboard
 */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  organizationType: string;
  contactInfo: any;
  subscription: {
    plan: string;
    status: string;
    limits: TenantLimits;
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  };
  compliance: any;
  security: any;
  branding?: any;
  isActive: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TenantLimits {
  maxClinics: number;
  maxUsers: number;
  maxConversationsPerMonth: number;
  maxStorageGB: number;
  maxApiCallsPerHour: number;
}

export interface MultiTenantClinicConfig {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  contactInfo: any;
  timezone: string;
  services: string[];
  businessHours: any;
  bookingSystem: any;
  chatConfiguration: any;
  compliance: any;
  webhookUrls: any;
  webhookIdentifier: string;
  isActive: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
} 