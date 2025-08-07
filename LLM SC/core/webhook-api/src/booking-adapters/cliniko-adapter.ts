import axios, { AxiosInstance, AxiosError } from 'axios';
import moment from 'moment-timezone';
import { AppointmentData, BookingResponse } from '../../../shared/types';
import { 
  BaseBookingAdapter, 
  AvailableSlot, 
  BookingSystemCredentials, 
  AppointmentSearchParams,
  BookingValidationResult 
} from './base-booking-adapter';

interface ClinikoCredentials extends BookingSystemCredentials {
  apiKey: string;
  shard: string; // e.g., 'uk2', 'au1'
  businessId: string; // Required for available times API
  baseUrl?: string; // Will be constructed from shard
}

interface ClinikoAppointment {
  id: number;
  starts_at: string;
  ends_at: string;
  appointment_type: {
    id: number;
    name: string;
  };
  practitioner: {
    id: number;
    first_name: string;
    last_name: string;
  };
  patient: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  notes: string;
  cancelled_at: string | null;
}

interface ClinikoAvailableTime {
  appointment_start: string; // Only field returned by Cliniko API
}

interface ClinikoAppointmentType {
  id: number; // Keep as number - this is how Cliniko API returns it
  name: string;
  duration_in_minutes: number;
  show_online: boolean;
}

interface ClinikoPractitioner {
  id: number; // Keep as number - this is how Cliniko API returns it
  first_name: string;
  last_name: string;
  show_in_online_bookings: boolean;
  title: string;
}

interface ClinikoPatient {
  id: number; // Keep as number - this is how Cliniko API returns it
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  patient_phone_numbers?: {
    phone_type: string;
    number: string;
  }[];
  date_of_birth?: string; // Added for DOB search
}

export class ClinikoAdapter extends BaseBookingAdapter {
  private api: AxiosInstance;
  protected credentials: ClinikoCredentials;

  constructor(credentials: ClinikoCredentials, clinicId: string, timezone: string = 'UTC') {
    super(credentials, clinicId, timezone);
    this.credentials = credentials;
    
    // Construct the correct base URL with shard
    const baseUrl = `https://api.${credentials.shard}.cliniko.com/v1`;
    
    // Initialize Axios instance with Cliniko authentication
    this.api = axios.create({
      baseURL: baseUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Physio-Chat-System/1.0'
      },
      auth: {
        username: credentials.apiKey,
        password: '' // Cliniko uses API key as username with empty password
      },
      timeout: 30000 // 30 second timeout
    });

    // Add request/response interceptors for logging
    this.api.interceptors.request.use(
      (config) => {
        this.logInteraction('API Request', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          params: config.params
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => {
        this.logInteraction('API Response', {
          status: response.status,
          url: response.config.url,
          dataLength: JSON.stringify(response.data).length
        });
        return response;
      },
      (error: AxiosError) => {
        this.logInteraction('API Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * PHASE 2: Create a fresh API client to eliminate caching/state issues
   */
  private createFreshAPIClient(): AxiosInstance {
    console.log('🔄 [ClinikoAdapter] Creating fresh API client as fallback...');
    const baseUrl = `https://api.${this.credentials.shard}.cliniko.com/v1`;
    
    const freshApi = axios.create({
      baseURL: baseUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Physio-Chat-System-Fresh/1.0'
      },
      auth: {
        username: this.credentials.apiKey,
        password: ''
      },
      timeout: 30000
    });

    console.log('🔄 [ClinikoAdapter] Fresh API client created with:', {
      baseURL: baseUrl,
      authUsername: this.credentials.apiKey?.slice(0, 20) + '...',
      authUsernameLength: this.credentials.apiKey?.length || 0
    });

    return freshApi;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple patients endpoint call
      const response = await this.api.get('/patients', {
        params: { per_page: 1 }
      });
      return response.status === 200;
    } catch (error: any) {
      console.error('Cliniko connection test failed:', this.formatErrorMessage(error));
      return false;
    }
  }

  async getAvailableSlots(params: AppointmentSearchParams): Promise<AvailableSlot[]> {
    console.log('🔍 [ClinikoAdapter] getAvailableSlots called with params:', JSON.stringify(params, null, 2));
    console.log(`🕐 [ClinikoAdapter] Using timezone: ${this.timezone} for availability search`);
    
    try {
      const { preferredDate, preferredTime, serviceType, practitionerName } = params;
      const searchDays = params.searchDays || 7;

      console.log('🔍 [ClinikoAdapter] Searching for:', { preferredDate, preferredTime, serviceType, practitionerName, searchDays });

      // Validate and set default date if not provided
      let startDate: moment.Moment;
      if (preferredDate) {
        // Ensure we're parsing the date in the clinic's timezone
        startDate = moment.tz(preferredDate, 'YYYY-MM-DD', this.timezone);
        if (!startDate.isValid()) {
          console.warn('❌ [ClinikoAdapter] Invalid preferred date, using today:', preferredDate);
          startDate = moment.tz(this.timezone);
        }
      } else {
        console.log('🔍 [ClinikoAdapter] No preferred date provided, using today');
        startDate = moment.tz(this.timezone);
      }

      console.log(`🕐 [ClinikoAdapter] Start date in timezone ${this.timezone}: ${startDate.format('YYYY-MM-DD HH:mm:ss z')}`);

      const availableSlots: AvailableSlot[] = [];

      // Get all available appointment types and practitioners
      console.log('🔍 [ClinikoAdapter] Fetching appointment types and practitioners...');
      const [appointmentTypes, practitioners] = await Promise.all([
        this.getServices(),
        this.getPractitioners()
      ]);

      console.log('🔍 [ClinikoAdapter] Found appointment types:', appointmentTypes.length);
      console.log('🔍 [ClinikoAdapter] Found practitioners:', practitioners.length);

      if (appointmentTypes.length === 0) {
        console.warn('❌ [ClinikoAdapter] No appointment types found');
        return [];
      }

      if (practitioners.length === 0) {
        console.warn('❌ [ClinikoAdapter] No practitioners found');
        return [];
      }

      // DON'T FILTER BY SERVICE TYPE HERE - Use ALL appointment types initially
      // We'll filter locally after getting all results for better matching
      let targetAppointmentTypes = appointmentTypes;
      console.log('🔍 [ClinikoAdapter] Using ALL appointment types for comprehensive search:', targetAppointmentTypes.length);

      // Filter by practitioner if specified
      let targetPractitioners = practitioners;
      if (practitionerName) {
        targetPractitioners = practitioners.filter(prac => 
          `${prac.name}`.toLowerCase().includes(practitionerName.toLowerCase())
        );
        console.log('🔍 [ClinikoAdapter] Filtered to practitioners:', targetPractitioners.length);
      }

      // SAME-DAY FOCUSED SEARCH: When searchDays=1, only search the specific date
      const endDate = searchDays === 1 ? startDate.clone().add(1, 'day') : startDate.clone().add(searchDays, 'days');
      console.log('🔍 [ClinikoAdapter] Searching from:', startDate.format('YYYY-MM-DD'), 'to:', endDate.format('YYYY-MM-DD'), `(${searchDays === 1 ? 'SAME-DAY FOCUS' : 'MULTI-DAY'})`);

      // Search for available times with COMPREHENSIVE PAGINATION
      for (let date = startDate.clone(); date.isBefore(endDate); date.add(1, 'day')) {
        const dateStr = date.format('YYYY-MM-DD');
        console.log('🔍 [ClinikoAdapter] Checking date:', dateStr);
        
        for (const appointmentType of targetAppointmentTypes) {
          for (const practitioner of targetPractitioners) {
            try {
              // COMPREHENSIVE PAGINATION: Get ALL available times for this day
              const allTimeSlotsForDay = await this.getAllAvailableTimesForDay(
                dateStr, 
                practitioner.id, 
                appointmentType.id,
                practitioner.name,
                appointmentType.name
              );
              
              // Process each time slot with correct timezone conversion
              for (const timeSlot of allTimeSlotsForDay) {
                const utcTime = moment.utc(timeSlot.appointment_start);
                const clinicTime = utcTime.tz(this.timezone);
                const clinicEndTime = clinicTime.clone().add(appointmentType.duration || 30, 'minutes');
                const duration = clinicEndTime.diff(clinicTime, 'minutes');
                
                console.log(`🔍 [DEBUG] Converting (${this.timezone}): UTC ${utcTime.format('YYYY-MM-DD HH:mm:ss')} -> Clinic ${clinicTime.format('YYYY-MM-DD HH:mm:ss')}`);
                
                // Store all slots - we'll filter locally afterward
                availableSlots.push({
                  startTime: clinicTime.toDate(), // Clinic local time
                  endTime: clinicEndTime.toDate(), // Clinic local time
                  practitionerId: practitioner.id,
                  practitionerName: practitioner.name,
                  serviceId: appointmentType.id,
                  serviceName: appointmentType.name,
                  duration: duration
                });
              }
            } catch (error: any) {
              console.warn(`Failed to get available times for ${practitioner.name} - ${appointmentType.name}:`, error);
              // Continue with other combinations
            }
          }
        }
      }

      console.log('🔍 [ClinikoAdapter] Total slots found before filtering:', availableSlots.length);

      // LOCAL FILTERING: Filter by service type AFTER getting all results using EXACT ID matching
      let filteredSlots = availableSlots;
      
      if (serviceType) {
        const originalCount = filteredSlots.length;
        
        // Step 1: Get the exact appointment type ID for the requested service
        const requestedAppointmentType = await this.findAppointmentTypeByName(serviceType);
        
        if (requestedAppointmentType) {
          console.log(`🔍 [ClinikoAdapter] Filtering by exact appointment type ID: ${requestedAppointmentType.id} (${requestedAppointmentType.name})`);
          
          // Step 2: Filter slots by exact service ID match
          filteredSlots = filteredSlots.filter(slot => 
            slot.serviceId === requestedAppointmentType.id
          );
          
          console.log(`🔍 [ClinikoAdapter] Exact ID filtering: ${originalCount} -> ${filteredSlots.length} slots`);
        } else {
          console.log(`❌ [ClinikoAdapter] No appointment type found for "${serviceType}"`);
          // If service type not found, return empty to avoid confusion
          filteredSlots = [];
        }
        
        // Log available services for debugging if no matches
        if (filteredSlots.length === 0 && originalCount > 0) {
          const availableServices = [...new Set(availableSlots.map(slot => `${slot.serviceName} (ID: ${slot.serviceId})`))];
          console.log(`🔍 [ClinikoAdapter] No matches for "${serviceType}". Available services:`, availableServices);
        }
      }

      // PRIORITY-BASED TIME FILTERING: Prioritize DAY > TIME
      if (preferredTime) {
        const requestedDate = moment(preferredDate).format('YYYY-MM-DD');
        
        // Phase 1: Check for exact time matches on the REQUESTED DAY
        const sameDayExactMatches = filteredSlots.filter(slot => {
          const slotTime = moment(slot.startTime);
          const slotTimeStr = `${slotTime.hours().toString().padStart(2, '0')}:${slotTime.minutes().toString().padStart(2, '0')}`;
          const slotDate = slotTime.format('YYYY-MM-DD');
          return slotTimeStr === preferredTime && slotDate === requestedDate;
        });
        
        // Phase 2: Get all slots for the REQUESTED DAY (for alternatives)
        const sameDayAllSlots = filteredSlots.filter(slot => {
          const slotDate = moment(slot.startTime).format('YYYY-MM-DD');
          return slotDate === requestedDate;
        });
        
        // Phase 3: Get exact time matches from OTHER DAYS (as backup)
        const otherDayExactMatches = filteredSlots.filter(slot => {
          const slotTime = moment(slot.startTime);
          const slotTimeStr = `${slotTime.hours().toString().padStart(2, '0')}:${slotTime.minutes().toString().padStart(2, '0')}`;
          const slotDate = slotTime.format('YYYY-MM-DD');
          return slotTimeStr === preferredTime && slotDate !== requestedDate;
        });
        
        console.log(`🎯 [PRIORITY FIX] Same-day exact matches: ${sameDayExactMatches.length}`);
        console.log(`🎯 [PRIORITY FIX] Same-day all slots: ${sameDayAllSlots.length}`);
        console.log(`🎯 [PRIORITY FIX] Other-day exact matches: ${otherDayExactMatches.length}`);
        
        // PRIORITY LOGIC: DAY > TIME
        if (sameDayExactMatches.length > 0) {
          // Best case: Exact time on requested day
          console.log('🎯 [PRIORITY FIX] Returning same-day exact matches');
          sameDayExactMatches.forEach(slot => {
            const slotTime = new Date(slot.startTime);
            slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true,
              timeZone: this.timezone 
            });
          });
          return sameDayExactMatches.slice(0, 10);
          
        } else if (sameDayAllSlots.length > 0) {
          // Second priority: Other times on requested day + some exact time alternatives
          console.log('🎯 [PRIORITY FIX] Returning same-day alternatives + limited exact time matches');
          
          // Combine: ALL same-day slots + up to 3 exact time matches from other days
          const combinedResults = [
            ...sameDayAllSlots,
            ...otherDayExactMatches.slice(0, 3)
          ];
          
          combinedResults.forEach(slot => {
            const slotTime = new Date(slot.startTime);
            slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true,
              timeZone: this.timezone 
            });
          });
          
          return combinedResults.slice(0, 15);
          
        } else if (otherDayExactMatches.length > 0) {
          // Last resort: Only exact time matches from other days
          console.log('🎯 [PRIORITY FIX] No same-day slots, returning other-day exact matches');
          otherDayExactMatches.forEach(slot => {
            const slotTime = new Date(slot.startTime);
            slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true,
              timeZone: this.timezone 
            });
          });
          return otherDayExactMatches.slice(0, 10);
        }
        
        // If no exact matches anywhere, fall through to general sorting
        console.log('🎯 [PRIORITY FIX] No exact matches found, falling through to general sorting');
      }

      // Sort by date/time and return alternatives
      const sortedSlots = filteredSlots
        .sort((a, b) => {
          // EXPERT FIX: Prioritize same-day slots for date-specific queries
          if (searchDays === 1) {
            const requestedDate = moment(preferredDate).format('YYYY-MM-DD');
            const dateA = moment(a.startTime).format('YYYY-MM-DD');
            const dateB = moment(b.startTime).format('YYYY-MM-DD');
            
            console.log(`🎯 [EXPERT FIX] Same-day prioritization: requested=${requestedDate}, slotA=${dateA}, slotB=${dateB}`);
            
            // Always prioritize slots from the requested date
            if (dateA === requestedDate && dateB !== requestedDate) return -1;
            if (dateB === requestedDate && dateA !== requestedDate) return 1;
            
            // If both are same day, sort by time
            if (dateA === requestedDate && dateB === requestedDate) {
              return moment(a.startTime).diff(moment(b.startTime));
            }
          }
          
          // Original logic for multi-day searches
          // First sort by proximity to preferred time (if specified)
          if (preferredTime) {
            const dateA = moment(a.startTime).format('YYYY-MM-DD');
            const dateB = moment(b.startTime).format('YYYY-MM-DD');
            const preferredMomentA = moment(`${dateA} ${preferredTime}`, 'YYYY-MM-DD HH:mm');
            const preferredMomentB = moment(`${dateB} ${preferredTime}`, 'YYYY-MM-DD HH:mm');
            
            const priorityA = Math.abs(moment(a.startTime).diff(preferredMomentA, 'minutes'));
            const priorityB = Math.abs(moment(b.startTime).diff(preferredMomentB, 'minutes'));
            
            if (priorityA !== priorityB) {
              return priorityA - priorityB; // Lower priority = closer to preferred time
            }
          }
          // Then sort by start time
          return moment(a.startTime).diff(moment(b.startTime));
        })
        .slice(0, 20); // Limit to 20 results

      // FIXED: Add displayTime to all slots for proper LLM formatting
      sortedSlots.forEach(slot => {
        const slotTime = new Date(slot.startTime);
        slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true,
          timeZone: this.timezone 
        });
      });

      console.log(`🔍 [ClinikoAdapter] Returning ${sortedSlots.length} filtered and sorted slots`);
      return sortedSlots;

    } catch (error: any) {
      console.error('Failed to get available slots:', this.formatErrorMessage(error));
      return [];
    }
  }

  /**
   * Get ALL available times for a specific day with comprehensive pagination
   * This ensures we don't miss any slots due to pagination limits
   */
  private async getAllAvailableTimesForDay(
    dateStr: string, 
    practitionerId: string, 
    appointmentTypeId: string,
    practitionerName: string,
    appointmentTypeName: string
  ): Promise<any[]> {
    const allTimeSlots: any[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    console.log(`🔍 [ClinikoAdapter] Getting ALL available times for ${practitionerName} - ${appointmentTypeName} on ${dateStr}`);

    while (hasMorePages) {
      try {
        const apiUrl = `/businesses/${this.credentials.businessId}/practitioners/${practitionerId}/appointment_types/${appointmentTypeId}/available_times`;
        const apiParams = { 
          from: dateStr, 
          to: dateStr,
          per_page: 100, // Maximum allowed per page
          page: currentPage
        };
        
        console.log(`🔍 [DEBUG] Comprehensive pagination - Page ${currentPage}:`);
        console.log(`🔍 [DEBUG] URL: ${apiUrl}`);
        console.log(`🔍 [DEBUG] Params:`, apiParams);
        
        const response = await this.api.get(apiUrl, { params: apiParams });
        
        const availableTimes: any[] = response.data.available_times || [];
        
        // Log detailed information about each time slot
        console.log(`🔍 [ClinikoAdapter] Page ${currentPage}: Found ${availableTimes.length} slots for ${practitionerName} - ${appointmentTypeName} on ${dateStr}`);
        
        if (availableTimes.length > 0) {
          console.log(`🕐 [DEBUG] Raw time slots from API:`, availableTimes.map(slot => ({
            appointment_start: slot.appointment_start,
            appointment_end: slot.appointment_end,
            utc_start: new Date(slot.appointment_start).toISOString(),
            local_start: new Date(slot.appointment_start).toLocaleString('en-GB', { timeZone: this.timezone })
          })));
        }
        
        allTimeSlots.push(...availableTimes);
        
        // Check if there are more pages
        hasMorePages = response.data.links && response.data.links.next;
        currentPage++;
        
        // Safety break to prevent infinite loops
        if (currentPage > 50) {
          console.warn(`🚨 [ClinikoAdapter] Safety break: Too many pages (${currentPage}) for ${dateStr}`);
          break;
        }
        
      } catch (error: any) {
        console.error(`❌ [ClinikoAdapter] Error getting available times for page ${currentPage}:`, error.response?.data || error.message);
        break;
      }
    }
    
    console.log(`✅ [ClinikoAdapter] Total slots collected across ${currentPage - 1} pages: ${allTimeSlots.length}`);
    
    // Log summary of all collected times
    if (allTimeSlots.length > 0) {
      const timeRanges = allTimeSlots.map(slot => {
        const utcTime = new Date(slot.appointment_start);
        const localTime = moment.utc(slot.appointment_start).tz(this.timezone);
        return {
          utc: utcTime.toISOString(),
          local: localTime.format('HH:mm'),
          localFull: localTime.format('YYYY-MM-DD HH:mm:ss')
        };
      });
      
      console.log(`📊 [DEBUG] Time range summary:`, {
        earliest: timeRanges[0]?.local,
        latest: timeRanges[timeRanges.length - 1]?.local,
        allTimes: timeRanges.map(t => t.local).join(', ')
      });
    }
    
    return allTimeSlots;
  }

  /**
   * Intelligent slot availability verification - checks if a specific slot is still bookable
   * This prevents false availability issues by validating the exact time slot before booking
   */
  private async verifySlotAvailability(
    serviceType: string,
    preferredDate: string,
    preferredTime: string,
    practitionerName?: string
  ): Promise<boolean> {
    try {
      console.log('🔍 [ClinikoAdapter] Verifying slot availability for:', { serviceType, preferredDate, preferredTime, practitionerName });
      
      // Get current available slots for the exact criteria
      const searchParams: any = {
        serviceType,
        preferredDate,
        preferredTime,
        searchDays: 1 // Only check the specific date
      };
      
      if (practitionerName) {
        searchParams.practitionerName = practitionerName;
      }
      
      const slots = await this.getAvailableSlots(searchParams);
      
      // Check if the exact time slot exists
      const requestedDateTime = moment(`${preferredDate} ${preferredTime}`, 'YYYY-MM-DD HH:mm');
      
      // Get the exact appointment type for proper ID matching
      const requestedAppointmentType = await this.findAppointmentTypeByName(serviceType);
      
      const matchingSlot = slots.find(slot => {
        const slotTime = moment(slot.startTime);
        const isTimeMatch = slotTime.format('YYYY-MM-DD HH:mm') === requestedDateTime.format('YYYY-MM-DD HH:mm');
        const isPractitionerMatch = !practitionerName || slot.practitionerName.toLowerCase().includes(practitionerName.toLowerCase());
        // Use exact service ID matching instead of fuzzy name matching
        const isServiceMatch = !requestedAppointmentType || slot.serviceId === requestedAppointmentType.id;
        
        return isTimeMatch && isPractitionerMatch && isServiceMatch;
      });
      
      const isAvailable = !!matchingSlot;
      console.log(`🔍 [ClinikoAdapter] Slot verification result: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
      
      if (!isAvailable) {
        console.log(`🔍 [ClinikoAdapter] Available slots found: ${slots.length}`);
        if (slots.length > 0) {
          console.log('🔍 [ClinikoAdapter] First few available slots:', slots.slice(0, 3).map(slot => ({
            startTime: moment(slot.startTime).format('YYYY-MM-DD HH:mm'),
            practitioner: slot.practitionerName,
            service: slot.serviceName
          })));
        }
      }
      
      return isAvailable;
    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Slot verification failed:', error);
      // If verification fails, allow booking to proceed but log the issue
      return true;
    }
  }

  async createAppointment(appointmentData: AppointmentData): Promise<BookingResponse> {
    console.log('📅 [ClinikoAdapter] Creating appointment with data:', appointmentData);
    
    try {
      // INTELLIGENT AVAILABILITY VERIFICATION - Check if the specific slot is still available
      console.log('🔍 [ClinikoAdapter] Pre-booking availability verification...');
      const isSlotAvailable = await this.verifySlotAvailability(
        appointmentData.serviceType,
        appointmentData.preferredDate,
        appointmentData.preferredTime,
        appointmentData.therapistPreference
      );
      
      if (!isSlotAvailable) {
        console.log('❌ [ClinikoAdapter] Slot no longer available at booking time');
        return {
          success: false,
          error: 'The selected time slot is no longer available. Please check availability again and choose a different time.'
        };
      }
      
      console.log('✅ [ClinikoAdapter] Slot verified as available, proceeding with booking...');

      // First, find or create the patient
      console.log('👤 [ClinikoAdapter] Finding or creating patient...');
      const { patient, isNew } = await this.findOrCreatePatient(appointmentData);
      console.log('👤 [ClinikoAdapter] Patient found/created:', { id: patient.id, name: `${patient.first_name} ${patient.last_name}` });
      
      // Get appointment type and practitioner IDs
      console.log('🔍 [ClinikoAdapter] Finding appointment type and practitioner...');
      const appointmentType = await this.findAppointmentTypeByName(appointmentData.serviceType);
      const practitioner = appointmentData.therapistPreference 
        ? await this.findPractitionerByName(appointmentData.therapistPreference)
        : null;

      console.log('🔍 [ClinikoAdapter] Appointment type:', appointmentType ? `${appointmentType.name} (ID: ${appointmentType.id})` : 'NOT FOUND');
      console.log('🔍 [ClinikoAdapter] Practitioner:', practitioner ? `${practitioner.name} (ID: ${practitioner.id})` : 'Not specified');

      if (!appointmentType) {
        console.error('❌ [ClinikoAdapter] Service type not found:', appointmentData.serviceType);
        return {
          success: false,
          error: `Service type "${appointmentData.serviceType}" not found`
        };
      }

      // Validate and format the appointment time using correct timezone conversion
      console.log(`🕐 [ClinikoAdapter] DEBUG: Creating appointment with timezone: ${this.timezone}`);
      console.log(`🕐 [ClinikoAdapter] DEBUG: Input date/time: ${appointmentData.preferredDate} ${appointmentData.preferredTime}`);
      
      // FIXED TIMEZONE HANDLING: Always use clinic timezone, never fall back to UTC for patient times
      const clinicTimezone = this.timezone || 'Europe/London'; // Ensure we have a timezone
      console.log(`🕐 [ClinikoAdapter] DEBUG: Using timezone: ${clinicTimezone} (original: ${this.timezone})`);
      
      // Always interpret patient-provided times as clinic local time
      const appointmentDateTime = moment.tz(`${appointmentData.preferredDate} ${appointmentData.preferredTime}`, 'YYYY-MM-DD HH:mm', clinicTimezone);
      
      if (!appointmentDateTime.isValid()) {
        console.error('❌ [ClinikoAdapter] Invalid date/time format:', { date: appointmentData.preferredDate, time: appointmentData.preferredTime });
        return {
          success: false,
          error: `Invalid date or time format: ${appointmentData.preferredDate} ${appointmentData.preferredTime}`
        };
      }

      console.log('📅 [ClinikoAdapter] Appointment date/time (clinic timezone):', appointmentDateTime.format('YYYY-MM-DD HH:mm Z'));
      console.log('📅 [ClinikoAdapter] Appointment date/time (UTC):', appointmentDateTime.toISOString());
      
      // VALIDATION: Ensure the time we're booking matches what was promised to the user
      const promisedLocalTime = appointmentData.preferredTime;
      const actualLocalTime = appointmentDateTime.format('HH:mm');
      
      if (promisedLocalTime !== actualLocalTime) {
        console.error(`❌ [ClinikoAdapter] TIMEZONE MISMATCH: Promised ${promisedLocalTime} but booking ${actualLocalTime} (clinic timezone)`);
        return {
          success: false,
          error: `Time conversion error: Cannot book ${promisedLocalTime} as requested`
        };
      }
      
      console.log(`✅ [ClinikoAdapter] TIMEZONE VALIDATION PASSED: Booking ${actualLocalTime} (${clinicTimezone}) as promised`);

      // Calculate appointment end time using duration
      const appointmentEndDateTime = appointmentDateTime.clone().add(appointmentType.duration || 30, 'minutes');
      
      // If no practitioner specified, get the first available one
      let selectedPractitioner = practitioner;
      if (!selectedPractitioner) {
        const practitioners = await this.getPractitioners();
        if (practitioners.length > 0) {
          const firstPractitioner = practitioners[0];
          if (firstPractitioner) {
            selectedPractitioner = { id: firstPractitioner.id, name: firstPractitioner.name };
            console.log('🔍 [ClinikoAdapter] No practitioner specified, using first available:', selectedPractitioner.name);
          } else {
            console.error('❌ [ClinikoAdapter] No practitioners available');
            return {
              success: false,
              error: 'No practitioners available for booking'
            };
          }
        } else {
          console.error('❌ [ClinikoAdapter] No practitioners available');
          return {
            success: false,
            error: 'No practitioners available for booking'
          };
        }
      }

      // Create the appointment using the correct endpoint with all required fields
      const appointmentPayload = {
        appointment_type_id: appointmentType.id, // Use string ID directly - no parseInt to preserve precision
        patient_id: patient.id.toString(), // Convert patient ID to string to match format
        appointment_start: appointmentDateTime.toISOString(),
        appointment_end: appointmentEndDateTime.toISOString(),
        starts_at: appointmentDateTime.toISOString(),
        ends_at: appointmentEndDateTime.toISOString(),
        business_id: this.credentials.businessId,
        max_attendees: 1,
        notes: appointmentData.notes || '',
        ...(selectedPractitioner && { practitioner_id: selectedPractitioner.id }) // Use string ID directly - no parseInt to preserve precision
      };

      console.log('📝 [ClinikoAdapter] Appointment payload:', appointmentPayload);

      const response = await this.api.post('/individual_appointments', appointmentPayload);
      
      // Log the full response structure for debugging
      console.log('📊 [ClinikoAdapter] Full appointment response structure:', {
        status: response.status,
        data: response.data,
        hasIndividualAppointment: !!response.data?.individual_appointment,
        dataKeys: Object.keys(response.data || {})
      });

      // Robust response parsing - handle different possible structures
      let appointment: ClinikoAppointment;
      
      if (response.data?.individual_appointment) {
        // Standard nested structure
        appointment = response.data.individual_appointment;
        console.log('✅ [ClinikoAdapter] Using nested appointment structure');
      } else if (response.data && response.data.id) {
        // Direct structure
        appointment = response.data;
        console.log('✅ [ClinikoAdapter] Using direct appointment structure');
      } else {
        // Log full response for debugging and throw detailed error
        console.error('❌ [ClinikoAdapter] Unknown appointment response structure:', {
          status: response.status,
          data: response.data,
          dataType: typeof response.data,
          dataKeys: response.data ? Object.keys(response.data) : 'no data'
        });
        throw new Error(`Unknown appointment response structure - expected appointment data but got: ${JSON.stringify(response.data)}`);
      }

      console.log('✅ [ClinikoAdapter] Appointment created successfully:', {
        id: appointment.id,
        starts_at: appointment.starts_at,
        patient: `${patient.first_name} ${patient.last_name}`, // Use patient data we already have
        practitioner: selectedPractitioner ? selectedPractitioner.name : 'Not specified' // Use practitioner data we already have
      });

      const bookingResponse: BookingResponse = {
        success: true,
        message: `Welcome to our clinic! Your ${appointmentData.serviceType} appointment has been booked successfully.`,
        appointmentId: appointment.id.toString(),
        scheduledDateTime: new Date(appointment.starts_at),
        therapistName: selectedPractitioner ? selectedPractitioner.name : 'To be assigned', // Use practitioner data we already have
        confirmationCode: `CLN-${appointment.id}`,
        patient: {
          id: patient.id,
          name: `${patient.first_name} ${patient.last_name}`,
          isNew: true
        }
      };
      
      return bookingResponse;

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Failed to create appointment:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Provide more specific error messages
      let errorMessage = this.formatErrorMessage(error);
      
      if (error.response?.status === 422) {
        errorMessage = 'Appointment booking failed - the selected time slot may no longer be available or there may be a scheduling conflict';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication failed - please check clinic configuration';
      } else if (error.response?.status === 404) {
        errorMessage = 'The requested service or practitioner was not found';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async cancelAppointment(appointmentId: string, cancellationReason: number): Promise<boolean> {
    try {
      console.log(`🗑️ [ClinikoAdapter] Cancelling appointment ${appointmentId} with reason code ${cancellationReason}`);
      
      // Map cancellation reason codes to descriptions for API payload
      const reasonMap: { [key: number]: string } = {
        10: 'Feeling better',
        20: 'Condition worse',
        30: 'Sick',
        40: 'Away',
        50: 'Other',
        60: 'Work'
      };
      
      const reasonDescription = reasonMap[cancellationReason] || 'Other';
      
      // Prepare cancellation payload according to Cliniko API
      const cancellationPayload = {
        cancellation_reason: cancellationReason,
        cancellation_note: reasonDescription
      };
      
      console.log(`🗑️ [ClinikoAdapter] Cancellation payload:`, cancellationPayload);
      
      // Use the correct cancel endpoint
      const response = await this.api.patch(`/individual_appointments/${appointmentId}/cancel`, cancellationPayload);
      
      console.log(`✅ [ClinikoAdapter] Appointment ${appointmentId} cancelled successfully - ${reasonDescription}`);
      return true;
      
    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Failed to cancel appointment:', {
        appointmentId,
        cancellationReason,
        error: this.formatErrorMessage(error),
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }

  async rescheduleAppointment(appointmentId: string, newDateTime: Date, practitionerId?: string, serviceId?: string, patientId?: string, businessId?: string): Promise<BookingResponse> {
    try {
      // Build the update payload with all required fields from API documentation
      const updatePayload: any = {
        starts_at: moment(newDateTime).toISOString(),  // ✅ CORRECTED: Using 'starts_at' as per API docs
        ends_at: null  // ✅ CRITICAL: Let Cliniko calculate end time from appointment type duration
      };

      // ✅ CRITICAL: Include practitioner_id and appointment_type_id from availability check
      if (practitionerId) {
        updatePayload.practitioner_id = practitionerId;
        console.log('✅ [ClinikoAdapter] Including practitioner_id in reschedule:', practitionerId);
      }
      
      if (serviceId) {
        updatePayload.appointment_type_id = serviceId;
        console.log('✅ [ClinikoAdapter] Including appointment_type_id in reschedule:', serviceId);
      }

      // ✅ CRITICAL: Include patient_id from search results
      if (patientId) {
        updatePayload.patient_id = patientId;
        console.log('✅ [ClinikoAdapter] Including patient_id in reschedule:', patientId);
      }

      // ✅ CRITICAL: Include business_id from configuration
      if (businessId) {
        updatePayload.business_id = businessId;
        console.log('✅ [ClinikoAdapter] Including business_id in reschedule:', businessId);
      }

      console.log('🔄 [ClinikoAdapter] Reschedule payload:', updatePayload);

      const response = await this.api.patch(`/individual_appointments/${appointmentId}`, updatePayload);
      
      // ✅ DEFENSIVE RESPONSE PARSING: Handle both possible response structures
      let appointment: ClinikoAppointment;
      
      if (response.data?.individual_appointment) {
        // Standard nested structure (like GET endpoints)
        appointment = response.data.individual_appointment;
        console.log('✅ [ClinikoAdapter] Using nested appointment structure for reschedule');
      } else if (response.data && response.data.id) {
        // Direct structure (likely for PATCH endpoints)
        appointment = response.data;
        console.log('✅ [ClinikoAdapter] Using direct appointment structure for reschedule');
      } else {
        console.error('❌ [ClinikoAdapter] Unexpected response structure:', response.data);
        throw new Error('Unexpected response structure from reschedule API');
      }

      return {
        success: true,
        appointmentId: appointment.id.toString(),
        scheduledDateTime: new Date(appointment.starts_at),
        therapistName: appointment.practitioner ? `${appointment.practitioner.first_name || ''} ${appointment.practitioner.last_name || ''}`.trim() || 'Not specified' : 'Not specified'
      };

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Failed to reschedule appointment:', error.message);
      
      // ✅ CRITICAL: Log the complete error response for debugging
      if (error.response) {
        console.error('❌ [ClinikoAdapter] HTTP Status:', error.response.status);
        console.error('❌ [ClinikoAdapter] Response Headers:', error.response.headers);
        console.error('❌ [ClinikoAdapter] Full Response Data:', JSON.stringify(error.response.data, null, 2));
        
        // ✅ CRITICAL: Extract detailed validation errors
        if (error.response.data?.errors) {
          console.error('❌ [ClinikoAdapter] Validation Errors:', JSON.stringify(error.response.data.errors, null, 2));
        }
      }
      
      // ✅ CRITICAL: Include detailed error information in the response
      const detailedError = {
        status: error.response?.status || 'unknown',
        message: error.response?.data?.message || error.message || 'Unknown error',
        validationErrors: error.response?.data?.errors || null,
        fullResponse: error.response?.data || null
      };
      
      console.error('❌ [ClinikoAdapter] Detailed error for LLM:', JSON.stringify(detailedError, null, 2));
      
      return {
        success: false,
        error: `HTTP ${detailedError.status}: ${detailedError.message}`,
        details: detailedError
      };
    }
  }

  async getAppointment(appointmentId: string): Promise<ClinikoAppointment | null> {
    try {
      const response = await this.api.get(`/individual_appointments/${appointmentId}`);
      return response.data.individual_appointment;
    } catch (error: any) {
      console.error('Failed to get appointment:', this.formatErrorMessage(error));
      return null;
    }
  }

  async getServices(): Promise<Array<{ id: string; name: string; duration: number }>> {
    try {
      const response = await this.api.get('/appointment_types', {
        params: { show_online: true }
      });
      
      const appointmentTypes: ClinikoAppointmentType[] = response.data.appointment_types || [];
      
      return appointmentTypes.map(type => ({
        id: type.id.toString(), // Convert to string immediately to preserve full precision 
        name: type.name,
        duration: type.duration_in_minutes
      }));

    } catch (error: any) {
      console.error('Failed to get services:', this.formatErrorMessage(error));
      
      // PHASE 2: Try with fresh API client if we got a 401 error
      if (error.response?.status === 401) {
        console.log('🔄 [ClinikoAdapter] Retrying getServices() with fresh API client...');
        try {
          const freshApi = this.createFreshAPIClient();
          const freshResponse = await freshApi.get('/appointment_types', {
            params: { show_online: true }
          });
          
          console.log('✅ [ClinikoAdapter] getServices() SUCCESS with fresh client');
          
          const appointmentTypes: ClinikoAppointmentType[] = freshResponse.data.appointment_types || [];
          return appointmentTypes.map(type => ({
            id: type.id.toString(),
            name: type.name,
            duration: type.duration_in_minutes
          }));
          
        } catch (freshError: any) {
          console.error('❌ [ClinikoAdapter] Fresh API client also failed:', freshError.message);
        }
      }
      
      return [];
    }
  }

  async getPractitioners(): Promise<Array<{ id: string; name: string; specialties: string[] }>> {
    try {
      const response = await this.api.get('/practitioners', {
        params: { show_in_online_bookings: true }
      });
      
      const practitioners: ClinikoPractitioner[] = response.data.practitioners || [];
      
      return practitioners.map(prac => ({
        id: prac.id.toString(), // Convert to string immediately to preserve full precision
        name: `${prac.first_name} ${prac.last_name}`,
        specialties: [prac.title || 'General Practitioner']
      }));

    } catch (error: any) {
      console.error('Failed to get practitioners:', this.formatErrorMessage(error));
      
      // PHASE 2: Try with fresh API client if we got a 401 error
      if (error.response?.status === 401) {
        console.log('🔄 [ClinikoAdapter] Retrying getPractitioners() with fresh API client...');
        try {
          const freshApi = this.createFreshAPIClient();
          const freshResponse = await freshApi.get('/practitioners', {
            params: { show_in_online_bookings: true }
          });
          
          console.log('✅ [ClinikoAdapter] getPractitioners() SUCCESS with fresh client');
          
          const practitioners: ClinikoPractitioner[] = freshResponse.data.practitioners || [];
          return practitioners.map(prac => ({
            id: prac.id.toString(),
            name: `${prac.first_name} ${prac.last_name}`,
            specialties: [prac.title || 'General Practitioner']
          }));
          
        } catch (freshError: any) {
          console.error('❌ [ClinikoAdapter] Fresh API client also failed:', freshError.message);
        }
      }
      
      return [];
    }
  }

  async validateAppointmentData(appointmentData: AppointmentData): Promise<BookingValidationResult> {
    console.log('✅ [ClinikoAdapter] Validating appointment data:', appointmentData);
    
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!appointmentData.patientName || appointmentData.patientName.trim() === '') {
      errors.push('Patient name is required');
    }
    
    // Validate date of birth is required
    if (!appointmentData.dateOfBirth || appointmentData.dateOfBirth.trim() === '') {
      errors.push('Date of birth is required');
    } else {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(appointmentData.dateOfBirth)) {
        errors.push('Date of birth must be in YYYY-MM-DD format');
      } else {
        // Validate it's a real date
        const date = new Date(appointmentData.dateOfBirth);
        if (isNaN(date.getTime()) || date.toISOString().split('T')[0] !== appointmentData.dateOfBirth) {
          errors.push('Invalid date of birth');
        } else if (date > new Date()) {
          errors.push('Date of birth cannot be in the future');
        }
      }
    }
    
    if (!appointmentData.patientPhone && !appointmentData.patientEmail) {
      errors.push('Either phone number or email is required');
    } else {
      // Validate phone format if provided
      if (appointmentData.patientPhone) {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(appointmentData.patientPhone.trim())) {
          errors.push('Invalid phone number format');
        }
      }
      
      // Validate email format if provided
      if (appointmentData.patientEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(appointmentData.patientEmail.trim())) {
          errors.push('Invalid email address format');
        }
      }
    }
    
    if (!appointmentData.serviceType || appointmentData.serviceType.trim() === '') {
      errors.push('Service type is required');
    }
    
    if (!appointmentData.preferredDate || appointmentData.preferredDate.trim() === '') {
      errors.push('Preferred date is required');
    }
    
    if (!appointmentData.preferredTime || appointmentData.preferredTime.trim() === '') {
      errors.push('Preferred time is required');
    }

    // Validate Cliniko specific requirements
    if (!this.credentials.businessId) {
      errors.push('Business ID is required for Cliniko integration');
    }

    // Validate date format and timing
    if (appointmentData.preferredDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(appointmentData.preferredDate)) {
        errors.push('Preferred date must be in YYYY-MM-DD format');
      } else {
        const appointmentDate = new Date(appointmentData.preferredDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (appointmentDate < today) {
          errors.push('Cannot book appointments in the past');
        }
      }
    }

    // Validate time format
    if (appointmentData.preferredTime) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(appointmentData.preferredTime)) {
        errors.push('Preferred time must be in HH:mm format (24-hour)');
      }
    }

    // Validate duration if provided
    if (appointmentData.duration && (appointmentData.duration < 15 || appointmentData.duration > 480)) {
      warnings.push('Appointment duration should be between 15 minutes and 8 hours');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async getBusinessHours(date: string): Promise<{ open: string; close: string } | null> {
    try {
      // Get first available practitioner and appointment type for business hours check
      const [practitioners, appointmentTypes] = await Promise.all([
        this.getPractitioners(),
        this.getServices()
      ]);

      if (practitioners.length === 0 || appointmentTypes.length === 0) {
        return null;
      }

      const practitioner = practitioners[0];
      const appointmentType = appointmentTypes[0];
      
      if (!practitioner || !appointmentType) {
        return null;
      }

      const response = await this.api.get(
        `/businesses/${this.credentials.businessId}/practitioners/${practitioner.id}/appointment_types/${appointmentType.id}/available_times`,
        {
          params: {
            from: date,
            to: date
          }
        }
      );

      const availableTimes: ClinikoAvailableTime[] = response.data.available_times || [];
      
      if (availableTimes.length === 0) return null;

      // Find earliest and latest times
      const times = availableTimes.map(slot => moment(slot.appointment_start));
      const earliest = moment.min(times);
      const latest = moment.max(times);

      return {
        open: earliest.format('HH:mm'),
        close: latest.format('HH:mm')
      };

    } catch (error: any) {
      console.error('Failed to get business hours:', this.formatErrorMessage(error));
      return null;
    }
  }

  async findExistingAppointments(patientEmail?: string, patientPhone?: string): Promise<Array<{ id: string; date: Date; practitioner: string; service: string }>> {
    try {
      let patient: ClinikoPatient | null = null;

      // First find the patient using the correct endpoint
      if (patientEmail) {
        const response = await this.api.get('/patients', {
          params: { 
            q: patientEmail,
            email: patientEmail 
          }
        });
        const patients = response.data.patients || [];
        if (patients.length > 0) patient = patients[0];
      }

      if (!patient && patientPhone) {
        const response = await this.api.get('/patients', {
          params: { 
            q: patientPhone,
            phone_number: patientPhone 
          }
        });
        const patients = response.data.patients || [];
        if (patients.length > 0) patient = patients[0];
      }

      if (!patient) return [];

      // ENDPOINT FIX: Use /bookings endpoint instead of /individual_appointments (consistent with getPatientUpcomingAppointments)
      const patientIdString = String(patient.id);
      
      console.log('🔧 [ClinikoAdapter] Using correct /bookings endpoint for existing appointments:', {
        patientId: patientIdString,
        endpoint: '/bookings',
        filter: `patient_ids:~${patientIdString}`,
        source: 'https://api.uk2.cliniko.com/v1/bookings?q[]=patient_ids:~123'
      });

      // Fetch practitioners and appointment types for ID resolution (same as getPatientUpcomingAppointments)
      console.log('🔍 [ClinikoAdapter] Fetching practitioners and appointment types for ID resolution...');
      const [practitioners, appointmentTypes, bookingsResponse] = await Promise.all([
        this.getPractitioners(),
        this.getServices(),
        this.api.get(`/bookings`, {
          params: { 
            'q[]': `patient_ids:~${patientIdString}`,
            sort: 'starts_at',
            per_page: 100
          }
        })
      ]);

      // Create lookup maps for efficient ID resolution
      const practitionerMap = new Map(practitioners.map(p => [p.id, p.name]));
      const appointmentTypeMap = new Map(appointmentTypes.map(t => [t.id, { name: t.name, duration: t.duration }]));

      console.log('📋 [ClinikoAdapter] CORRECT ENDPOINT Response:', {
        status: bookingsResponse.status,
        bookingCount: bookingsResponse.data?.bookings?.length || 0,
        endpoint: '/bookings',
        filterUsed: `patient_ids:~${patientIdString}`,
        requestUrl: bookingsResponse.config?.url,
        practitionersLoaded: practitioners.length,
        appointmentTypesLoaded: appointmentTypes.length
      });

      // Note: /bookings endpoint returns { bookings: [...] } not { individual_appointments: [...] }
      const bookings = bookingsResponse.data?.bookings || [];
      
      if (bookings.length === 0) {
        console.log('⚠️ [ClinikoAdapter] No bookings found with correct endpoint');
        return [];
      }

      console.log('✅ [ClinikoAdapter] Found bookings with correct endpoint:', 
        bookings.map((booking: any) => ({
          id: booking.id,
          starts_at: booking.starts_at,
          patient_ids: booking.patient_ids,
          cancelled_at: booking.cancelled_at,
          appointment_type: booking.appointment_type?.id || booking.appointment_type_id || 'nested object',
          practitioner: booking.practitioner?.id || booking.practitioner_id || 'nested object'
        }))
      );

      // Transform bookings to expected format and filter for upcoming appointments
      const upcomingAppointments = bookings
        .filter((booking: any) => {
          // Filter out cancelled appointments
          if (booking.cancelled_at) return false;
          
          // Filter for future appointments
          const appointmentDate = moment(booking.starts_at);
          return appointmentDate.isAfter(moment());
        })
        .map((booking: any) => {
          const startTime = moment(booking.starts_at).tz(this.timezone);
          
          // FIXED: Extract IDs from nested objects in booking response (same as getPatientUpcomingAppointments)
          let practitionerId: string | undefined;
          let appointmentTypeId: string | undefined;
          
          // Extract practitioner ID from nested object or direct field
          if (booking.practitioner?.id) {
            practitionerId = String(booking.practitioner.id);
          } else if (booking.practitioner_id) {
            practitionerId = String(booking.practitioner_id);
          } else if (booking.practitioner?.links?.self) {
            const match = booking.practitioner.links.self.match(/\/practitioners\/(\d+)/);
            practitionerId = match ? match[1] : undefined;
          }
          
          // Extract appointment type ID from nested object or direct field
          if (booking.appointment_type?.id) {
            appointmentTypeId = String(booking.appointment_type.id);
          } else if (booking.appointment_type_id) {
            appointmentTypeId = String(booking.appointment_type_id);
          } else if (booking.appointment_type?.links?.self) {
            const match = booking.appointment_type.links.self.match(/\/appointment_types\/(\d+)/);
            appointmentTypeId = match ? match[1] : undefined;
          }
          
          // Resolve practitioner and appointment type names using extracted IDs
          const practitionerName = practitionerId ? practitionerMap.get(practitionerId) || 'Unknown Practitioner' : 'Unknown Practitioner';
          const appointmentTypeInfo = appointmentTypeId ? appointmentTypeMap.get(appointmentTypeId) : undefined;
          const serviceName = appointmentTypeInfo?.name || 'Unknown Service';
          const duration = appointmentTypeInfo?.duration || 30;
          
          return {
            id: String(booking.id),
            date: startTime.format('dddd, MMMM Do YYYY'),
            time: startTime.format('h:mm A'),
            practitioner: practitionerName,
            service: serviceName,
            duration: duration,
            status: booking.cancelled_at ? 'Cancelled' : 'Scheduled'
          };
        });

      console.log(`📅 [ClinikoAdapter] Returning ${upcomingAppointments.length} upcoming appointments with resolved names:`,
        upcomingAppointments.map((apt: any) => ({ 
          id: apt.id, 
          practitioner: apt.practitioner, 
          service: apt.service, 
          duration: apt.duration 
        }))
      );
      return upcomingAppointments;

    } catch (error) {
      console.error('❌ [ClinikoAdapter] Error with /bookings endpoint:', error);
      return [{
        id: 'DIAGNOSTIC_ERROR',
        date: new Date(),
        practitioner: 'Error',
        service: 'Error'
      }];
    }
  }

  /**
   * Search for an existing patient by name and contact details
   */
  async searchExistingPatient(
    patientName: string,
    patientPhone?: string,
    patientEmail?: string
  ): Promise<ClinikoPatient | null> {
    try {
      console.log('🔍 [ClinikoAdapter] Searching for existing patient:', { patientName, hasPhone: !!patientPhone, hasEmail: !!patientEmail });

      // Parse name into first and last name for proper field filtering
      const [firstName, ...lastNameParts] = patientName.trim().split(' ');
      const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : '';
      
      // Build search parameters using field-based filtering
      const searchParams: any = { per_page: 50 };
      
      if (firstName) {
        searchParams.first_name = firstName;
      }
      if (lastName) {
        searchParams.last_name = lastName;
      }
      
      console.log('🔍 [ClinikoAdapter] Using field-based search with params:', searchParams);
      
      try {
        const response = await this.api.get('/patients', {
          params: searchParams
        });
        
        const patients: ClinikoPatient[] = response.data.patients || [];
        console.log(`🔍 [ClinikoAdapter] Found ${patients.length} patients matching name search`);
        
        if (patients.length === 0) {
          return null;
        }

        // If phone provided, try to match by phone
        if (patientPhone) {
          const cleanPhone = patientPhone.replace(/\s+/g, '').replace(/[-()]/g, '');
          const phoneMatch = patients.find(p => {
            // Handle both old format (phone_number) and new format (patient_phone_numbers array)
            if (p.patient_phone_numbers && Array.isArray(p.patient_phone_numbers)) {
              // New format: check all phone numbers in the array
              return p.patient_phone_numbers.some(phoneObj => {
                if (!phoneObj.number) return false;
                const cleanPatientPhone = phoneObj.number.replace(/\s+/g, '').replace(/[-()]/g, '');
                return cleanPatientPhone === cleanPhone; // FIXED: Exact match only
              });
            } else if (p.phone_number) {
              // Old format: single phone_number field
              const cleanPatientPhone = p.phone_number.replace(/\s+/g, '').replace(/[-()]/g, '');
              return cleanPatientPhone === cleanPhone; // FIXED: Exact match only
            }
            return false;
          });
          if (phoneMatch) {
            console.log('✅ [ClinikoAdapter] Found patient by name + phone match:', phoneMatch.id);
            return phoneMatch;
          }
        }

        // If email provided, try to match by email
        if (patientEmail) {
          const emailMatch = patients.find(p => 
            p.email && p.email.toLowerCase() === patientEmail.toLowerCase()
          );
          if (emailMatch) {
            console.log('✅ [ClinikoAdapter] Found patient by name + email match:', emailMatch.id);
            return emailMatch;
          }
        }

        // If no phone/email match, return exact name match if available
        const exactNameMatch = patients.find(p => 
          `${p.first_name} ${p.last_name}`.toLowerCase() === patientName.toLowerCase()
        );
        if (exactNameMatch) {
          console.log('✅ [ClinikoAdapter] Found patient by exact name match:', exactNameMatch.id);
          return exactNameMatch;
        }

        console.log('⚠️ [ClinikoAdapter] Found name matches but no phone/email confirmation');
        return null;

      } catch (searchError: any) {
        console.error('❌ [ClinikoAdapter] Patient search failed:', searchError.response?.data || searchError.message);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Error in searchExistingPatient:', error);
      return null;
    }
  }

  /**
   * Search for a patient by name and date of birth (for cancellation flow)
   */
  async searchPatientByNameAndDOB(
    patientName: string,
    dateOfBirth: string
  ): Promise<ClinikoPatient | null> {
    try {
      console.log('🔍 [ClinikoAdapter] Searching for patient by name and DOB:', { patientName, dateOfBirth });

      // Parse name into first and last name for proper field filtering
      const [firstName, ...lastNameParts] = patientName.trim().split(' ');
      const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : '';
      
      // Build search parameters using field-based filtering
      const searchParams: any = { 
        per_page: 50,
        date_of_birth: dateOfBirth // Search by date of birth
      };
      
      if (firstName) {
        searchParams.first_name = firstName;
      }
      if (lastName) {
        searchParams.last_name = lastName;
      }
      
      console.log('🔍 [ClinikoAdapter] Using name + DOB search with params:', searchParams);
      
      try {
        const response = await this.api.get('/patients', {
          params: searchParams
        });
        
        const patients: ClinikoPatient[] = response.data.patients || [];
        console.log(`🔍 [ClinikoAdapter] Found ${patients.length} patients matching name + DOB search`);
        
        if (patients.length === 0) {
          console.log('❌ [ClinikoAdapter] No patients found with matching name and DOB');
          return null;
        }

        // Find exact name and DOB match
        const exactMatch = patients.find(p => {
          const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
          const nameMatch = fullName === patientName.toLowerCase();
          const dobMatch = p.date_of_birth === dateOfBirth;
          return nameMatch && dobMatch;
        });

        if (exactMatch) {
          console.log('✅ [ClinikoAdapter] Found exact patient match by name + DOB:', exactMatch.id);
          return exactMatch;
        }

        // If no exact match, check if any patient has matching DOB
        const dobMatch = patients.find(p => p.date_of_birth === dateOfBirth);
        if (dobMatch) {
          console.log('✅ [ClinikoAdapter] Found patient match by DOB (name similarity):', dobMatch.id);
          return dobMatch;
        }

        console.log('❌ [ClinikoAdapter] No exact match found for name + DOB combination');
        return null;

      } catch (searchError: any) {
        console.error('❌ [ClinikoAdapter] Patient search by name + DOB failed:', searchError.response?.data || searchError.message);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Error in searchPatientByNameAndDOB:', error);
      return null;
    }
  }

  /**
   * Search for a patient by name and phone number (for cancellation flow)
   */
  async searchPatientByNameAndPhone(
    patientName: string,
    phoneNumber: string
  ): Promise<ClinikoPatient | null> {
    try {
      console.log('🔍 [ClinikoAdapter] Searching for patient by name and phone:', { patientName, phoneNumber });

      // Parse name into first and last name for proper field filtering
      const [firstName, ...lastNameParts] = patientName.trim().split(' ');
      const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : '';
      
      // Build search parameters using field-based filtering
      const searchParams: any = { 
        per_page: 50
      };
      
      if (firstName) {
        searchParams.first_name = firstName;
      }
      if (lastName) {
        searchParams.last_name = lastName;
      }
      
      console.log('🔍 [ClinikoAdapter] Using name search with params:', searchParams);
      
      try {
        const response = await this.api.get('/patients', {
          params: searchParams
        });
        
        const patients: ClinikoPatient[] = response.data.patients || [];
        console.log(`🔍 [ClinikoAdapter] Found ${patients.length} patients matching name search`);
        
        if (patients.length === 0) {
          console.log('❌ [ClinikoAdapter] No patients found with matching name');
          return null;
        }

        // Clean the provided phone number for comparison
        const cleanPhone = phoneNumber.replace(/\s+/g, '').replace(/[-()]/g, '');
        
        // Find patient with matching name and phone number
        const phoneMatch = patients.find(p => {
          const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
          const nameMatch = fullName === patientName.toLowerCase();
          
          if (!nameMatch) return false;
          
          // Handle both old format (phone_number) and new format (patient_phone_numbers array)
          if (p.patient_phone_numbers && Array.isArray(p.patient_phone_numbers)) {
            // New format: check all phone numbers in the array
            return p.patient_phone_numbers.some(phoneObj => {
              if (!phoneObj.number) return false;
              const cleanPatientPhone = phoneObj.number.replace(/\s+/g, '').replace(/[-()]/g, '');
              return cleanPatientPhone === cleanPhone;
            });
          } else if (p.phone_number) {
            // Old format: single phone_number field
            const cleanPatientPhone = p.phone_number.replace(/\s+/g, '').replace(/[-()]/g, '');
            return cleanPatientPhone === cleanPhone;
          }
          return false;
        });

        if (phoneMatch) {
          console.log('✅ [ClinikoAdapter] Found exact patient match by name + phone:', phoneMatch.id);
          return phoneMatch;
        }

        // If no exact name match, check for partial name match with phone verification
        const partialNameMatch = patients.find(p => {
          const patientFullName = `${p.first_name} ${p.last_name}`.toLowerCase();
          const providedName = patientName.toLowerCase();
          
          // Check if names have significant overlap
          const nameWords = providedName.split(' ');
          const patientWords = patientFullName.split(' ');
          const matchingWords = nameWords.filter(word => patientWords.includes(word));
          const hasNameSimilarity = matchingWords.length >= Math.min(nameWords.length, patientWords.length) * 0.5;
          
          if (!hasNameSimilarity) return false;
          
          // Verify phone number
          if (p.patient_phone_numbers && Array.isArray(p.patient_phone_numbers)) {
            return p.patient_phone_numbers.some(phoneObj => {
              if (!phoneObj.number) return false;
              const cleanPatientPhone = phoneObj.number.replace(/\s+/g, '').replace(/[-()]/g, '');
              return cleanPatientPhone === cleanPhone;
            });
          } else if (p.phone_number) {
            const cleanPatientPhone = p.phone_number.replace(/\s+/g, '').replace(/[-()]/g, '');
            return cleanPatientPhone === cleanPhone;
          }
          return false;
        });

        if (partialNameMatch) {
          console.log('✅ [ClinikoAdapter] Found patient match by name similarity + phone:', partialNameMatch.id);
          return partialNameMatch;
        }

        console.log('❌ [ClinikoAdapter] No match found for name + phone combination');
        return null;

      } catch (searchError: any) {
        console.error('❌ [ClinikoAdapter] Patient search by name + phone failed:', searchError.response?.data || searchError.message);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Error in searchPatientByNameAndPhone:', error);
      return null;
    }
  }

  /**
   * Get detailed upcoming appointments for a patient (for cancellation flow)
   */
  async getPatientUpcomingAppointments(patient: ClinikoPatient): Promise<Array<{
    id: string;
    date: string;
    time: string;
    practitioner: string;
    service: string;
    duration: number;
    status: string;
    diagnostics?: any;
  }>> {
    try {
      console.log('📅 [ClinikoAdapter] Getting appointments for patient (CORRECT ENDPOINT):', patient.id);

      // ENDPOINT FIX: Use /bookings endpoint instead of /individual_appointments
      const patientIdString = String(patient.id);
      
      console.log('🔧 [ClinikoAdapter] Using correct /bookings endpoint:', {
        patientId: patientIdString,
        endpoint: '/bookings',
        filter: `patient_ids:~${patientIdString}`,
        source: 'https://api.uk2.cliniko.com/v1/bookings?q[]=patient_ids:~123'
      });

      // Fetch practitioners and appointment types for ID resolution
      console.log('🔍 [ClinikoAdapter] Fetching practitioners and appointment types for ID resolution...');
      const [practitioners, appointmentTypes, bookingsResponse] = await Promise.all([
        this.getPractitioners(),
        this.getServices(),
        this.api.get(`/bookings`, {
          params: { 
            'q[]': `patient_ids:~${patientIdString}`,
            sort: 'starts_at',
            per_page: 100
          }
        })
      ]);

      // Create lookup maps for efficient ID resolution
      const practitionerMap = new Map(practitioners.map(p => [p.id, p.name]));
      const appointmentTypeMap = new Map(appointmentTypes.map(t => [t.id, { name: t.name, duration: t.duration }]));

      console.log('📋 [ClinikoAdapter] CORRECT ENDPOINT Response:', {
        status: bookingsResponse.status,
        bookingCount: bookingsResponse.data?.bookings?.length || 0,
        endpoint: '/bookings',
        filterUsed: `patient_ids:~${patientIdString}`,
        requestUrl: bookingsResponse.config?.url,
        practitionersLoaded: practitioners.length,
        appointmentTypesLoaded: appointmentTypes.length
      });

      // Note: /bookings endpoint returns { bookings: [...] } not { individual_appointments: [...] }
      const bookings = bookingsResponse.data?.bookings || [];
      
      if (bookings.length === 0) {
        console.log('⚠️ [ClinikoAdapter] No bookings found with correct endpoint');
        return [];
      }

      console.log('✅ [ClinikoAdapter] Found bookings with correct endpoint:', 
        bookings.map((booking: any) => ({
          id: booking.id,
          starts_at: booking.starts_at,
          patient_ids: booking.patient_ids,
          cancelled_at: booking.cancelled_at,
          appointment_type: booking.appointment_type?.id || booking.appointment_type_id || 'nested object',
          practitioner: booking.practitioner?.id || booking.practitioner_id || 'nested object'
        }))
      );

      // Transform bookings to expected format and filter for upcoming appointments
      const upcomingAppointments = bookings
        .filter((booking: any) => {
          // Filter out cancelled appointments
          if (booking.cancelled_at) return false;
          
          // Filter for future appointments
          const appointmentDate = moment(booking.starts_at);
          return appointmentDate.isAfter(moment());
        })
        .map((booking: any) => {
          const startTime = moment(booking.starts_at).tz(this.timezone);
          
          // FIXED: Extract IDs from nested objects in booking response (same as getPatientUpcomingAppointments)
          let practitionerId: string | undefined;
          let appointmentTypeId: string | undefined;
          
          // Extract practitioner ID from nested object or direct field
          if (booking.practitioner?.id) {
            practitionerId = String(booking.practitioner.id);
          } else if (booking.practitioner_id) {
            practitionerId = String(booking.practitioner_id);
          } else if (booking.practitioner?.links?.self) {
            const match = booking.practitioner.links.self.match(/\/practitioners\/(\d+)/);
            practitionerId = match ? match[1] : undefined;
          }
          
          // Extract appointment type ID from nested object or direct field
          if (booking.appointment_type?.id) {
            appointmentTypeId = String(booking.appointment_type.id);
          } else if (booking.appointment_type_id) {
            appointmentTypeId = String(booking.appointment_type_id);
          } else if (booking.appointment_type?.links?.self) {
            const match = booking.appointment_type.links.self.match(/\/appointment_types\/(\d+)/);
            appointmentTypeId = match ? match[1] : undefined;
          }
          
          console.log('🔍 [DEBUG] ID extraction for booking:', {
            bookingId: booking.id,
            practitionerId,
            appointmentTypeId,
            rawPractitioner: booking.practitioner,
            rawAppointmentType: booking.appointment_type
          });
          
          // Resolve practitioner and appointment type names using extracted IDs
          const practitionerName = practitionerId ? practitionerMap.get(practitionerId) || 'Unknown Practitioner' : 'Unknown Practitioner';
          const appointmentTypeInfo = appointmentTypeId ? appointmentTypeMap.get(appointmentTypeId) : undefined;
          const serviceName = appointmentTypeInfo?.name || 'Unknown Service';
          const duration = appointmentTypeInfo?.duration || 30;
          
          return {
            id: String(booking.id),
            date: startTime.format('dddd, MMMM Do YYYY'),
            time: startTime.format('h:mm A'),
            practitioner: practitionerName,
            service: serviceName,
            duration: duration,
            status: booking.cancelled_at ? 'Cancelled' : 'Scheduled'
          };
        });

      console.log(`📅 [ClinikoAdapter] Returning ${upcomingAppointments.length} upcoming appointments with resolved names:`,
        upcomingAppointments.map((apt: any) => ({ 
          id: apt.id, 
          practitioner: apt.practitioner, 
          service: apt.service, 
          duration: apt.duration 
        }))
      );
      return upcomingAppointments;

    } catch (error) {
      console.error('❌ [ClinikoAdapter] Error with /bookings endpoint:', error);
      return [{
        id: 'DIAGNOSTIC_ERROR',
        date: 'Error',
        time: 'Error', 
        practitioner: 'Error',
        service: 'Error',
        duration: 0,
        status: 'Error',
        diagnostics: {
          error: error instanceof Error ? error.message : 'Unknown error',
          patientId: patient.id,
          timestamp: new Date().toISOString(),
          endpoint: '/bookings',
          requestFormat: `patient_ids:~${String(patient.id)}`
        }
      }];
    }
  }

  /**
   * Create a new patient and book an appointment in one operation
   */
  async createNewPatientBooking(appointmentData: AppointmentData): Promise<BookingResponse> {
    try {
      console.log('➕ [ClinikoAdapter] Creating new patient and booking appointment');
      
      // First create the patient using proper Cliniko API structure
      const [firstName, ...lastNameParts] = appointmentData.patientName.trim().split(' ');
      const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : firstName;

      // Build payload according to Cliniko API documentation
      const patientPayload: any = {
        first_name: firstName,
        last_name: lastName,
        date_of_birth: appointmentData.dateOfBirth, // Add date of birth as required field
        country: "United Kingdom",
        country_code: "GB",
        receives_confirmation_emails: true,
        receives_cancellation_emails: true,
        reminder_type: "SMS & Email"
      };

      // Add phone number in correct Cliniko API format (array of objects)
      if (appointmentData.patientPhone) {
        patientPayload.patient_phone_numbers = [
          {
            phone_type: "Mobile",
            number: appointmentData.patientPhone
          }
        ];
      }
      
      // Add email if provided
      if (appointmentData.patientEmail) {
        patientPayload.email = appointmentData.patientEmail;
      }

      console.log('📝 [ClinikoAdapter] Creating new patient with Cliniko API compliant payload:', patientPayload);

      const patientResponse = await this.api.post('/patients', patientPayload);
      
      // Log the full response to understand the structure
      console.log('📊 [ClinikoAdapter] Patient creation response:', {
        status: patientResponse.status,
        data: patientResponse.data
      });

      // Extract patient from response
      const patient: ClinikoPatient = patientResponse.data.patient || patientResponse.data;

      if (!patient) {
        console.error('❌ [ClinikoAdapter] No patient object in response:', patientResponse.data);
        throw new Error('Failed to create patient - no patient data in response');
      }
      
      if (!patient || !patient.id) {
        console.error('❌ [ClinikoAdapter] Patient object missing required fields:', patient);
        throw new Error('Failed to create patient - invalid patient data in response');
      }

      console.log('✅ [ClinikoAdapter] Successfully created new patient:', {
        id: patient.id,
        name: `${patient.first_name} ${patient.last_name}`,
        phone: patient.patient_phone_numbers?.[0]?.number || patient.phone_number || 'not provided',
        email: patient.email || 'not provided'
      });

      // Now book the appointment directly using the created patient ID
      console.log('📅 [ClinikoAdapter] Proceeding to book appointment for new patient...');
      
      // Get appointment type and practitioner IDs
      console.log('🔍 [ClinikoAdapter] Finding appointment type and practitioner...');
      const appointmentType = await this.findAppointmentTypeByName(appointmentData.serviceType);
      const practitioner = appointmentData.therapistPreference 
        ? await this.findPractitionerByName(appointmentData.therapistPreference)
        : null;

      console.log('🔍 [ClinikoAdapter] Appointment type:', appointmentType ? `${appointmentType.name} (ID: ${appointmentType.id})` : 'NOT FOUND');
      console.log('🔍 [ClinikoAdapter] Practitioner:', practitioner ? `${practitioner.name} (ID: ${practitioner.id})` : 'Not specified');

      if (!appointmentType) {
        console.error('❌ [ClinikoAdapter] Service type not found:', appointmentData.serviceType);
        return {
          success: false,
          error: `Service type "${appointmentData.serviceType}" not found`,
          patient: {
            id: patient.id,
            name: `${patient.first_name} ${patient.last_name}`,
            isNew: true
          }
        };
      }

      // Validate and format the appointment time using correct timezone conversion
      console.log(`🕐 [ClinikoAdapter] DEBUG: Creating NEW PATIENT appointment with timezone: ${this.timezone}`);
      console.log(`🕐 [ClinikoAdapter] DEBUG: Input date/time: ${appointmentData.preferredDate} ${appointmentData.preferredTime}`);
      
      // FIXED TIMEZONE HANDLING: Always use clinic timezone, never fall back to UTC for patient times
      const clinicTimezone = this.timezone || 'Europe/London'; // Ensure we have a timezone
      
      console.log(`🕐 [ClinikoAdapter] DEBUG: Using timezone: ${clinicTimezone} (original: ${this.timezone})`);
      
      // Always interpret patient-provided times as clinic local time
      const appointmentDateTime = moment.tz(`${appointmentData.preferredDate} ${appointmentData.preferredTime}`, 'YYYY-MM-DD HH:mm', clinicTimezone);
      
      if (!appointmentDateTime.isValid()) {
        console.error('❌ [ClinikoAdapter] Invalid date/time format:', { date: appointmentData.preferredDate, time: appointmentData.preferredTime });
        return {
          success: false,
          error: `Invalid date or time format: ${appointmentData.preferredDate} ${appointmentData.preferredTime}`,
          patient: {
            id: patient.id,
            name: `${patient.first_name} ${patient.last_name}`,
            isNew: true
          }
        };
      }

      console.log('📅 [ClinikoAdapter] Appointment date/time (clinic timezone):', appointmentDateTime.format('YYYY-MM-DD HH:mm Z'));
      console.log('📅 [ClinikoAdapter] Appointment date/time (UTC):', appointmentDateTime.toISOString());
      
      // VALIDATION: Ensure the time we're booking matches what was promised to the user
      const promisedLocalTime = appointmentData.preferredTime;
      const actualLocalTime = appointmentDateTime.format('HH:mm');
      
      if (promisedLocalTime !== actualLocalTime) {
        console.error(`❌ [ClinikoAdapter] TIMEZONE MISMATCH: Promised ${promisedLocalTime} but booking ${actualLocalTime} (clinic timezone)`);
        return {
          success: false,
          error: `Time conversion error: Cannot book ${promisedLocalTime} as requested`,
          patient: {
            id: patient.id,
            name: `${patient.first_name} ${patient.last_name}`,
            isNew: true
          }
        };
      }
      
      console.log(`✅ [ClinikoAdapter] TIMEZONE VALIDATION PASSED: Booking ${actualLocalTime} (${clinicTimezone}) as promised`);

      // Calculate appointment end time using duration
      const appointmentEndDateTime = appointmentDateTime.clone().add(appointmentType.duration || 30, 'minutes');
      
      // If no practitioner specified, get the first available one
      let selectedPractitioner = practitioner;
      if (!selectedPractitioner) {
        const practitioners = await this.getPractitioners();
        if (practitioners.length > 0) {
          const firstPractitioner = practitioners[0];
          if (firstPractitioner) {
            selectedPractitioner = { id: firstPractitioner.id, name: firstPractitioner.name };
            console.log('🔍 [ClinikoAdapter] No practitioner specified, using first available:', selectedPractitioner.name);
          } else {
            console.error('❌ [ClinikoAdapter] No practitioners available');
            return {
              success: false,
              error: 'No practitioners available for booking',
              patient: {
                id: patient.id,
                name: `${patient.first_name} ${patient.last_name}`,
                isNew: true
              }
            };
          }
        } else {
          console.error('❌ [ClinikoAdapter] No practitioners available');
          return {
            success: false,
            error: 'No practitioners available for booking',
            patient: {
              id: patient.id,
              name: `${patient.first_name} ${patient.last_name}`,
              isNew: true
            }
          };
        }
      }

      // Create the appointment using the correct endpoint and the created patient ID with all required fields
      const appointmentPayload = {
        appointment_type_id: appointmentType.id,
        patient_id: patient.id.toString(), // Use the created patient ID directly
        appointment_start: appointmentDateTime.toISOString(),
        appointment_end: appointmentEndDateTime.toISOString(),
        starts_at: appointmentDateTime.toISOString(),
        ends_at: appointmentEndDateTime.toISOString(),
        business_id: this.credentials.businessId,
        max_attendees: 1,
        notes: appointmentData.notes || '',
        ...(selectedPractitioner && { practitioner_id: selectedPractitioner.id })
      };

      console.log('📝 [ClinikoAdapter] Appointment payload:', appointmentPayload);

      const appointmentResponse = await this.api.post('/individual_appointments', appointmentPayload);
      
      // Log the full response structure for debugging
      console.log('📊 [ClinikoAdapter] Full appointment response structure:', {
        status: appointmentResponse.status,
        data: appointmentResponse.data,
        hasIndividualAppointment: !!appointmentResponse.data?.individual_appointment,
        dataKeys: Object.keys(appointmentResponse.data || {})
      });

      // Robust response parsing - handle different possible structures
      let appointment: ClinikoAppointment;
      
      if (appointmentResponse.data?.individual_appointment) {
        // Standard nested structure
        appointment = appointmentResponse.data.individual_appointment;
        console.log('✅ [ClinikoAdapter] Using nested appointment structure');
      } else if (appointmentResponse.data && appointmentResponse.data.id) {
        // Direct structure
        appointment = appointmentResponse.data;
        console.log('✅ [ClinikoAdapter] Using direct appointment structure');
      } else {
        // Log full response for debugging and throw detailed error
        console.error('❌ [ClinikoAdapter] Unknown appointment response structure:', {
          status: appointmentResponse.status,
          data: appointmentResponse.data,
          dataType: typeof appointmentResponse.data,
          dataKeys: appointmentResponse.data ? Object.keys(appointmentResponse.data) : 'no data'
        });
        throw new Error(`Unknown appointment response structure - expected appointment data but got: ${JSON.stringify(appointmentResponse.data)}`);
      }

      console.log('✅ [ClinikoAdapter] Appointment created successfully:', {
        id: appointment.id,
        starts_at: appointment.starts_at,
        patient: `${patient.first_name} ${patient.last_name}`, // Use patient data we already have
        practitioner: selectedPractitioner ? selectedPractitioner.name : 'Not specified' // Use practitioner data we already have
      });

      const bookingResponse: BookingResponse = {
        success: true,
        message: `Welcome to our clinic! Your ${appointmentData.serviceType} appointment has been booked successfully.`,
        appointmentId: appointment.id.toString(),
        scheduledDateTime: new Date(appointment.starts_at),
        therapistName: selectedPractitioner ? selectedPractitioner.name : 'To be assigned', // Use practitioner data we already have
        confirmationCode: `CLN-${appointment.id}`,
        patient: {
          id: patient.id,
          name: `${patient.first_name} ${patient.last_name}`,
          isNew: true
        }
      };
      
      return bookingResponse;

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Error in createNewPatientBooking:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      
      // Provide specific error messages based on error type
      let errorMessage = error.message;
      if (error.response?.status === 422) {
        errorMessage = 'Patient validation failed - please check the provided information';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid patient data format - please try again';
      }
      
      return {
        success: false,
        error: `Failed to create new patient booking: ${errorMessage}`,
        message: 'There was an issue creating your patient record and booking. Please try again or contact us directly.'
      };
    }
  }

  // Helper methods

  private async findOrCreatePatient(appointmentData: AppointmentData): Promise<{ patient: ClinikoPatient; isNew: boolean }> {
    try {
      console.log('👤 [ClinikoAdapter] Finding or creating patient for:', {
        name: appointmentData.patientName,
        phone: appointmentData.patientPhone ? 'provided' : 'not provided',
        email: appointmentData.patientEmail ? 'provided' : 'not provided'
      });

      let patient: ClinikoPatient | null = null;

      // Step 1: Search for existing patient by name using proper field filters
      if (appointmentData.patientName) {
        console.log('🔍 [ClinikoAdapter] Searching for existing patient by name:', appointmentData.patientName);
        
        // Parse name into first and last name for proper field filtering
        const [firstName, ...lastNameParts] = appointmentData.patientName.trim().split(' ');
        const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : '';
        
        // Build search parameters using field-based filtering (not q parameter)
        const searchParams: any = {
          per_page: 50 // Get more results to find better matches
        };
        
        // Add name filters
        if (firstName) {
          searchParams.first_name = firstName;
        }
        if (lastName) {
          searchParams.last_name = lastName;
        }
        
        console.log('🔍 [ClinikoAdapter] Using field-based search with params:', searchParams);
        
        try {
          const response = await this.api.get('/patients', {
            params: searchParams
          });
          
          const patients: ClinikoPatient[] = response.data.patients || [];
          console.log(`🔍 [ClinikoAdapter] Found ${patients.length} patients matching name search`);
          
          if (patients.length > 0) {
            // Step 2: Confirm by phone number if provided
            if (appointmentData.patientPhone) {
              const cleanPhone = appointmentData.patientPhone.replace(/\s+/g, '').replace(/[-()]/g, '');
              console.log('📞 [ClinikoAdapter] Confirming patient by phone number');
              
              patient = patients.find(p => {
                // Handle both old format (phone_number) and new format (patient_phone_numbers array)
                if (p.patient_phone_numbers && Array.isArray(p.patient_phone_numbers)) {
                  // New format: check all phone numbers in the array
                  return p.patient_phone_numbers.some(phoneObj => {
                    if (!phoneObj.number) return false;
                    const cleanPatientPhone = phoneObj.number.replace(/\s+/g, '').replace(/[-()]/g, '');
                    return cleanPatientPhone === cleanPhone; // FIXED: Exact match only
                  });
                } else if (p.phone_number) {
                  // Old format: single phone_number field
                  const cleanPatientPhone = p.phone_number.replace(/\s+/g, '').replace(/[-()]/g, '');
                  return cleanPatientPhone === cleanPhone; // FIXED: Exact match only
                }
                return false;
              }) || null;
              
              if (patient) {
                console.log('✅ [ClinikoAdapter] Found existing patient by name + phone confirmation:', patient.id);
                return { patient, isNew: false };
              } else {
                console.log('⚠️ [ClinikoAdapter] Name matches found but phone numbers don\'t match');
              }
            } else {
              // If no phone provided, use first exact name match
              const exactNameMatch = patients.find(p => 
                `${p.first_name} ${p.last_name}`.toLowerCase() === appointmentData.patientName.toLowerCase()
              );
              if (exactNameMatch) {
                patient = exactNameMatch;
                console.log('✅ [ClinikoAdapter] Found existing patient by exact name match:', patient.id);
                return { patient, isNew: false };
              }
            }
          }
        } catch (nameSearchError: any) {
          console.error('❌ [ClinikoAdapter] Name search failed:', nameSearchError.response?.data || nameSearchError.message);
          // Continue to email search or patient creation - don't fail the whole process
        }
      }

      // Step 3: If not found by name, try email as backup using field filter
      if (!patient && appointmentData.patientEmail) {
        console.log('🔍 [ClinikoAdapter] Searching for existing patient by email as backup');
        
        try {
          const response = await this.api.get('/patients', {
            params: { 
              email: appointmentData.patientEmail, // Use field filter instead of q parameter
              per_page: 20
            }
          });
          
          const patients: ClinikoPatient[] = response.data.patients || [];
          if (patients.length > 0) {
            // Find exact email match (should be exact with field filter, but keeping for safety)
            const foundPatient = patients.find(p => 
              p.email && appointmentData.patientEmail && p.email.toLowerCase() === appointmentData.patientEmail.toLowerCase()
            );
            patient = foundPatient || patients[0] || null; // Take first match if exact match not found
            
            if (patient) {
              console.log('✅ [ClinikoAdapter] Found existing patient by email:', patient.id);
              return { patient, isNew: false };
            }
          }
        } catch (emailSearchError: any) {
          console.error('❌ [ClinikoAdapter] Email search failed:', emailSearchError.response?.data || emailSearchError.message);
          // Continue to patient creation - don't fail the whole process
        }
      }

      // Step 4: Create new patient if not found
      if (!patient) {
        console.log('➕ [ClinikoAdapter] Creating new patient record');
        
        const [firstName, ...lastNameParts] = appointmentData.patientName.trim().split(' ');
        const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : firstName;

        // Prepare patient payload with all required/recommended fields following Cliniko API
        const patientPayload: any = {
          first_name: firstName,
          last_name: lastName,
          date_of_birth: appointmentData.dateOfBirth, // Add date of birth as required field
          country: "United Kingdom",
          country_code: "GB",
          receives_confirmation_emails: true,
          receives_cancellation_emails: true,
          reminder_type: "SMS & Email"
        };

        // Add phone number in correct Cliniko API format (array of objects)
        if (appointmentData.patientPhone) {
          patientPayload.patient_phone_numbers = [
            {
              phone_type: "Mobile",
              number: appointmentData.patientPhone
            }
          ];
        }
        
        if (appointmentData.patientEmail) {
          patientPayload.email = appointmentData.patientEmail;
        }

        console.log('📝 [ClinikoAdapter] Patient creation payload:', patientPayload);

        try {
          const response = await this.api.post('/patients', patientPayload);
          
          // Extract patient using the same logic as createNewPatientBooking
          if (response.data?.patient) {
            patient = response.data.patient;
          } else if (response.data?.first_name) {
            patient = response.data;
          } else if (Array.isArray(response.data?.patients) && response.data.patients.length > 0) {
            patient = response.data.patients[0];
          } else {
            console.error('❌ [ClinikoAdapter] Unexpected patient creation response structure:', response.data);
            throw new Error('Failed to extract patient data from response');
          }
          
          if (patient) {
            console.log('✅ [ClinikoAdapter] Successfully created new patient:', patient.id);
            return { patient, isNew: true };
          } else {
            console.error('❌ [ClinikoAdapter] Patient creation returned null/undefined');
          }
          
        } catch (createError: any) {
          console.error('❌ [ClinikoAdapter] Failed to create patient:', {
            status: createError.response?.status,
            statusText: createError.response?.statusText,
            data: createError.response?.data,
            payload: patientPayload
          });
          
          // Provide more specific error messages
          if (createError.response?.status === 400) {
            const errorData = createError.response.data;
            if (errorData && errorData.errors) {
              throw new Error(`Cliniko validation error: ${JSON.stringify(errorData.errors)}`);
            } else {
              throw new Error(`Invalid patient data: ${JSON.stringify(errorData)}`);
            }
          } else if (createError.response?.status === 422) {
            throw new Error('Patient data validation failed - please check name and contact information');
          } else {
            throw new Error(`Failed to create patient: ${createError.message}`);
          }
        }
      }

      throw new Error('Failed to find or create patient - no patient record available');

    } catch (error: any) {
      console.error('❌ [ClinikoAdapter] Error in findOrCreatePatient:', error);
      throw new Error(`Failed to find or create patient: ${error.message}`);
    }
  }

  private async findAppointmentTypeByName(serviceName: string): Promise<{ id: string; name: string; duration: number } | null> {
    try {
      const services = await this.getServices();
      
      // First try exact match (case-insensitive)
      let service = services.find(s => 
        s.name.toLowerCase() === serviceName.toLowerCase()
      );
      
      // If no exact match, try exact match with trimmed strings
      if (!service) {
        service = services.find(s => 
          s.name.trim().toLowerCase() === serviceName.trim().toLowerCase()
        );
      }
      
      console.log(`🔍 [ClinikoAdapter] findAppointmentTypeByName("${serviceName}") -> ${service ? `${service.name} (ID: ${service.id})` : 'NOT FOUND'}`);
      
      return service || null;
    } catch (error: any) {
      console.error(`❌ [ClinikoAdapter] Error finding appointment type: ${error}`);
      return null;
    }
  }

  private async findPractitionerByName(practitionerName: string): Promise<{ id: string; name: string } | null> {
    try {
      const practitioners = await this.getPractitioners();
      const practitioner = practitioners.find(p => 
        p.name.toLowerCase().includes(practitionerName.toLowerCase())
      );
      
      return practitioner || null;
    } catch (error: any) {
      return null;
    }
  }
} 