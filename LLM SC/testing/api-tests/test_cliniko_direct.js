const axios = require('axios');

const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';

async function testDirectPatientCreation() {
  console.log('🧪 Testing Direct Patient Creation');
  console.log('=' * 40);

  try {
    // Test creating a patient with the same data that's failing
    const response = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'My name is Test Patient and my phone is 07777777777. Please book me for 8am tomorrow for a standard appointment.',
      sessionId: 'direct_patient_test_' + Date.now(),
      userConsent: true
    }, { timeout: 30000 });

    console.log('\n📦 Response Message:', response.data.data.message);
    
    if (response.data.data.functionCalls?.length > 0) {
      console.log('\n🔧 Function calls made:');
      response.data.data.functionCalls.forEach((call, index) => {
        console.log(`\n${index + 1}. ${call.name}`);
        console.log('Parameters:', JSON.stringify(call.parameters, null, 2));
        console.log('Result:', JSON.stringify(call.result, null, 2));
      });
    }

  } catch (error) {
    console.error('\n💥 Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Also test the test-connection endpoint to see if Cliniko credentials are working
async function testClinikoConnection() {
  console.log('\n🔗 Testing Cliniko Connection');
  console.log('=' * 40);

  try {
    const response = await axios.post(`${API_BASE}/test-connection/${WEBHOOK_ID}`, {}, { timeout: 30000 });
    console.log('✅ Connection test result:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

async function runTests() {
  await testClinikoConnection();
  await testDirectPatientCreation();
}

runTests(); 