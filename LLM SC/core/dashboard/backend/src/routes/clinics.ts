import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import axios from 'axios';
import { FirebaseService, FirebaseClinic } from '../services/firebase';
import { EncryptionService } from '../../../../shared/security/encryption';

// Cliniko auto-detection utilities
interface ClinikoDetectionResult {
  success: boolean;
  shard?: string;
  businesses?: Array<{
    id: string;
    name: string;
    country: string;
    timezone: string;
    services: string[]; // Include real services from Cliniko
  }>;
  error?: string;
  debug?: any; // Debug information for troubleshooting
}

// Jane App detection interface
interface JaneDetectionResult {
  success: boolean;
  subdomain?: string;
  clinics?: Array<{
    id: string;
    name: string;
    country?: string;
    timezone?: string;
  }>;
  error?: string;
}

// Unified detection result
interface PMSDetectionResult {
  success: boolean;
  pmsType: 'cliniko' | 'jane' | null;
  cliniko?: ClinikoDetectionResult;
  jane?: JaneDetectionResult;
  error?: string;
}

async function detectClinikoShard(apiKey: string): Promise<ClinikoDetectionResult> {
  const shards = ['uk2', 'au1', 'us1', 'ca1'];
  
  for (const shard of shards) {
    try {
      // First, get businesses
      const businessResponse = await axios.get(`https://api.${shard}.cliniko.com/v1/businesses`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Physio-Chat-System/1.0'
        },
        auth: {
          username: apiKey,
          password: ''
        },
        timeout: 10000 // 10 second timeout
      });

      if (businessResponse.status === 200 && businessResponse.data.businesses) {
        // Debug: Log the first business object to see its structure
        let debugInfo = null;
        if (businessResponse.data.businesses.length > 0) {
          console.log('🔍 First business object structure:', JSON.stringify(businessResponse.data.businesses[0], null, 2));
          // Also include in response for debugging
          debugInfo = {
            rawBusinessObject: businessResponse.data.businesses[0],
            availableFields: Object.keys(businessResponse.data.businesses[0])
          };
        }

        // Get appointment types (services) for each business
        console.log('🔍 [ClinikoDetection] Fetching appointment types for businesses...');
        const businessesWithServices = await Promise.all(
          businessResponse.data.businesses.map(async (biz: any) => {
            // Cliniko API uses 'business_name' as the primary field for business name
            const businessName = biz.business_name || 
                                biz.name || 
                                biz.display_name || 
                                biz.company_name || 
                                biz.organisation_name ||
                                biz.clinic_name ||
                                'Unnamed Business';

            console.log(`🏢 Processing business: ID=${biz.id}, business_name="${biz.business_name}", name="${biz.name}", display_name="${biz.display_name}"`);
            console.log(`🕐 Business timezone info: time_zone="${biz.time_zone}", time_zone_identifier="${biz.time_zone_identifier}"`);

            // Fetch appointment types for this business
            let services: string[] = [];
            try {
              const servicesResponse = await axios.get(`https://api.${shard}.cliniko.com/v1/appointment_types`, {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Physio-Chat-System/1.0'
                },
                auth: {
                  username: apiKey,
                  password: ''
                },
                params: {
                  show_online: true // Only get services enabled for online booking
                },
                timeout: 10000
              });

              if (servicesResponse.status === 200 && servicesResponse.data.appointment_types) {
                services = servicesResponse.data.appointment_types.map((service: any) => service.name);
                console.log(`🔍 [ClinikoDetection] Found ${services.length} services for ${businessName}:`, services);
              }
            } catch (serviceError) {
              console.warn(`Failed to fetch services for business ${biz.id}:`, serviceError && typeof serviceError === 'object' && 'response' in serviceError ? (serviceError as any).response?.status : 'unknown error');
              // Continue without services - we'll use empty array
            }

            return {
              id: biz.id.toString(),
              name: businessName,
              country: biz.country || biz.country_code || 'Unknown',
              timezone: biz.time_zone_identifier || biz.time_zone || 'UTC', // Use proper IANA timezone identifier
              timezoneDisplay: biz.time_zone || 'UTC', // Keep display name for UI
              services: services // Include real services from Cliniko
            };
          })
        );

        return {
          success: true,
          shard,
          businesses: businessesWithServices,
          debug: debugInfo // Include debug info in response
        };
      }
    } catch (error) {
      // Continue to next shard
      console.log(`Shard ${shard} failed:`, error && typeof error === 'object' && 'response' in error ? (error as any).response?.status : 'unknown error');
    }
  }

  return {
    success: false,
    error: 'Invalid API key or no accessible Cliniko account found'
  };
}

async function detectJaneConfiguration(apiKey: string): Promise<JaneDetectionResult> {
  try {
    // Jane App API detection - this is a placeholder implementation
    // TODO: Replace with actual Jane App API calls once we have proper documentation
    
    // For now, we'll simulate a simple API key validation
    // Jane App typically uses API tokens and has a different authentication pattern
    
    const response = await axios.get('https://api.janeapp.com/api/v1/user', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Physio-Chat-System/1.0'
      },
      timeout: 10000
    });

    if (response.status === 200 && response.data) {
      // Extract clinic information from Jane App response
      const clinics = [{
        id: response.data.id || '1',
        name: response.data.clinic_name || response.data.name || 'Jane Clinic',
        country: response.data.country || 'Unknown',
        timezone: response.data.timezone || 'UTC'
      }];

      return {
        success: true,
        subdomain: response.data.subdomain || 'jane-clinic',
        clinics
      };
    }

    return {
      success: false,
      error: 'Invalid Jane App API response'
    };

  } catch (error: any) {
    console.error('Jane App detection error:', error);
    
    if (error.response?.status === 401) {
      return {
        success: false,
        error: 'Invalid Jane App API key'
      };
    }
    
    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'Jane App API key does not have sufficient permissions'
      };
    }
    
    return {
      success: false,
      error: 'Could not connect to Jane App API. Please verify your API key and try again.'
    };
  }
}

async function testClinikoConnection(apiKey: string, shard: string, businessId?: string): Promise<{
  success: boolean;
  businessExists?: boolean;
  practitionerCount?: number;
  appointmentTypeCount?: number;
  error?: string;
}> {
  try {
    const baseURL = `https://api.${shard}.cliniko.com/v1`;
    
    // Create basic auth header manually (like curl does)
    const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
    
    // Test basic connection
    const businessResponse = await axios.get(`${baseURL}/businesses`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Physio-Chat-System/1.0',
        'Authorization': authHeader
      },
      timeout: 10000
    });

    if (!businessResponse.data.businesses) {
      return { success: false, error: 'No businesses found' };
    }

    // If businessId provided, verify it exists
    let businessExists = true;
    if (businessId) {
      businessExists = businessResponse.data.businesses.some((biz: any) => 
        biz.id.toString() === businessId
      );
    }

    // Get additional info for validation
    const [practitionersResponse, appointmentTypesResponse] = await Promise.all([
      axios.get(`${baseURL}/practitioners`, {
        headers: { 
          'Accept': 'application/json', 
          'User-Agent': 'Physio-Chat-System/1.0',
          'Authorization': authHeader
        },
        timeout: 10000
      }).catch(() => ({ data: { practitioners: [] } })),
      
      axios.get(`${baseURL}/appointment_types`, {
        headers: { 
          'Accept': 'application/json', 
          'User-Agent': 'Physio-Chat-System/1.0',
          'Authorization': authHeader
        },
        timeout: 10000
      }).catch(() => ({ data: { appointment_types: [] } }))
    ]);

    return {
      success: true,
      businessExists,
      practitionerCount: practitionersResponse.data.practitioners?.length || 0,
      appointmentTypeCount: appointmentTypesResponse.data.appointment_types?.length || 0
    };

  } catch (error) {
    const errorDetails = error && typeof error === 'object' && 'response' in error ? (error as any).response?.data : null;
    const errorMessage = error && typeof error === 'object' && 'message' in error ? (error as any).message : 'Unknown error';
    console.error('Cliniko connection test error:', errorDetails || errorMessage);
    return {
      success: false,
      error: errorDetails?.message || errorMessage || 'Connection test failed'
    };
  }
}

// Simple validation middleware
const validationMiddleware = (req: any, res: any, next: any) => {
  // For now, just continue - in full implementation would check express-validator results
  next();
};

export const createClinicRoutes = (firebaseService: FirebaseService, encryptionService: EncryptionService) => {
  const router = Router();

  // POST /api/clinics/detect-jane - Auto-detect Jane App configuration
  router.post('/detect-jane', [
    body('apiKey').isString().isLength({ min: 10 }).withMessage('Valid Jane App API key is required')
  ], validationMiddleware, async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;

      console.log('Auto-detecting Jane App configuration...');
      
      const detection = await detectJaneConfiguration(apiKey);

      if (!detection.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DETECTION_FAILED',
            message: detection.error || 'Could not detect Jane App configuration'
          },
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        data: {
          pmsType: 'jane',
          subdomain: detection.subdomain,
          clinics: detection.clinics,
          autoDetected: true,
          recommendations: {
            preferredClinicId: detection.clinics?.[0]?.id || null,
            timezone: detection.clinics?.[0]?.timezone || 'UTC',
            country: detection.clinics?.[0]?.country || 'Unknown'
          }
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error detecting Jane App configuration:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DETECTION_ERROR',
          message: 'Failed to detect Jane App configuration'
        },
        timestamp: new Date()
      });
    }
  });

  // POST /api/clinics/detect-pms - Auto-detect PMS type and configuration
  router.post('/detect-pms', [
    body('apiKey').isString().isLength({ min: 5 }).withMessage('Valid API key is required'),
    body('pmsType').optional().isIn(['cliniko', 'jane']).withMessage('PMS type must be cliniko or jane')
  ], validationMiddleware, async (req: Request, res: Response) => {
    try {
      const { apiKey, pmsType } = req.body;

      console.log(`Auto-detecting ${pmsType || 'unknown'} PMS configuration...`);
      
      let result: PMSDetectionResult = {
        success: false,
        pmsType: null,
        error: 'Unknown PMS type'
      };

      if (pmsType === 'cliniko' || !pmsType) {
        const clinikoDetection = await detectClinikoShard(apiKey);
        if (clinikoDetection.success) {
          result = {
            success: true,
            pmsType: 'cliniko',
            cliniko: clinikoDetection
          };
        } else if (pmsType === 'cliniko') {
          result = {
            success: false,
            pmsType: 'cliniko',
            error: clinikoDetection.error
          };
        }
      }

      if ((pmsType === 'jane' || !pmsType) && !result.success) {
        const janeDetection = await detectJaneConfiguration(apiKey);
        if (janeDetection.success) {
          result = {
            success: true,
            pmsType: 'jane',
            jane: janeDetection
          };
        } else if (pmsType === 'jane') {
          result = {
            success: false,
            pmsType: 'jane',
            error: janeDetection.error
          };
        }
      }

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DETECTION_FAILED',
            message: result.error || 'Could not detect PMS configuration'
          },
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        data: result,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error detecting PMS configuration:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DETECTION_ERROR',
          message: 'Failed to detect PMS configuration'
        },
        timestamp: new Date()
      });
    }
  });

  // POST /api/clinics/detect-cliniko - Auto-detect Cliniko shard and businesses
  router.post('/detect-cliniko', [
    body('apiKey').isString().isLength({ min: 10 }).withMessage('Valid Cliniko API key is required')
  ], validationMiddleware, async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;

      console.log('Auto-detecting Cliniko shard and businesses...');
      
      const detection = await detectClinikoShard(apiKey);

      if (!detection.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DETECTION_FAILED',
            message: detection.error || 'Could not detect Cliniko configuration'
          },
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        data: {
          shard: detection.shard,
          businesses: detection.businesses,
          autoDetected: true,
          recommendations: {
            preferredBusinessId: detection.businesses?.[0]?.id || null,
            timezone: detection.businesses?.[0]?.timezone || 'UTC',
            country: detection.businesses?.[0]?.country || 'Unknown'
          },
          debug: detection.debug // Include debug info in response
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error detecting Cliniko configuration:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DETECTION_ERROR',
          message: 'Failed to detect Cliniko configuration'
        },
        timestamp: new Date()
      });
    }
  });

  // POST /api/clinics/test-cliniko - Test Cliniko connection with specific parameters
  router.post('/test-cliniko', [
    body('apiKey').isString().isLength({ min: 10 }).withMessage('Valid Cliniko API key is required'),
    body('shard').isString().isIn(['uk2', 'au1', 'us1', 'ca1']).withMessage('Valid shard is required'),
    body('businessId').optional().isString().withMessage('Business ID must be a string')
  ], validationMiddleware, async (req: Request, res: Response) => {
    try {
      const { apiKey, shard, businessId } = req.body;

      console.log(`Testing Cliniko connection: shard=${shard}, businessId=${businessId}`);
      
      const test = await testClinikoConnection(apiKey, shard, businessId);

      if (!test.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONNECTION_FAILED',
            message: test.error || 'Connection test failed'
          },
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        data: {
          connectionValid: true,
          businessExists: test.businessExists,
          practitionerCount: test.practitionerCount,
          appointmentTypeCount: test.appointmentTypeCount,
          readyForBooking: (test.practitionerCount || 0) > 0 && (test.appointmentTypeCount || 0) > 0
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error testing Cliniko connection:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Failed to test connection'
        },
        timestamp: new Date()
      });
    }
  });

  // POST /api/clinics - Create new clinic (Enhanced with auto-detection support)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        name,
        contactEmail,
        contactPhone,
        contactAddress,
        businessHours,
        services,
        bookingSystem,
        apiCredentials,
        timezone,
        gdprSettings,
        autoDetected = false
      } = req.body;

      // Encrypt API credentials
      const encryptedCredentials = JSON.stringify(encryptionService.encrypt(JSON.stringify(apiCredentials)));

      // Generate unique webhook URL
      const webhookId = uuidv4();
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'https://swiftclinic-webhook-api-production.up.railway.app'}/webhook/${webhookId}`;

      // Enhanced validation with auto-detection support for both Cliniko and Jane
      if (bookingSystem === 'cliniko') {
        if (!apiCredentials.apiKey) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'API key is required for Cliniko'
            },
            timestamp: new Date()
          });
        }

        // Auto-detect if not provided
        if (!apiCredentials.shard || !apiCredentials.businessId) {
          console.log('Auto-detecting missing Cliniko configuration...');
          
          const detection = await detectClinikoShard(apiCredentials.apiKey);
          
          if (!detection.success) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'AUTO_DETECTION_FAILED',
                message: 'Could not auto-detect Cliniko configuration. Please provide shard and businessId manually.'
              },
              timestamp: new Date()
            });
          }

          // Use auto-detected values
          if (!apiCredentials.shard) {
            apiCredentials.shard = detection.shard;
          }
          
          if (!apiCredentials.businessId && detection.businesses && detection.businesses.length === 1) {
            apiCredentials.businessId = detection.businesses[0].id;
          } else if (!apiCredentials.businessId && detection.businesses && detection.businesses.length > 1) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'MULTIPLE_BUSINESSES',
                message: 'Multiple businesses found. Please specify which business to use.',
                details: {
                  businesses: detection.businesses
                }
              },
              timestamp: new Date()
            });
          }
        }

        // Validate required fields are now present
        if (!apiCredentials.businessId) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Business ID is required for Cliniko'
            },
            timestamp: new Date()
          });
        }

        // Final connection test
        const connectionTest = await testClinikoConnection(
          apiCredentials.apiKey, 
          apiCredentials.shard, 
          apiCredentials.businessId
        );

        if (!connectionTest.success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'CONNECTION_INVALID',
              message: `Cliniko connection failed: ${connectionTest.error}`
            },
            timestamp: new Date()
          });
        }

        if (!connectionTest.businessExists) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'BUSINESS_NOT_FOUND',
              message: 'The specified business ID was not found in your Cliniko account'
            },
            timestamp: new Date()
          });
        }
      } else if (bookingSystem === 'jane-app') {
        if (!apiCredentials.apiKey) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'API key is required for Jane App'
            },
            timestamp: new Date()
          });
        }

        // Auto-detect Jane configuration if not provided
        if (!apiCredentials.subdomain || !apiCredentials.clinicId) {
          console.log('Auto-detecting missing Jane App configuration...');
          
          const detection = await detectJaneConfiguration(apiCredentials.apiKey);
          
          if (!detection.success) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'AUTO_DETECTION_FAILED',
                message: 'Could not auto-detect Jane App configuration. Please verify your API key.'
              },
              timestamp: new Date()
            });
          }

          // Use auto-detected values
          if (!apiCredentials.subdomain) {
            apiCredentials.subdomain = detection.subdomain;
          }
          
          if (!apiCredentials.clinicId && detection.clinics && detection.clinics.length === 1) {
            apiCredentials.clinicId = detection.clinics[0].id;
          } else if (!apiCredentials.clinicId && detection.clinics && detection.clinics.length > 1) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'MULTIPLE_CLINICS',
                message: 'Multiple clinics found. Please specify which clinic to use.',
                details: {
                  clinics: detection.clinics
                }
              },
              timestamp: new Date()
            });
          }
        }

        // Validate required fields are now present
        if (!apiCredentials.clinicId) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Clinic ID is required for Jane App'
            },
            timestamp: new Date()
          });
        }

        // TODO: Add Jane App connection test when we have proper API documentation
        console.log('Jane App connection validation - TODO: implement proper connection test');
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Booking system must be either "cliniko" or "jane-app"'
          },
          timestamp: new Date()
        });
      }

      try {
        const clinicData: Partial<FirebaseClinic> = {
          name,
          contactEmail,
          contactPhone,
          contactAddress,
          businessHours,
          services,
          bookingSystem,
          encryptedCredentials,
          webhookUrl,
          timezone,
          gdprSettings,
          isActive: true
        };

        console.log('Attempting to save clinic to database...');
        // Save to database
        const clinicId = await firebaseService.createClinic(clinicData);
        console.log('Clinic saved successfully:', clinicId);

        // Return response without sensitive data
        const responseData: any = {
          id: clinicId,
          webhookUrl
        };

        // Add system-specific info
        if (bookingSystem === 'cliniko') {
          responseData.clinikoInfo = {
            shard: apiCredentials.shard,
            businessId: apiCredentials.businessId
          };
        } else if (bookingSystem === 'jane-app') {
          responseData.janeInfo = {
            subdomain: apiCredentials.subdomain,
            clinicId: apiCredentials.clinicId
          };
        }

        return res.status(201).json({
          success: true,
          data: responseData,
          timestamp: new Date()
        });

      } catch (detailError) {
        console.error('Database save error:', detailError);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to save clinic configuration'
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Create clinic error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        },
        timestamp: new Date()
      });
    }
  });

  // GET /api/clinics - List all clinics
  router.get('/', async (req: Request, res: Response) => {
    try {
      const clinics = await firebaseService.getClinics();
      
      // Remove sensitive data from response
      const publicClinics = clinics.map((clinic: any) => ({
        id: clinic.id,
        name: clinic.name,
        contactEmail: clinic.contactEmail,
        contactPhone: clinic.contactPhone,
        contactAddress: clinic.contactAddress,
        businessHours: clinic.businessHours,
        services: clinic.services,
        bookingSystem: clinic.bookingSystem,
        webhookUrl: clinic.webhookUrl,
        timezone: clinic.timezone,
        isActive: clinic.isActive,
        createdAt: clinic.createdAt.toDate(),
        updatedAt: clinic.updatedAt.toDate()
      }));

      return res.json({
        success: true,
        data: publicClinics,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error fetching clinics:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: 'Failed to fetch clinics'
        },
        timestamp: new Date()
      });
    }
  });

  // Get clinic by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const clinic = await firebaseService.getClinicById(req.params.id);
      
      if (!clinic) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CLINIC_NOT_FOUND',
            message: 'Clinic not found'
          },
          timestamp: new Date()
        });
      }

      return res.json({
        success: true,
        data: {
          id: clinic.id,
          name: clinic.name,
          contactEmail: clinic.contactEmail,
          contactPhone: clinic.contactPhone,
          contactAddress: clinic.contactAddress,
          businessHours: clinic.businessHours,
          services: clinic.services,
          bookingSystem: clinic.bookingSystem,
          webhookUrl: clinic.webhookUrl,
          timezone: clinic.timezone,
          isActive: clinic.isActive,
          createdAt: clinic.createdAt.toDate(),
          updatedAt: clinic.updatedAt.toDate()
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CLINIC_FETCH_ERROR',
          message: error.message
        },
        timestamp: new Date()
      });
    }
  });

  // Update clinic
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const clinicId = req.params.id;
      const updates = req.body;

      // If API credentials are being updated, encrypt them
      if (updates.apiCredentials) {
        updates.encryptedCredentials = JSON.stringify(encryptionService.encrypt(JSON.stringify(updates.apiCredentials)));
        delete updates.apiCredentials;
      }

      await firebaseService.updateClinic(clinicId, updates);

      return res.json({
        success: true,
        message: 'Clinic updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CLINIC_UPDATE_ERROR',
          message: error.message
        },
        timestamp: new Date()
      });
    }
  });

  // Delete clinic
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await firebaseService.deleteClinic(req.params.id);

      return res.json({
        success: true,
        message: 'Clinic deleted successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CLINIC_DELETE_ERROR',
          message: error.message
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}; 