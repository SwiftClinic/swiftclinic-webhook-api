// GDPR-Compliant Data Types for Physio Chat System

export interface ClinicConfig {
  id: string;
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
  gdprSettings: GDPRSettings;
  webhookUrl: string;
  timezone?: string; // IANA timezone identifier (e.g., 'Europe/London', 'America/New_York')
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GDPRSettings {
  dataRetentionDays: number;
  allowDataProcessing: boolean;
  cookieConsent: boolean;
  privacyPolicyUrl?: string;
  consentText?: string;
}

export interface EncryptedCredentials {
  // Encrypted JSON containing booking system credentials
  data: string;
  iv: string;
  tag: string;
  // For Cliniko specifically, we'll store:
  // { apiKey: string, shard: string, businessId: string }
  // For other systems, different fields as needed
}

export interface KnowledgeBase {
  id: string;
  clinicId: string;
  documents: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    lastUpdated: Date;
  }>;
  faqs: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
    priority: number;
  }>;
}

export interface ConversationLog {
  id: string;
  clinicId: string;
  sessionId: string;
  messages: ChatMessage[];
  startedAt: Date;
  endedAt?: Date;
  userConsent: boolean;
  anonymized: boolean;
  retentionExpiry: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  containsPII: boolean;
  functionCalls?: FunctionCall[];
}

export interface FunctionCall {
  name: string;
  parameters: any;
  result: any;
  timestamp: Date;
}

export interface AppointmentData {
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  dateOfBirth?: string; // YYYY-MM-DD format as per Cliniko API
  serviceType: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTime: string; // HH:mm
  duration?: number; // minutes
  notes?: string;
  therapistPreference?: string;
}

export interface BookingResponse {
  success: boolean;
  appointmentId?: string;
  scheduledDateTime?: Date;
  therapistName?: string;
  confirmationCode?: string;
  message?: string; // Added for success/error messages
  details?: any; // Added for additional details
  patient?: any; // Added for patient information
  error?: string;
}

export interface SecurityConfig {
  encryptionAlgorithm: string;
  keyDerivationRounds: number;
  sessionTimeout: number;
  maxLoginAttempts: number;
  passwordMinLength: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface WebhookPayload {
  message: string;
  sessionId?: string;
  userConsent?: boolean;
  metadata?: any;
}

export type BookingSystemType = 
  | 'cliniko' 
  | 'jane-app' 
  | 'acuity' 
  | 'simple-practice' 
  | 'square-appointments' 
  | 'custom'; 