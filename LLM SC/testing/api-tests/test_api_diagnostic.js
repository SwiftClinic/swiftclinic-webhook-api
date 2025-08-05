const axios = require('axios');

// Test configuration - Using the user's actual webhook
const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';
const TEST_SESSION_ID = 'test_diagnostic_session';

async function sendMessage(message, sessionId = TEST_SESSION_ID) {
  try {
    console.log('\n🚀 Sending message:', message);
    console.log('📱 Session ID:', sessionId);
    console.log('🔗 Webhook ID:', WEBHOOK_ID);
    
    const response = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: message,
      sessionId: sessionId,
      userConsent: true
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    // Fix: The response data is nested under response.data.data
    const data = response.data.data;
    
    console.log('\n✅ Response received:');
    console.log('📝 Message:', data.message);
    console.log('🎯 Intent:', data.metadata?.intent);
    console.log('📊 Confidence:', data.metadata?.confidence);
    console.log('🔄 Requires Follow-up:', data.requiresFollowUp);
    
    // Check if function calls were made (this is the key issue to investigate)
    if (data.functionCalls && data.functionCalls.length > 0) {
      console.log('\n🔧 Function calls made:');
      data.functionCalls.forEach((call, index) => {
        console.log(`  ${index + 1}. ${call.name}`);
        console.log(`     Parameters:`, JSON.stringify(call.parameters, null, 2));
        console.log(`     Result:`, JSON.stringify(call.result, null, 2));
        
        // Analyze specific issues
        if (call.name === 'check_availability') {
          if (call.result && call.result.slots) {
            console.log(`     ⚠️ Availability Check Analysis:`);
            console.log(`       - Total slots found: ${call.result.slots.length}`);
            if (call.result.slots.length === 0) {
              console.log(`       - ❌ NO SLOTS FOUND - This is the availability issue!`);
            } else {
              console.log(`       - ✅ Slots available:`, call.result.slots.map(s => s.startTime));
            }
          }
        }
        
        if (call.name === 'book_appointment') {
          console.log(`     ⚠️ Booking Analysis:`);
          if (call.result && call.result.success === false) {
            console.log(`       - ❌ BOOKING FAILED:`, call.result.error || call.result.errors);
            if (call.result.missingInfo) {
              console.log(`       - Missing info:`, call.result.missingInfo);
            }
          } else if (call.result && call.result.success) {
            console.log(`       - ✅ Booking successful:`, call.result.appointmentId);
          }
        }
      });
    } else {
      console.log('\n🚨 **CRITICAL ISSUE**: NO FUNCTION CALLS MADE!');
      console.log('   This means the LLM is not triggering the availability check.');
      console.log('   Expected: check_availability function should be called for booking requests.');
      console.log('   Actual: LLM just responded with text asking for details.');
    }
    
    return data;
    
  } catch (error) {
    console.error('\n❌ Error sending message:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    return null;
  }
}

// Test the exact flow from the user's conversation
async function testUserConversationFlow() {
  console.log('\n🎭 Testing exact user conversation flow...');
  
  const sessionId = 'user_flow_test_' + Date.now();
  
  // Step 1: Request standard appointment for tomorrow at 1pm
  console.log('\n📋 Step 1: Request standard appointment tomorrow at 1pm');
  console.log('Expected: Should call check_availability function');
  let result1 = await sendMessage('Could I book a standard appointment for tomorrow at 1pm', sessionId);
  
  // Wait between requests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 2: Request 8am instead
  console.log('\n📋 Step 2: Change to 8am request');  
  console.log('Expected: Should call check_availability function');
  let result2 = await sendMessage('Can I do 8am please', sessionId);
  
  // Wait between requests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 3: Provide contact details
  console.log('\n📋 Step 3: Provide contact details');
  console.log('Expected: Should attempt booking if previous steps worked');
  let result3 = await sendMessage('Yes - Test Test is my name, my number is 07777777777', sessionId);
  
  return { result1, result2, result3 };
}

// Test explicit availability request
async function testExplicitAvailabilityRequest() {
  console.log('\n🔍 Testing explicit availability request...');
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const sessionId = 'explicit_availability_' + Date.now();
  
  console.log('📅 Testing with explicit date:', tomorrowStr);
  console.log('Expected: MUST call check_availability function');
  
  const result = await sendMessage(
    `Please check availability for a Standard Appointment on ${tomorrowStr} at 13:00`, 
    sessionId
  );
  
  return result;
}

async function runDiagnosticTests() {
  console.log('🧪 Starting API Diagnostic Tests for Real Webhook');
  console.log('=' * 60);
  console.log('Webhook:', WEBHOOK_ID);
  console.log('=' * 60);
  
  // Test the exact user conversation flow
  await testUserConversationFlow();
  
  // Test explicit availability request to see if functions work at all
  await testExplicitAvailabilityRequest();
  
  console.log('\n' + '=' * 60);
  console.log('🏁 Diagnostic tests completed');
  console.log('=' * 60);
  
  console.log('\n🎯 ANALYSIS SUMMARY:');
  console.log('If you see "NO FUNCTION CALLS MADE" above, the issue is:');
  console.log('1. LLM is not recognizing booking requests as needing availability checks');
  console.log('2. Function calling might be disabled or misconfigured');
  console.log('3. The system prompt or function definitions might have issues');
}

if (require.main === module) {
  runDiagnosticTests()
    .then(() => {
      console.log('\n🎯 All diagnostic tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Diagnostic tests failed:', error);
      process.exit(1);
    });
}

module.exports = { sendMessage }; 