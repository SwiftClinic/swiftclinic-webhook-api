const axios = require('axios');

const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';

async function testBookingFlow() {
  const sessionId = 'booking_flow_test_' + Date.now();
  
  console.log('🧪 Testing Complete Booking Flow');
  console.log('Session ID:', sessionId);
  console.log('=' * 50);

  try {
    // Step 1: Initial request for standard appointment tomorrow at 1pm
    console.log('\n📋 Step 1: Request standard appointment tomorrow at 1pm');
    const response1 = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'Could I book a standard appointment for tomorrow at 1pm',
      sessionId: sessionId,
      userConsent: true
    }, { timeout: 30000 });

    console.log('Response 1:', response1.data.data.message);
    if (response1.data.data.functionCalls?.length > 0) {
      console.log('✅ Function calls made:', response1.data.data.functionCalls.map(f => f.name));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Request 8am instead 
    console.log('\n📋 Step 2: Change to 8am request');
    const response2 = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'Can I do 8am please',
      sessionId: sessionId,
      userConsent: true
    }, { timeout: 30000 });

    console.log('Response 2:', response2.data.data.message);
    if (response2.data.data.functionCalls?.length > 0) {
      console.log('✅ Function calls made:', response2.data.data.functionCalls.map(f => f.name));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Provide contact details to trigger booking
    console.log('\n📋 Step 3: Provide contact details (this should trigger booking)');
    const response3 = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'Yes - Test Test is my name, my number is 07777777777',
      sessionId: sessionId,
      userConsent: true
    }, { timeout: 30000 });

    console.log('Response 3:', response3.data.data.message);
    
    if (response3.data.data.functionCalls?.length > 0) {
      console.log('\n🔧 Function calls made in Step 3:');
      response3.data.data.functionCalls.forEach((call, index) => {
        console.log(`  ${index + 1}. ${call.name}`);
        console.log(`     Parameters:`, JSON.stringify(call.parameters, null, 2));
        
        if (call.name === 'book_appointment') {
          console.log(`     🎯 BOOKING RESULT:`);
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
      console.log('❌ No function calls made in Step 3');
    }

  } catch (error) {
    console.error('\n💥 Error during booking flow test:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n' + '=' * 50);
  console.log('🏁 Booking flow test completed');
}

testBookingFlow(); 