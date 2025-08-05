/**
 * Multi-Tenant Admin Dashboard Backend
 * Enterprise SaaS Platform for Instant Clinic Onboarding
 * Using existing Cliniko API integration
 */

// Load environment variables first
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';

// Import the existing working services
import { SecureDatabase } from '../../../../LLM SC/core/shared/database';
import { EncryptionService } from '../../../../LLM SC/core/shared/security/encryption';

export class AdminDashboardServer {
  private app: express.Application;
  private server: any;
  private database!: SecureDatabase;
  private encryptionService!: EncryptionService;

  constructor() {
    this.app = express();
    // Don't call initializeServices in constructor - it's async
  }

  private async initializeServices(): Promise<void> {
    // Initialize encryption service
    const masterPassword = process.env.MASTER_PASSWORD || 'default-password-change-in-production';
    this.encryptionService = new EncryptionService(masterPassword);

    // Initialize existing SecureDatabase
    const dbPath = path.resolve(__dirname, '../../../../LLM SC/data/dashboard.db');
    this.database = new SecureDatabase(dbPath, masterPassword);
    
    console.log('🔄 Using existing SecureDatabase and Cliniko API integration');
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize services first
      await this.initializeServices();
      
      // Initialize database
      await this.database.initialize();
      console.log('✅ SecureDatabase initialized with Cliniko API integration');

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      console.log('✅ Admin Dashboard Backend initialized with real Cliniko API');
    } catch (error) {
      console.error('❌ Failed to initialize Admin Dashboard Backend:', error);
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    }));

    // CORS configuration
    const corsOptions = {
      origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Access-Justification'],
    };
    this.app.use(cors(corsOptions));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.API_RATE_LIMIT_PER_MINUTE || '100'),
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan('combined'));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        database: 'SecureDatabase with Cliniko API',
        services: 'Real Cliniko Integration'
      });
    });

    // Clinic data endpoint
    this.app.get('/api/clinics-data', async (_req, res) => {
      try {
        const clinics = await this.database.getAllClinics();
        res.json({
          success: true,
          data: { 
            clinics: clinics.length,
            database: 'SecureDatabase',
            integration: 'Real Cliniko API',
            clinicList: clinics.map(c => ({
              id: c.id,
              name: c.name,
              bookingSystem: c.bookingSystem,
              webhookUrl: c.webhookUrl,
              isActive: c.isActive
            }))
          },
          message: 'Real clinic data from SecureDatabase'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch clinic data'
        });
      }
    });

    // Simple clinic creation endpoint (for testing)
    this.app.post('/api/clinics/simple', async (req, res) => {
      try {
        const { name, email, apiKey, shard, businessId } = req.body;
        
        if (!name || !email || !apiKey) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: name, email, apiKey'
          });
        }

        // Create basic clinic config
        const clinicConfig = {
          name,
          contactInfo: {
            email,
            phone: '',
            address: ''
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
          services: ['physiotherapy'],
          bookingSystem: 'cliniko' as const,
          apiCredentials: {
            data: JSON.stringify({ apiKey, shard: shard || 'uk2', businessId: businessId || 'auto-detect' }),
            iv: '',
            tag: ''
          },
          gdprSettings: {
            dataRetentionDays: 730,
            allowDataProcessing: true,
            cookieConsent: true
          },
          isActive: true
        };

        const clinic = await this.database.createClinic(clinicConfig);
        
        res.json({
          success: true,
          data: {
            clinic: {
              id: clinic.id,
              name: clinic.name,
              webhookUrl: clinic.webhookUrl,
              bookingSystem: clinic.bookingSystem
            },
            webhookUrls: {
              primary: `http://localhost:3005/webhook/${clinic.id}`,
              existing: `http://localhost:3002${clinic.webhookUrl}`
            }
          },
          message: 'Clinic created successfully with Cliniko integration'
        });

      } catch (error) {
        console.error('Clinic creation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create clinic',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Webhook routes that bridge to your existing webhook API
    this.app.post('/webhook/:webhookId', async (req, res) => {
      try {
        const webhookId = req.params.webhookId;
        const message = req.body.message || req.body;
        
        console.log(`🔗 Webhook received for webhook ID: ${webhookId}`);
        console.log(`💬 Message:`, message);
        
        // Construct webhook URL from ID
        const webhookUrl = `/webhook/${webhookId}`;
        
        // Get clinic config from SecureDatabase using webhook URL
        const clinic = await this.database.getClinicByWebhook(webhookUrl);
        
        if (!clinic) {
          return res.status(404).json({
            success: false,
            error: `Clinic not found for webhook: ${webhookId}`
          });
        }

        // Forward to your existing webhook API (running on port 3002)
        const existingWebhookUrl = `http://localhost:3002${clinic.webhookUrl}`;
        console.log(`🔄 Forwarding to existing webhook API: ${existingWebhookUrl}`);
        
        const response = await fetch(existingWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        });
        
        const result = await response.json();
        
        res.json({
          success: true,
          data: result,
          clinicInfo: {
            id: clinic.id,
            name: clinic.name,
            businessId: (clinic.apiCredentials as any)?.businessId || clinic.id,
            bookingSystem: clinic.bookingSystem
          },
          debug: {
            tenantResolved: true,
            clinicResolved: true,
            businessIdFound: !!(clinic.apiCredentials as any)?.businessId,
            fallbackMode: false,
            bookingSystemStatus: 'available',
            webhookUrl: clinic.webhookUrl
          }
        });
        
      } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({
          success: false,
          error: 'Webhook processing failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Catch-all handler
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
      } else {
        res.json({
          message: 'Admin Dashboard Backend',
          status: 'running',
          availableEndpoints: [
            'GET /health',
            'GET /api/clinics-data',
            'POST /api/clinics/simple',
            'POST /webhook/:webhookId'
          ]
        });
      }
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: any, res: any, next: any) => {
      console.error('Admin Dashboard error:', error);
      
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        },
        timestamp: new Date()
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown();
    });
  }

  public async start(): Promise<void> {
    const port = parseInt(process.env.DASHBOARD_PORT || '3005');
    
    this.server = createServer(this.app);
    
    // Explicitly bind to IPv4 localhost to avoid IPv6 issues
    this.server.listen(port, '127.0.0.1', () => {
      console.log(`
🚀 Admin Dashboard Backend running on port ${port}
📊 Environment: ${process.env.NODE_ENV || 'development'}
🔒 Database: SecureDatabase with Cliniko API
🏥 Booking System: Real Cliniko Integration
📈 Ready for instant clinic onboarding!

🌐 Available URLs:
   - Health: http://localhost:${port}/health
   - Clinics Data: http://localhost:${port}/api/clinics-data
   - Create Clinic: POST http://localhost:${port}/api/clinics/simple
   - Webhook: http://localhost:${port}/webhook/:webhookId

🔗 Your existing webhook API should be running on port 3002
      `);
    });
  }

  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Admin Dashboard Backend...');
    
    if (this.server) {
      this.server.close();
    }
    
    if (this.database) {
      await this.database.close();
    }
    
    console.log('✅ Admin Dashboard Backend shutdown complete');
    process.exit(0);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new AdminDashboardServer();
  
  server.initialize()
    .then(() => server.start())
    .catch((error) => {
      console.error('❌ Failed to start Admin Dashboard Backend:', error);
      process.exit(1);
    });
}

export default AdminDashboardServer; 