import { BaseBookingAdapter, BookingResult, AvailabilityResult, AppointmentInfo, PatientInfo, AvailableSlot, BookingSystemCredentials, AppointmentSearchParams } from './base-booking-adapter';
import { AppointmentData, BookingResponse } from '../../../shared/types';

export interface MockBookingOptions {
  simulateFailures?: boolean;
  responseDelay?: number;
  customMessages?: {
    [key: string]: string;
  };
}

export class MockBookingAdapter extends BaseBookingAdapter {
  private options: MockBookingOptions;

  constructor(
    credentials: BookingSystemCredentials,
    clinicId: string,
    timezone: string = 'UTC',
    options: MockBookingOptions = {}
  ) {
    super(credentials, clinicId, timezone);
    this.options = {
      simulateFailures: false,
      responseDelay: 500,
      ...options
    };
  }

  async testConnection(): Promise<boolean> {
    await this.simulateDelay();
    return !this.options.simulateFailures;
  }

  async getAvailableSlots(params: AppointmentSearchParams): Promise<AvailableSlot[]> {
    await this.simulateDelay();
    
    if (this.options.simulateFailures) {
      throw new Error('Mock booking system: Simulated failure');
    }

    // Generate mock slots
    const slots: AvailableSlot[] = [];
    const baseDate = new Date(params.preferredDate);
    
    for (let i = 0; i < 5; i++) {
      const startTime = new Date(baseDate);
      startTime.setHours(9 + i * 2, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(startTime.getMinutes() + (params.duration || 30));

      slots.push({
        startTime,
        endTime,
        practitionerId: 'mock_practitioner_1',
        practitionerName: 'Dr. Mock',
        serviceId: 'mock_service_1',
        serviceName: params.serviceType || 'General Consultation',
        duration: params.duration || 30,
        displayTime: startTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        }),
        cost: 100
      });
    }

    return slots;
  }

  async createAppointment(appointmentData: AppointmentData): Promise<BookingResponse> {
    await this.simulateDelay();
    
    if (this.options.simulateFailures) {
      throw new Error('Mock booking system: Simulated booking failure');
    }

    return {
      success: true,
      appointmentId: `mock_${Date.now()}`,
      message: 'Appointment booked successfully (mock)',
      details: {
        patientName: appointmentData.patientName,
        dateTime: (appointmentData as any).appointmentDateTime || new Date(),
        service: appointmentData.serviceType
      }
    };
  }

  async cancelAppointment(appointmentId: string, cancellationReason: number): Promise<boolean> {
    await this.simulateDelay();
    
    if (this.options.simulateFailures) {
      return false;
    }

    console.log(`Mock: Cancelled appointment ${appointmentId} with reason ${cancellationReason}`);
    return true;
  }

  async rescheduleAppointment(
    appointmentId: string,
    newDateTime: Date,
    practitionerId?: string,
    serviceId?: string,
    patientId?: string,
    businessId?: string
  ): Promise<BookingResponse> {
    await this.simulateDelay();
    
    if (this.options.simulateFailures) {
      throw new Error('Mock booking system: Simulated reschedule failure');
    }

    return {
      success: true,
      appointmentId,
      message: 'Appointment rescheduled successfully (mock)',
      details: {
        newDateTime,
        practitionerId,
        serviceId
      }
    };
  }

  async getAppointment(appointmentId: string): Promise<AppointmentInfo> {
    await this.simulateDelay();
    
    return {
      id: appointmentId,
      patientName: 'Mock Patient',
      serviceType: 'General Consultation',
      practitionerName: 'Dr. Mock',
      dateTime: new Date(),
      duration: 30,
      status: 'confirmed'
    };
  }

  async getServices(): Promise<Array<{ id: string; name: string; duration: number }>> {
    await this.simulateDelay();
    
    return [
      { id: 'mock_service_1', name: 'General Consultation', duration: 30 },
      { id: 'mock_service_2', name: 'Follow-up', duration: 15 },
      { id: 'mock_service_3', name: 'Extended Consultation', duration: 60 }
    ];
  }

  async getPractitioners(): Promise<Array<{ id: string; name: string; specialties: string[] }>> {
    await this.simulateDelay();
    
    return [
      { id: 'mock_practitioner_1', name: 'Dr. Mock', specialties: ['General Practice'] },
      { id: 'mock_practitioner_2', name: 'Dr. Test', specialties: ['Specialist'] }
    ];
  }

  async searchPatients(searchTerm: string): Promise<PatientInfo[]> {
    await this.simulateDelay();
    
    return [
      {
        id: 'mock_patient_1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890'
      }
    ];
  }

  async createPatient(patientData: any): Promise<PatientInfo> {
    await this.simulateDelay();
    
    return {
      id: `mock_patient_${Date.now()}`,
      firstName: patientData.firstName,
      lastName: patientData.lastName,
      email: patientData.email,
      phone: patientData.phone
    };
  }

  async validateBookingData(appointmentData: AppointmentData): Promise<any> {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  async updateAppointment(appointmentId: string, updates: any): Promise<BookingResponse> {
    await this.simulateDelay();
    
    return {
      success: true,
      appointmentId,
      message: 'Appointment updated successfully (mock)',
      details: updates
    };
  }

  async getPatientHistory(patientId: string): Promise<AppointmentInfo[]> {
    await this.simulateDelay();
    
    return [
      {
        id: 'mock_appointment_1',
        patientName: 'Mock Patient',
        serviceType: 'Previous Consultation',
        practitionerName: 'Dr. Mock',
        dateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        duration: 30,
        status: 'completed'
      }
    ];
  }

  // Missing abstract methods from BaseBookingAdapter
  async validateAppointmentData(appointmentData: AppointmentData): Promise<any> {
    await this.simulateDelay();
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  async getBusinessHours(date: string): Promise<{ open: string; close: string } | null> {
    await this.simulateDelay();
    return { open: '09:00', close: '17:00' };
  }

  async findExistingAppointments(
    patientEmail?: string,
    patientPhone?: string
  ): Promise<Array<{ id: string; date: Date; practitioner: string; service: string }>> {
    await this.simulateDelay();
    return [
      {
        id: 'mock_appointment_1',
        date: new Date(),
        practitioner: 'Dr. Mock',
        service: 'General Consultation'
      }
    ];
  }

  async searchExistingPatient(
    patientName: string,
    patientPhone?: string,
    patientEmail?: string,
    dateOfBirth?: string
  ): Promise<any | null> {
    await this.simulateDelay();
    if (patientName.toLowerCase().includes('mock')) {
      return {
        id: 'mock_patient_1',
        firstName: 'Mock',
        lastName: 'Patient',
        email: patientEmail || 'mock@example.com',
        phone: patientPhone || '+1234567890'
      };
    }
    return null;
  }

  async searchPatientByNameAndDOB(
    patientName: string,
    dateOfBirth: string
  ): Promise<any | null> {
    await this.simulateDelay();
    return {
      id: 'mock_patient_dob',
      firstName: patientName.split(' ')[0],
      lastName: patientName.split(' ')[1] || '',
      dateOfBirth
    };
  }

  async searchPatientByNameAndPhone(
    patientName: string,
    phoneNumber: string
  ): Promise<any | null> {
    await this.simulateDelay();
    return {
      id: 'mock_patient_phone',
      firstName: patientName.split(' ')[0],
      lastName: patientName.split(' ')[1] || '',
      phone: phoneNumber
    };
  }

  async getPatientUpcomingAppointments(patient: any): Promise<Array<{
    id: string;
    date: string;
    time: string;
    practitioner: string;
    service: string;
    duration: number;
    status: string;
  }>> {
    await this.simulateDelay();
    return [
      {
        id: 'mock_upcoming_1',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]!,
        time: '10:00',
        practitioner: 'Dr. Mock',
        service: 'Follow-up',
        duration: 30,
        status: 'confirmed'
      }
    ];
  }

  async createNewPatientBooking(appointmentData: AppointmentData): Promise<BookingResponse> {
    await this.simulateDelay();
    
    if (this.options.simulateFailures) {
      throw new Error('Mock booking system: Simulated new patient booking failure');
    }

    return {
      success: true,
      appointmentId: `mock_new_${Date.now()}`,
      message: 'New patient appointment booked successfully (mock)',
      details: {
        patientId: `mock_patient_${Date.now()}`,
        patientName: appointmentData.patientName,
        service: appointmentData.serviceType
      }
    };
  }

  private async simulateDelay(): Promise<void> {
    if (this.options.responseDelay && this.options.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.options.responseDelay));
    }
  }
}