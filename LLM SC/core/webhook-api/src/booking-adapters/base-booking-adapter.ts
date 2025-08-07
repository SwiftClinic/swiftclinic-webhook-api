import { AppointmentData, BookingResponse } from '../../../shared/types';

// Additional types needed by other components
export interface BookingResult {
  success: boolean;
  message: string;
  appointmentId?: string;
  details?: any;
}

export interface AvailabilityResult {
  available: boolean;
  slots: AvailableSlot[];
  message?: string;
}

export interface AppointmentInfo {
  id: string;
  patientName: string;
  serviceType: string;
  practitionerName: string;
  dateTime: Date;
  duration: number;
  status: string;
}

export interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface AvailableSlot {
  startTime: Date;
  endTime: Date;
  practitionerId: string;
  practitionerName: string;
  serviceId: string;
  serviceName: string;
  duration: number; // minutes
  displayTime?: string; // ADDED: Formatted time for LLM display (e.g., "10:00 AM")
  cost?: number;
}

export interface BookingSystemCredentials {
  apiKey?: string;
  secret?: string;
  baseUrl?: string;
  businessId?: string;
  [key: string]: any; // Allow additional system-specific credentials
}

export interface AppointmentSearchParams {
  serviceType?: string;
  practitionerName?: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTime?: string; // HH:mm
  duration?: number; // minutes
  searchDays?: number; // How many days to search ahead (default: 7)
}

export interface BookingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Abstract base class for all booking system adapters
 * Each booking system (Cliniko, Jane App, etc.) implements this interface
 */
export abstract class BaseBookingAdapter {
  protected credentials: BookingSystemCredentials;
  protected clinicId: string;
  protected timezone: string;

  constructor(
    credentials: BookingSystemCredentials, 
    clinicId: string, 
    timezone: string = 'UTC'
  ) {
    this.credentials = credentials;
    this.clinicId = clinicId;
    this.timezone = timezone;
  }

  /**
   * Test connection to the booking system
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get available appointment slots
   */
  abstract getAvailableSlots(params: AppointmentSearchParams): Promise<AvailableSlot[]>;

  /**
   * Create a new appointment
   */
  abstract createAppointment(appointmentData: AppointmentData): Promise<BookingResponse>;

  /**
   * Cancel an existing appointment
   */
  abstract cancelAppointment(appointmentId: string, cancellationReason: number): Promise<boolean>;

  /**
   * Reschedule an existing appointment
   */
  abstract rescheduleAppointment(
    appointmentId: string, 
    newDateTime: Date,
    practitionerId?: string,  // ✅ Optional practitioner ID from availability check
    serviceId?: string,       // ✅ Optional service ID from availability check  
    patientId?: string,       // ✅ Optional patient ID from search results
    businessId?: string       // ✅ Optional business ID from configuration
  ): Promise<BookingResponse>;

  /**
   * Get appointment details by ID
   */
  abstract getAppointment(appointmentId: string): Promise<any>;

  /**
   * Get list of available services
   */
  abstract getServices(): Promise<Array<{ id: string; name: string; duration: number }>>;

  /**
   * Get list of available practitioners
   */
  abstract getPractitioners(): Promise<Array<{ id: string; name: string; specialties: string[] }>>;

  /**
   * Validate appointment data before booking
   */
  abstract validateAppointmentData(appointmentData: AppointmentData): Promise<BookingValidationResult>;

  /**
   * Get business hours for a specific date
   */
  abstract getBusinessHours(date: string): Promise<{ open: string; close: string } | null>;

  /**
   * Search for existing appointments by patient details
   */
  abstract findExistingAppointments(
    patientEmail?: string, 
    patientPhone?: string
  ): Promise<Array<{ id: string; date: Date; practitioner: string; service: string }>>;

  /**
   * Search for an existing patient by name and contact details
   */
  abstract searchExistingPatient(
    patientName: string,
    patientPhone?: string,
    patientEmail?: string,
    dateOfBirth?: string
  ): Promise<any | null>;

  /**
   * Search for a patient by name and date of birth (for cancellation flow)
   */
  abstract searchPatientByNameAndDOB(
    patientName: string,
    dateOfBirth: string
  ): Promise<any | null>;

  /**
   * Search for a patient by name and phone number (for cancellation flow) - DEPRECATED: Use searchPatientByNameAndDOB instead
   */
  abstract searchPatientByNameAndPhone(
    patientName: string,
    phoneNumber: string
  ): Promise<any | null>;

  /**
   * Get detailed upcoming appointments for a patient (for cancellation flow)
   */
  abstract getPatientUpcomingAppointments(patient: any): Promise<Array<{
    id: string;
    date: string;
    time: string;
    practitioner: string;
    service: string;
    duration: number;
    status: string;
  }>>;

  /**
   * Create a new patient and book an appointment in one operation
   */
  abstract createNewPatientBooking(appointmentData: AppointmentData): Promise<BookingResponse>;

  /**
   * Get booking system specific information
   */
  getBookingSystemInfo(): { name: string; version: string; features: string[] } {
    return {
      name: this.constructor.name.replace('Adapter', ''),
      version: '1.0.0',
      features: ['booking', 'cancellation', 'rescheduling']
    };
  }

  /**
   * Format error messages in a user-friendly way
   */
  protected formatErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.response?.data?.message) return error.response.data.message;
    return 'An unexpected error occurred while communicating with the booking system';
  }

  /**
   * Convert local date/time to booking system timezone
   */
  protected convertToSystemTimezone(dateTime: Date): Date {
    // Use moment-timezone for proper conversion from UTC to clinic timezone
    const moment = require('moment-timezone');
    return moment.tz(dateTime, this.timezone).toDate();
  }

  /**
   * Log booking system interactions for debugging
   */
  protected logInteraction(action: string, details: any): void {
    console.log(`[${this.constructor.name}] ${action}:`, details);
  }
} 