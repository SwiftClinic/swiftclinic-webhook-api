import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Webhook API configuration
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://swiftclinic-webhook-api-production.up.railway.app';

import { FirebaseService } from './services/firebase';
import { EncryptionService } from '../../shared/security/encryption';
import { setupRoutes } from './routes';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// Security headers
app.use(helmet());

// CORS - Updated for custom domain
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3002',
    'https://www.swiftclinic.ai',
    'https://swiftclinic.ai'
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase service
async function initializeServices() {
  const masterPassword = process.env.MASTER_PASSWORD || 'default-password-change-me';
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, '../../../firebase-service-account.json');
  
  console.log('🔥 Initializing Firebase service...');
  console.log('📁 Service account path:', serviceAccountPath);
  
  const firebaseService = new FirebaseService(serviceAccountPath, masterPassword);
  
  // Test Firebase connection
  const isHealthy = await firebaseService.healthCheck();
  if (isHealthy) {
    console.log('✅ Firebase database connected successfully');
  } else {
    throw new Error('❌ Firebase connection failed');
  }
  
  const encryptionService = new EncryptionService(masterPassword);
  
  return { firebaseService, encryptionService };
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date(),
    service: 'dashboard-backend'
  });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Dashboard backend error:', error);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    },
    timestamp: new Date()
  });
});

// Start server
initializeServices().then(({ firebaseService, encryptionService }) => {
  // Routes
  setupRoutes(app, firebaseService, encryptionService);
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`🎛️  Dashboard Backend running on port ${port}`);
    console.log(`🔗 Health check: http://0.0.0.0:${port}/api/health`);
    console.log(`🧪 Auto-detect endpoint: http://0.0.0.0:${port}/api/clinics/detect-cliniko`);
    console.log(`🔥 Database: Firebase Firestore connected`);
    console.log(`🌐 Server bound to all IPv4 interfaces (0.0.0.0)`);
    console.log(`🏠 Ready for custom domain: www.swiftclinic.ai/admin`);
  });
}).catch((error) => {
  console.error('Failed to initialize dashboard backend:', error);
  process.exit(1);
});

export default app;