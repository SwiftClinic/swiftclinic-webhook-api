// Test script to verify webhook creation works with your live Railway API
const axios = require('axios');

async function testWebhookCreation() {
  try {
    console.log('🧪 Testing webhook creation with live Railway API...\n');
    
    // Test data for a clinic
    const testClinic = {
      name: "Test Physiotherapy Clinic",
      contactEmail: "test@testclinic.com",
      contactPhone: "+1-555-123-4567",
      contactAddress: "123 Test Street, Test City, TC 12345",
      businessHours: {
        monday: { open: "09:00", close: "17:00", isOpen: true },
        tuesday: { open: "09:00", close: "17:00", isOpen: true },
        wednesday: { open: "09:00", close: "17:00", isOpen: true },
        thursday: { open: "09:00", close: "17:00", isOpen: true },
        friday: { open: "09:00", close: "17:00", isOpen: true },
        saturday: { isOpen: false },
        sunday: { isOpen: false }
      },
      services: ["General Consultation", "Follow-up"],
      bookingSystem: "cliniko",
      apiCredentials: {
        apiKey: "test-api-key",
        shard: "uk2", 
        businessId: "123456"
      },
      timezone: "Europe/London",
      gdprSettings: {
        enabled: true,
        region: "UK"
      }
    };

    // Test clinic creation (should generate webhook with Railway URL)
    console.log('📡 Creating test clinic...');
    const response = await axios.post('http://localhost:3001/api/clinics', testClinic, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.success) {
      console.log('✅ Clinic created successfully!');
      console.log('🔗 Generated Webhook URL:', response.data.data.webhookUrl);
      
      // Verify the webhook URL uses Railway domain
      if (response.data.data.webhookUrl.includes('swiftclinic-webhook-api-production.up.railway.app')) {
        console.log('✅ Webhook URL correctly uses Railway API!');
        
        // Test the generated webhook
        const webhookId = response.data.data.webhookUrl.split('/webhook/')[1];
        console.log('\n🧪 Testing generated webhook...');
        
        const webhookResponse = await axios.post(response.data.data.webhookUrl, {
          message: "Hello from test clinic!",
          sessionId: "test-session-123",
          userConsent: true
        }, {
          headers: { 'Content-Type': 'application/json' }
        });

        if (webhookResponse.data.success) {
          console.log('✅ Webhook working perfectly!');
          console.log('💬 Response:', webhookResponse.data.data.message);
        } else {
          console.log('❌ Webhook test failed');
        }
      } else {
        console.log('⚠️  Webhook URL not using Railway - check environment variables');
        console.log('Expected: swiftclinic-webhook-api-production.up.railway.app');
        console.log('Got:', response.data.data.webhookUrl);
      }
    } else {
      console.log('❌ Clinic creation failed:', response.data.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testWebhookCreation();