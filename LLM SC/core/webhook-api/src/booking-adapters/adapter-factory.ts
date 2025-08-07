import { ClinicConfig, BookingSystemType } from '../../../shared/types';
import { BaseBookingAdapter, BookingSystemCredentials } from './base-booking-adapter';
import { ClinikoAdapter } from './cliniko-adapter';
import { MockBookingAdapter, MockBookingOptions } from './mock-adapter';
import { FallbackManager } from '../core/fallback-manager';

export class BookingAdapterFactory {
  private static fallbackManager = new FallbackManager();
  
  /**
   * Create the appropriate booking adapter based on clinic configuration
   * Automatically falls back to mock adapter if real system is unavailable
   */
  static async createAdapter(clinicConfig: ClinicConfig): Promise<BaseBookingAdapter> {
    const { bookingSystem, apiCredentials } = clinicConfig;
    
    // Extract credentials from encrypted data
    let credentialsData: any = {};
    try {
      // For fallback configuration, data might be JSON string
      if (typeof apiCredentials.data === 'string') {
        credentialsData = JSON.parse(apiCredentials.data);
      } else if (apiCredentials.data && typeof apiCredentials.data === 'object') {
        credentialsData = apiCredentials.data;
      } else {
        // FIXED: Handle case where apiCredentials IS the credentials object (not wrapped in .data)
        credentialsData = apiCredentials;
      }
    } catch (error) {
      console.warn('⚠️ [AdapterFactory] Could not parse encrypted credentials, using fallback');
      // For development/fallback, handle unencrypted credentials
      credentialsData = apiCredentials as any;
    }
    
    // Convert to the format expected by adapters
    const credentials: BookingSystemCredentials = {
      apiKey: credentialsData.apiKey || '',
      secret: credentialsData.secret || '',
      baseUrl: this.getBaseUrl(bookingSystem, credentialsData.shard),
      ...credentialsData // Include any additional system-specific credentials
    };

    // Use timezone from clinic configuration (from Cliniko business API) instead of address guessing
    const timezone = clinicConfig.timezone || 'UTC';
    console.log(`🕐 [AdapterFactory] Using timezone: ${timezone} for clinic: ${clinicConfig.name}`);

    // Check if we should use mock booking
    if (this.fallbackManager.shouldUseMockBooking()) {
      console.log('🎭 [AdapterFactory] Mock booking enabled via configuration');
      return this.createMockAdapter(credentials, clinicConfig.id, timezone, bookingSystem);
    }

    // Validate credentials before creating real adapter
    const credentialsValid = this.validateCredentials(credentialsData, bookingSystem);
    if (!credentialsValid.isValid) {
      console.warn('⚠️ [AdapterFactory] Invalid credentials detected, falling back to mock adapter');
      const scenario = this.fallbackManager.handleFallbackScenario('invalid_credentials', {
        reason: credentialsValid.reason,
        bookingSystem
      });
      
      return this.createMockAdapter(credentials, clinicConfig.id, timezone, bookingSystem, {
        customMessages: {
          systemDown: scenario.userMessage
        }
      });
    }

    try {
      const adapter = await this.createRealAdapter(bookingSystem, credentials, clinicConfig.id, timezone, credentialsData);
      
      // Test the adapter connectivity
      const connectionTest = await this.testAdapterConnection(adapter);
      if (!connectionTest.success) {
        console.warn('⚠️ [AdapterFactory] Adapter connection test failed, falling back to mock adapter');
        const scenario = this.fallbackManager.handleFallbackScenario('booking_system_down', {
          error: connectionTest.error,
          bookingSystem
        });
        
        return this.createMockAdapter(credentials, clinicConfig.id, timezone, bookingSystem, {
          customMessages: {
            systemDown: scenario.userMessage
          }
        });
      }

      console.log(`✅ [AdapterFactory] Successfully created ${bookingSystem} adapter for clinic: ${clinicConfig.name}`);
      return adapter;

    } catch (error: any) {
      console.error(`❌ [AdapterFactory] Failed to create ${bookingSystem} adapter:`, error.message);
      
      // Determine fallback scenario based on error type
      let scenarioKey = 'general_error';
      if (error.message.includes('not yet implemented')) {
        scenarioKey = 'booking_system_down'; // Treat unimplemented as system down
      } else if (error.message.includes('authentication') || error.message.includes('credential')) {
        scenarioKey = 'invalid_credentials';
      }
      
      const scenario = this.fallbackManager.handleFallbackScenario(scenarioKey, {
        error: error.message,
        bookingSystem
      });
      
      return this.createMockAdapter(credentials, clinicConfig.id, timezone, bookingSystem, {
        customMessages: {
          systemDown: scenario.userMessage
        }
      });
    }
  }

  /**
   * Create a real booking adapter (non-mock)
   */
  private static async createRealAdapter(
    bookingSystem: BookingSystemType,
    credentials: BookingSystemCredentials,
    clinicId: string,
    timezone: string,
    credentialsData: any
  ): Promise<BaseBookingAdapter> {
    switch (bookingSystem) {
      case 'cliniko':
        return new ClinikoAdapter(
          {
            ...credentials,
            apiKey: credentialsData.apiKey || '',
            shard: credentialsData.shard || 'uk2', // Default to uk2
            businessId: credentialsData.businessId || '',
            baseUrl: this.getBaseUrl(bookingSystem, credentialsData.shard || 'uk2')
          },
          clinicId,
          timezone // Use actual timezone from Cliniko business API
        );

      case 'jane-app':
        // TODO: Implement Jane App adapter
        throw new Error('Jane App adapter not yet implemented');

      case 'acuity':
        // TODO: Implement Acuity adapter  
        throw new Error('Acuity adapter not yet implemented');

      case 'simple-practice':
        // TODO: Implement SimplePractice adapter
        throw new Error('SimplePractice adapter not yet implemented');

      case 'square-appointments':
        // TODO: Implement Square Appointments adapter
        throw new Error('Square Appointments adapter not yet implemented');

      case 'custom':
        // TODO: Implement custom adapter interface
        throw new Error('Custom booking system adapter not yet implemented');

      default:
        throw new Error(`Unsupported booking system: ${bookingSystem}`);
    }
  }

  /**
   * Create a mock adapter for fallback scenarios
   */
  private static createMockAdapter(
    credentials: BookingSystemCredentials,
    clinicId: string,
    timezone: string,
    originalSystem: BookingSystemType,
    options: MockBookingOptions = {}
  ): MockBookingAdapter {
    console.log(`🎭 [AdapterFactory] Creating mock adapter for ${originalSystem} system`);
    
    const mockOptions: MockBookingOptions = {
      simulateSlowResponses: process.env.NODE_ENV === 'development',
      simulateRandomErrors: false,
      ...options
    };

    return new MockBookingAdapter(credentials, clinicId, timezone, mockOptions);
  }

  /**
   * Validate booking system credentials
   */
  private static validateCredentials(credentialsData: any, bookingSystem: BookingSystemType): {
    isValid: boolean;
    reason?: string;
  } {
    switch (bookingSystem) {
      case 'cliniko':
        if (!credentialsData.apiKey) {
          return { isValid: false, reason: 'Missing Cliniko API key' };
        }
        if (!credentialsData.businessId) {
          return { isValid: false, reason: 'Missing Cliniko business ID' };
        }
        return { isValid: true };

      case 'jane-app':
        if (!credentialsData.apiKey) {
          return { isValid: false, reason: 'Missing Jane App API key' };
        }
        if (!credentialsData.subdomain) {
          return { isValid: false, reason: 'Missing Jane App subdomain' };
        }
        return { isValid: true };

      default:
        // For unimplemented systems, consider credentials invalid to trigger fallback
        return { isValid: false, reason: `${bookingSystem} system not yet implemented` };
    }
  }

  /**
   * Test adapter connection with timeout and error handling
   */
  private static async testAdapterConnection(adapter: BaseBookingAdapter): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Set a timeout for connection test
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), 10000);
      });

      const testPromise = adapter.testConnection();
      const result = await Promise.race([testPromise, timeoutPromise]);
      
      return { success: result.success, error: result.success ? undefined : result.message };
    } catch (error: any) {
      console.warn('⚠️ [AdapterFactory] Connection test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get base URL for a booking system
   */
  private static getBaseUrl(bookingSystem: BookingSystemType, shard?: string): string {
    switch (bookingSystem) {
      case 'cliniko':
        // Use the provided shard or default to uk2
        const clinikoShard = shard || 'uk2';
        return `https://api.${clinikoShard}.cliniko.com/v1`;
      
      case 'jane-app':
        return 'https://api.janeapp.com';
      
      case 'acuity':
        return 'https://acuityscheduling.com/api/v1';
      
      case 'simple-practice':
        return 'https://api.simplepractice.com/v1';
      
      case 'square-appointments':
        return 'https://connect.squareup.com/v2';
      
      default:
        return '';
    }
  }

  /**
   * Test connection to a booking system without creating full adapter
   */
  static async testConnection(clinicConfig: ClinicConfig): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const adapter = await this.createAdapter(clinicConfig);
      const result = await adapter.testConnection();
      
      // Check if this is a mock adapter
      if ('isMockAdapter' in adapter && (adapter as any).isMockAdapter()) {
        const mockStatus = (adapter as MockBookingAdapter).getMockStatus();
        return {
          success: false, // Mark as false since it's fallback mode
          message: 'System running in fallback mode - booking system unavailable',
          details: {
            ...result.details,
            mockMode: true,
            recommendations: mockStatus.recommendations
          }
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ [AdapterFactory] Connection test failed:', error);
      
      const errorMessage = this.fallbackManager.getErrorMessage(error, 'connection_test');
      
      return {
        success: false,
        message: errorMessage,
        details: {
          error: error.message,
          fallbackAvailable: true
        }
      };
    }
  }

  /**
   * Get system health status
   */
  static async getSystemHealth(): Promise<{
    booking: boolean;
    overall: 'healthy' | 'degraded' | 'critical';
    fallbackActive: boolean;
  }> {
    const health = await this.fallbackManager.testSystemHealth();
    
    return {
      booking: health.booking,
      overall: health.overall,
      fallbackActive: this.fallbackManager.shouldUseMockBooking()
    };
  }

  /**
   * Get fallback manager instance for external access
   */
  static getFallbackManager(): FallbackManager {
    return this.fallbackManager;
  }
} 