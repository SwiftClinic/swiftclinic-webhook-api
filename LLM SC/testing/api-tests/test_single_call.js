const axios = require('axios');

const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';

async function singleTest() {
  try {
    console.log('🧪 Testing single webhook call...');
    
    const response = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'Could I book a standard appointment for tomorrow at 1pm',
      sessionId: 'single_test_session',
      userConsent: true
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n📡 Full Response:');
    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('\n📦 Response Data:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

singleTest(); 