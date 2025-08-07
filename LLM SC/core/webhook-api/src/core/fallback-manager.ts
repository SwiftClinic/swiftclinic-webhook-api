/**
 * Enhanced Fallback Manager for handling system failures and mock scenarios
 */

export interface FallbackScenario {
  type: string;
  context: any;
  shouldUseMock: boolean;
  customMessages?: any;
}

export interface FallbackConfig {
  enableMockFallback: boolean;
  enableSystemHealth: boolean;
  healthCheckInterval: number;
  maxRetries: number;
}

export interface SystemHealthStatus {
  isHealthy: boolean;
  services: {
    database: boolean;
    openai: boolean;
    bookingSystem: boolean;
  };
  lastCheck: Date;
}

export class FallbackManager {
  private config: FallbackConfig;
  private healthStatus: SystemHealthStatus;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = {
      enableMockFallback: config.enableMockFallback ?? true,
      enableSystemHealth: config.enableSystemHealth ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 60000, // 1 minute
      maxRetries: config.maxRetries ?? 3,
      ...config
    };

    this.healthStatus = {
      isHealthy: true,
      services: {
        database: true,
        openai: true,
        bookingSystem: true
      },
      lastCheck: new Date()
    };
  }

  /**
   * Check if mock booking should be used
   */
  shouldUseMockBooking(): boolean {
    return this.config.enableMockFallback && !this.healthStatus.services.bookingSystem;
  }

  /**
   * Handle various fallback scenarios
   */
  handleFallbackScenario(scenarioType: string, context: any): FallbackScenario {
    switch (scenarioType) {
      case 'invalid_credentials':
        return {
          type: 'invalid_credentials',
          context,
          shouldUseMock: true,
          customMessages: {
            error: 'Unable to connect to booking system with provided credentials',
            fallback: 'Using mock booking system for demonstration'
          }
        };

      case 'booking_system_down':
        return {
          type: 'booking_system_down',
          context,
          shouldUseMock: true,
          customMessages: {
            error: 'Booking system is temporarily unavailable',
            fallback: 'Switching to backup booking system'
          }
        };

      case 'clinic_not_found':
        return {
          type: 'clinic_not_found',
          context,
          shouldUseMock: true,
          customMessages: {
            error: 'Clinic configuration not found',
            fallback: 'Using default clinic configuration'
          }
        };

      case 'general_error':
        return {
          type: 'general_error',
          context,
          shouldUseMock: this.config.enableMockFallback,
          customMessages: {
            error: 'An unexpected error occurred',
            fallback: 'Attempting to use fallback system'
          }
        };

      default:
        return {
          type: 'unknown',
          context,
          shouldUseMock: false,
          customMessages: {
            error: 'Unknown scenario',
            fallback: 'No fallback available'
          }
        };
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error: any, context: string): string {
    const baseMessage = error?.message || 'An unexpected error occurred';
    
    switch (context) {
      case 'connection_test':
        return `Connection test failed: ${baseMessage}`;
      case 'webhook_processing':
        return `Webhook processing error: ${baseMessage}`;
      case 'booking_operation':
        return `Booking operation failed: ${baseMessage}`;
      default:
        return `Error in ${context}: ${baseMessage}`;
    }
  }

  /**
   * Test system health
   */
  async testSystemHealth(): Promise<SystemHealthStatus> {
    try {
      // Mock health checks - in real implementation these would test actual services
      const healthChecks = await Promise.allSettled([
        this.testDatabaseHealth(),
        this.testOpenAIHealth(),
        this.testBookingSystemHealth()
      ]);

      this.healthStatus = {
        isHealthy: healthChecks.every(check => check.status === 'fulfilled' && check.value === true),
        services: {
          database: healthChecks[0].status === 'fulfilled' && healthChecks[0].value === true,
          openai: healthChecks[1].status === 'fulfilled' && healthChecks[1].value === true,
          bookingSystem: healthChecks[2].status === 'fulfilled' && healthChecks[2].value === true
        },
        lastCheck: new Date()
      };

      return this.healthStatus;
    } catch (error) {
      console.error('Health check failed:', error);
      this.healthStatus.isHealthy = false;
      return this.healthStatus;
    }
  }

  /**
   * Get fallback configuration
   */
  getFallbackConfig(): FallbackConfig {
    return { ...this.config };
  }

  /**
   * Create fallback clinic configuration using real Cliniko credentials from environment
   */
  createFallbackClinicConfig(webhookId: string): any {
    // Use real Cliniko credentials from environment variables
    const clinikoApiKey = process.env.CLINIKO_API_KEY;
    const clinikoBaseUrl = process.env.CLINIKO_BASE_URL || 'https://api.cliniko.com/v1';
    const businessId = process.env.CLINIKO_BUSINESS_ID || ''; // Empty, will be resolved dynamically by adapter

    if (clinikoApiKey) {
      console.log('🏥 [FallbackManager] Using real Cliniko API for fallback clinic');
      return {
        id: `cliniko_${webhookId}`,
        name: 'Cliniko Clinic (Auto-detected)',
        timezone: 'UTC', // Will be auto-detected from Cliniko API
        bookingSystem: 'cliniko',
        apiCredentials: {
          apiKey: clinikoApiKey,
          baseUrl: clinikoBaseUrl,
          businessId: businessId
        },
        businessHours: {
          monday: { open: '09:00', close: '17:00' },
          tuesday: { open: '09:00', close: '17:00' },
          wednesday: { open: '09:00', close: '17:00' },
          thursday: { open: '09:00', close: '17:00' },
          friday: { open: '09:00', close: '17:00' },
          saturday: null,
          sunday: null
        },
        services: [], // Will be fetched from Cliniko API
        practitioners: [] // Will be fetched from Cliniko API
      };
    } else {
      console.log('⚠️ [FallbackManager] No Cliniko API key found, using mock system');
      return {
        id: `fallback_${webhookId}`,
        name: 'Mock Clinic',
        timezone: 'UTC',
        bookingSystem: 'mock',
        apiCredentials: {
          apiKey: 'mock_api_key',
          baseUrl: 'https://mock.booking.system'
        },
        businessHours: {
          monday: { open: '09:00', close: '17:00' },
          tuesday: { open: '09:00', close: '17:00' },
          wednesday: { open: '09:00', close: '17:00' },
          thursday: { open: '09:00', close: '17:00' },
          friday: { open: '09:00', close: '17:00' },
          saturday: null,
          sunday: null
        },
        services: [
          {
            id: 'mock_service_1',
            name: 'General Consultation',
            duration: 30
          }
        ],
        practitioners: [
          {
            id: 'mock_practitioner_1',
            name: 'Dr. Mock',
            services: ['mock_service_1']
          }
        ]
      };
    }
  }

  private async testDatabaseHealth(): Promise<boolean> {
    // Mock database health check
    return new Promise(resolve => setTimeout(() => resolve(true), 100));
  }

  private async testOpenAIHealth(): Promise<boolean> {
    // Mock OpenAI health check
    return new Promise(resolve => setTimeout(() => resolve(true), 100));
  }

  private async testBookingSystemHealth(): Promise<boolean> {
    // Mock booking system health check
    return new Promise(resolve => setTimeout(() => resolve(true), 100));
  }
}