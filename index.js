const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const RailwayWebhookDeployer = require('./railway-webhook-deployment.js');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins
app.use(cors({
  origin: ['http://localhost:3000', 'https://admin.swiftclinic.ai'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// In-memory storage for clinics
let clinics = [];
let webhookDeployments = [];

// Initialize Railway deployer (you'll need to set RAILWAY_API_KEY in environment)
const railwayDeployer = new RailwayWebhookDeployer(process.env.RAILWAY_API_KEY);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    clinicsCount: clinics.length,
    webhooksCount: webhookDeployments.length
  });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalClinics: clinics.length,
      activeWebhooks: webhookDeployments.filter(w => w.status === 'active').length,
      totalUsers: 1,
      pendingTasks: webhookDeployments.filter(w => w.status === 'deploying').length
    },
    timestamp: new Date()
  });
});

// Clinics endpoints
app.get('/api/clinics', (req, res) => {
  res.json({
    success: true,
    data: clinics,
    timestamp: new Date()
  });
});

app.post('/api/clinics', (req, res) => {
  const clinicData = {
    id: `clinic_${Date.now()}`,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  
  // If clinic was created from business detection, extract business info
  if (req.body.businessData) {
    clinicData.businessInfo = {
      name: req.body.businessData.name,
      city: req.body.businessData.address?.city,
      country: req.body.businessData.address?.country,
      timezone: req.body.businessData.timezone
    };
    // Keep businessData for webhook deployment
  }
  
  // Store the clinic
  clinics.push(clinicData);
  
  res.json({
    success: true,
    data: clinicData,
    timestamp: new Date()
  });
});

// DELETE clinic endpoint
app.delete('/api/clinics/:id', (req, res) => {
  const { id } = req.params;
  
  // Find clinic index
  const clinicIndex = clinics.findIndex(clinic => clinic.id === id);
  
  if (clinicIndex === -1) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'CLINIC_NOT_FOUND',
        message: 'Clinic not found'
      },
      timestamp: new Date()
    });
  }
  
  // Get clinic data before deletion
  const deletedClinic = clinics[clinicIndex];
  
  // Remove clinic from array
  clinics.splice(clinicIndex, 1);
  
  // Also remove any webhook deployments for this clinic
  webhookDeployments = webhookDeployments.filter(w => w.clinicId !== id);
  
  res.json({
    success: true,
    data: {
      id: deletedClinic.id,
      name: deletedClinic.name,
      deletedAt: new Date().toISOString()
    },
    message: `Clinic "${deletedClinic.name}" has been successfully deleted`,
    timestamp: new Date()
  });
});

// CREATE WEBHOOK ENDPOINT - The main functionality
app.post('/api/clinics/:id/webhook', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the clinic
    const clinic = clinics.find(c => c.id === id);
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

    // Check if webhook already exists
    const existingWebhook = webhookDeployments.find(w => w.clinicId === id);
    if (existingWebhook) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'WEBHOOK_ALREADY_EXISTS',
          message: 'Webhook already exists for this clinic'
        },
        data: existingWebhook,
        timestamp: new Date()
      });
    }

    console.log(`🚀 Creating webhook for clinic: ${clinic.name}`);

    // Generate truly unique webhook identifier
    const uniqueWebhookId = uuidv4();
    const clinicSlug = clinic.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Create webhook deployment record with unique ID
    const webhookRecord = {
      id: `webhook_${Date.now()}`,
      clinicId: clinic.id,
      clinicName: clinic.name,
      uniqueWebhookId: uniqueWebhookId,
      clinicSlug: clinicSlug,
      status: 'deploying',
      createdAt: new Date().toISOString(),
      railwayProjectId: null,
      webhookUrl: `https://hopeful-serenity-production.up.railway.app/webhook/${uniqueWebhookId}`,
      apiConfiguration: {
        clinikApiKey: clinic.apiCredentials?.apiKey || null,
        businessId: clinic.businessId || null,
        timezone: clinic.timezone || 'UTC'
      }
    };

    webhookDeployments.push(webhookRecord);

    // Register clinic configuration with webhook API automatically
    try {
      const webhookApiUrl = 'https://hopeful-serenity-production.up.railway.app';
      const registrationResponse = await fetch(`${webhookApiUrl}/register-clinic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uniqueWebhookId: uniqueWebhookId,
          clinicId: clinic.id,
          clinicName: clinic.name,
          apiConfiguration: webhookRecord.apiConfiguration
        })
      });

      if (registrationResponse.ok) {
        console.log(`✅ Successfully registered clinic configuration for ${clinic.name}`);
      } else {
        console.warn(`⚠️ Failed to register clinic configuration: ${registrationResponse.statusText}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not register clinic with webhook API:`, error.message);
    }

    // Update webhook record as active (no longer need Railway deployment)
    webhookRecord.status = 'active';
    webhookRecord.deployedAt = new Date().toISOString();

    // Update clinic with unique webhook URL
    clinic.webhookUrl = webhookRecord.webhookUrl;
    clinic.webhookStatus = 'active';
    clinic.uniqueWebhookId = uniqueWebhookId;

    console.log(`✅ Unique webhook created successfully for ${clinic.name}: ${webhookRecord.webhookUrl}`);

    res.json({
      success: true,
      data: {
        webhookId: webhookRecord.id,
        uniqueWebhookId: uniqueWebhookId,
        webhookUrl: webhookRecord.webhookUrl,
        status: 'active',
        clinic: {
          id: clinic.id,
          name: clinic.name
        }
      },
      message: `Unique webhook created successfully for ${clinic.name}`,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Webhook creation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error during webhook creation'
      },
      timestamp: new Date()
    });
  }
});

// Get webhook status for a clinic
app.get('/api/clinics/:id/webhook', (req, res) => {
  const { id } = req.params;
  
  const webhook = webhookDeployments.find(w => w.clinicId === id);
  
  if (!webhook) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'WEBHOOK_NOT_FOUND',
        message: 'No webhook found for this clinic'
      },
      timestamp: new Date()
    });
  }

  res.json({
    success: true,
    data: webhook,
    timestamp: new Date()
  });
});

// List all webhooks
app.get('/api/webhooks', (req, res) => {
  res.json({
    success: true,
    data: webhookDeployments,
    timestamp: new Date()
  });
});

app.post('/api/clinics/detect-cliniko', async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required'
      },
      timestamp: new Date()
    });
  }

  // Mock response for clinic detection
  const mockResponse = {
    success: true,
    data: {
      shard: 'uk2',
      businesses: [
        {
          id: '12345',
          name: 'SwiftClinic Test',
          address: {
            country: 'United Kingdom',
            city: 'London'
          },
          timezone: 'Europe/London'
        }
      ],
      autoDetected: true,
      recommendations: {
        preferredShard: 'uk2',
        suggestedIntegrations: ['appointments', 'patients']
      }
    },
    timestamp: new Date()
  };

  res.json(mockResponse);
});

// Analytics endpoints
app.get('/api/analytics/overview', (req, res) => {
  res.json({
    success: true,
    data: {
      totalBookings: 0,
      revenue: 0,
      activePatients: 0,
      conversionRate: 0
    },
    timestamp: new Date()
  });
});

// Knowledge base endpoints
app.get('/api/knowledge-base', (req, res) => {
  res.json({
    success: true,
    data: [],
    timestamp: new Date()
  });
});

// Catch all for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    },
    timestamp: new Date()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SwiftClinic API Server running on port ${PORT}`);
  console.log(`📊 Clinics in memory: ${clinics.length}`);
  console.log(`🌐 Webhook deployments: ${webhookDeployments.length}`);
  console.log(`🔗 Webhook creation endpoint: POST /api/clinics/:id/webhook`);
});
# Trigger deployment
// Force redeploy - Wed Aug  6 10:39:05 BST 2025
