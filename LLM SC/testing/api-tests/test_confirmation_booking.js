const axios = require('axios');

const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';

async function testConfirmationBooking() {
  const sessionId = 'confirmation_test_' + Date.now();
  
  console.log('🧪 Testing Booking with Confirmation Step');
  console.log('Session ID:', sessionId);
  console.log('=' * 50);

  try {
    // Step 1: Provide all details in one message
    console.log('\n📋 Step 1: Provide all details at once');
    const response1 = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'My name is Test Patient and my phone is 07777777777. Please book me for 8am tomorrow for a standard appointment.',
      sessionId: sessionId,
      userConsent: true
    }, { timeout: 30000 });

    console.log('Response 1:', response1.data.data.message);
    if (response1.data.data.functionCalls?.length > 0) {
      console.log('✅ Function calls:', response1.data.data.functionCalls.map(f => f.name));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Confirm the booking (respond "yes")
    console.log('\n📋 Step 2: Confirm the booking');
    const response2 = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'Yes, please go ahead and book that for me',
      sessionId: sessionId,
      userConsent: true
    }, { timeout: 30000 });

    console.log('Response 2:', response2.data.data.message);
    
    if (response2.data.data.functionCalls?.length > 0) {
      console.log('\n🔧 Function calls made in Step 2:');
      response2.data.data.functionCalls.forEach((call, index) => {
        console.log(`\n  ${index + 1}. ${call.name}`);
        console.log('     Parameters:', JSON.stringify(call.parameters, null, 2));
        
        if (call.name === 'book_appointment') {
          console.log(`\n     🎯 BOOKING RESULT:`);
          if (call.result.success) {
            console.log(`       ✅ SUCCESS! Appointment booked:`);
            console.log(`          - ID: ${call.result.appointmentId}`);
            console.log(`          - Confirmation: ${call.result.confirmationCode}`);
            console.log(`          - Therapist: ${call.result.therapistName}`);
            console.log(`          - Date/Time: ${call.result.scheduledDateTime}`);
          } else {
            console.log(`       ❌ FAILED:`);
            console.log(`          - Error: ${call.result.error}`);
            if (call.result.errors) {
              console.log(`          - Validation errors: ${JSON.stringify(call.result.errors)}`);
            }
            if (call.result.missingInfo) {
              console.log(`          - Missing info: ${JSON.stringify(call.result.missingInfo)}`);
            }
          }
        }
      });
    } else {
      console.log('❌ No function calls made in Step 2');
    }

  } catch (error) {
    console.error('\n💥 Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n' + '=' * 50);
  console.log('🏁 Confirmation booking test completed');
}

testConfirmationBooking(); 