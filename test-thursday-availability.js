const axios = require('axios');

// Test configuration
const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';
const TEST_SESSION_ID = 'test_thursday_august_7th';

async function sendMessage(message, sessionId = TEST_SESSION_ID) {
  try {
    console.log('\n🚀 Sending message:', message);
    console.log('📱 Session ID:', sessionId);
    
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
    
    const data = response.data.data;
    
    console.log('\n✅ Response received:');
    console.log('📝 Message:', data.message);
    console.log('🔄 Requires Follow-up:', data.requiresFollowUp);
    
    // Analyze function calls in detail
    if (data.functionCalls && data.functionCalls.length > 0) {
      console.log('\n🔧 Function calls made:');
      data.functionCalls.forEach((call, index) => {
        console.log(`\n  ${index + 1}. Function: ${call.name}`);
        console.log(`     Parameters:`, JSON.stringify(call.parameters, null, 2));
        
        if (call.name === 'check_availability') {
          console.log(`\n     🎯 AVAILABILITY CHECK ANALYSIS:`);
          
          if (call.result) {
            // Check specific time results
            if (call.result.specificTimeCheck) {
              const specificCheck = call.result.specificTimeCheck;
              console.log(`       📍 Specific Time Check:`);
              console.log(`         - Requested: ${specificCheck.requestedDate} at ${specificCheck.requestedTime}`);
              console.log(`         - Available: ${specificCheck.isAvailable ? '✅ YES' : '❌ NO'}`);
              console.log(`         - Total slots on that day: ${specificCheck.totalSlotsOnDay}`);
              
              if (specificCheck.exactSlot) {
                console.log(`         - Exact slot found: ${new Date(specificCheck.exactSlot.startTime).toISOString()}`);
              }
            }
            
            // Check alternative slots
            if (call.result.slots && call.result.slots.length > 0) {
              console.log(`\n       🔄 Alternative Slots Found: ${call.result.slots.length}`);
              console.log(`         First 5 alternatives:`);
              call.result.slots.slice(0, 5).forEach((slot, i) => {
                const date = new Date(slot.startTime);
                console.log(`         ${i + 1}. ${date.toDateString()} at ${date.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: true 
                })} - ${slot.practitionerName} (${slot.serviceName})`);
              });
              
              // Check if alternatives include slots on the same day (Thursday 7th August)
              const thursdayAug7 = new Date('2025-08-07');
              const sameDaySlots = call.result.slots.filter(slot => {
                const slotDate = new Date(slot.startTime);
                return slotDate.toDateString() === thursdayAug7.toDateString();
              });
              
              if (sameDaySlots.length > 0) {
                console.log(`\n       ✅ SAME DAY ALTERNATIVES FOUND: ${sameDaySlots.length} slots on Thursday 7th August:`);
                sameDaySlots.forEach((slot, i) => {
                  const time = new Date(slot.startTime);
                  console.log(`         ${i + 1}. ${time.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })} - ${slot.practitionerName}`);
                });
              } else {
                console.log(`\n       ⚠️ NO SAME DAY ALTERNATIVES: No other slots available on Thursday 7th August`);
              }
            } else {
              console.log(`\n       ❌ NO ALTERNATIVE SLOTS FOUND`);
            }
            
            // Check if available time patterns are provided
            if (call.result.availableTimePatterns) {
              console.log(`\n       📊 Available Time Patterns:`);
              console.log(`         - Total days with availability: ${call.result.availableTimePatterns.totalDaysWithAvailability}`);
              console.log(`         - Most common times: ${call.result.availableTimePatterns.mostCommonTimes?.join(', ')}`);
              console.log(`         - All unique times: ${call.result.availableTimePatterns.uniqueAppointmentTimes?.slice(0, 10).join(', ')}${call.result.availableTimePatterns.uniqueAppointmentTimes?.length > 10 ? '...' : ''}`);
            }
            
            // Check search parameters
            if (call.result.searchParams) {
              console.log(`\n       🔍 Search Parameters Used:`);
              console.log(`         - Service: ${call.result.searchParams.serviceType}`);
              console.log(`         - Date: ${call.result.searchParams.preferredDate}`);
              console.log(`         - Time: ${call.result.searchParams.preferredTime}`);
              console.log(`         - Search days: ${call.result.searchParams.searchDays}`);
            }
          } else {
            console.log(`       ❌ NO RESULT DATA FOUND`);
          }
        }
        
        console.log(`\n     Full Result:`, JSON.stringify(call.result, null, 2));
      });
    } else {
      console.log('\n🚨 **CRITICAL ISSUE**: NO FUNCTION CALLS MADE!');
      console.log('   The LLM should have called check_availability for this request.');
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

async function testThursdayAvailability() {
  console.log('\n🎭 Testing Thursday 7th August at 10am availability...');
  console.log('Expected behavior:');
  console.log('1. 10am should NOT be available (per user requirements)');
  console.log('2. API should return other times available on Thursday 7th August');
  console.log('3. LLM should inform user that 10am is not available');
  console.log('4. LLM should suggest alternative times on the same day');
  
  const sessionId = 'thursday_test_' + Date.now();
  
  // Test the specific scenario
  console.log('\n📋 Requesting appointment for Thursday 7th August at 10am');
  const result = await sendMessage('I would like to book an appointment for Thursday 7th August at 10am please', sessionId);
  
  if (result) {
    console.log('\n🔍 ANALYSIS:');
    
    // Check if availability was checked
    const availabilityCall = result.functionCalls?.find(call => call.name === 'check_availability');
    if (availabilityCall) {
      console.log('✅ Availability check was performed');
      
      // Check if 10am was marked as unavailable
      const specificCheck = availabilityCall.result?.specificTimeCheck;
      if (specificCheck && !specificCheck.isAvailable) {
        console.log('✅ 10am correctly identified as NOT available');
        
        // Check if alternatives were provided
        const alternatives = availabilityCall.result?.slots;
        if (alternatives && alternatives.length > 0) {
          console.log('✅ Alternative slots were provided');
          
          // Check if same day alternatives exist
          const thursdayAug7 = new Date('2025-08-07');
          const sameDaySlots = alternatives.filter(slot => {
            const slotDate = new Date(slot.startTime);
            return slotDate.toDateString() === thursdayAug7.toDateString();
          });
          
          if (sameDaySlots.length > 0) {
            console.log('✅ Same day alternatives provided - LLM should mention these');
          } else {
            console.log('⚠️ No same day alternatives - calendar might be fully booked on Thursday 7th');
          }
        } else {
          console.log('❌ No alternative slots provided');
        }
      } else {
        console.log('❌ 10am was marked as available (unexpected based on requirements)');
      }
    } else {
      console.log('❌ No availability check was performed');
    }
    
    // Analyze the LLM response
    console.log('\n📝 LLM Response Analysis:');
    const message = result.message;
    if (message.toLowerCase().includes('not available') || message.toLowerCase().includes('unavailable')) {
      console.log('✅ LLM correctly stated that the time is not available');
    } else {
      console.log('❌ LLM did not clearly state that the time is unavailable');
    }
    
    if (message.toLowerCase().includes('thursday') && (message.toLowerCase().includes('other') || message.toLowerCase().includes('alternative'))) {
      console.log('✅ LLM mentioned alternatives on the same day');
    } else {
      console.log('⚠️ LLM may not have mentioned same-day alternatives');
    }
  }
  
  return result;
}

async function testFollowUpQuestion() {
  console.log('\n\n🔄 Testing follow-up question about rest of the day...');
  
  const sessionId = 'thursday_test_' + Date.now();
  
  // First request
  console.log('\n📋 Step 1: Initial request for 10am Thursday 7th August');
  const result1 = await sendMessage('I would like to book an appointment for Thursday 7th August at 10am please', sessionId);
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Follow-up question
  console.log('\n📋 Step 2: Follow-up about rest of the day');
  const result2 = await sendMessage('What about the rest of the day? What times are available on Thursday?', sessionId);
  
  if (result2) {
    console.log('\n🔍 FOLLOW-UP ANALYSIS:');
    
    const availabilityCall = result2.functionCalls?.find(call => call.name === 'check_availability');
    if (availabilityCall) {
      console.log('✅ Follow-up availability check was performed');
      
      const alternatives = availabilityCall.result?.slots;
      if (alternatives && alternatives.length > 0) {
        // Check Thursday 7th August slots
        const thursdayAug7 = new Date('2025-08-07');
        const thursdaySlots = alternatives.filter(slot => {
          const slotDate = new Date(slot.startTime);
          return slotDate.toDateString() === thursdayAug7.toDateString();
        });
        
        console.log(`Found ${thursdaySlots.length} slots on Thursday 7th August`);
        if (thursdaySlots.length > 0) {
          console.log('✅ LLM should be able to provide specific times for Thursday');
          thursdaySlots.forEach((slot, i) => {
            const time = new Date(slot.startTime);
            console.log(`  ${i + 1}. ${time.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            })} - ${slot.practitionerName}`);
          });
        } else {
          console.log('⚠️ No Thursday slots found - entire day might be booked');
        }
      }
    } else {
      console.log('❌ No follow-up availability check was performed');
    }
  }
  
  return { result1, result2 };
}

async function runThursdayAvailabilityTest() {
  console.log('🧪 Starting Thursday 7th August 10am Availability Test');
  console.log('=' * 70);
  console.log('Webhook:', WEBHOOK_ID);
  console.log('Date under test: Thursday 7th August 2025');
  console.log('Time under test: 10:00 AM');
  console.log('=' * 70);
  
  // Test 1: Basic availability check
  await testThursdayAvailability();
  
  // Test 2: Follow-up question about rest of day
  await testFollowUpQuestion();
  
  console.log('\n' + '=' * 70);
  console.log('🏁 Thursday availability test completed');
  console.log('=' * 70);
  
  console.log('\n🎯 KEY INVESTIGATION POINTS:');
  console.log('1. Does the API correctly identify 10am as unavailable?');
  console.log('2. Does the API return information about other times on Thursday 7th?');
  console.log('3. Does the LLM properly communicate unavailability?');
  console.log('4. Does the LLM suggest alternatives from the same day?');
  console.log('5. Can the LLM handle follow-up questions about the rest of the day?');
}

if (require.main === module) {
  runThursdayAvailabilityTest()
    .then(() => {
      console.log('\n🎯 Thursday availability test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Thursday availability test failed:', error);
      process.exit(1);
    });
}

module.exports = { sendMessage, testThursdayAvailability }; 