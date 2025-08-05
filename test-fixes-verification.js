const axios = require('axios');

const WEBHOOK_URL = 'http://localhost:3002/webhook/webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';
const TEST_SESSION_ID = 'test-fixes-verification';

async function sendMessage(message, sessionId = TEST_SESSION_ID) {
  try {
    console.log('\n🚀 Testing fix for:', message);
    
    const response = await axios.post(WEBHOOK_URL, {
      message,
      sessionId,
      userConsent: true,
      metadata: {
        source: 'test-fixes-verification',
        timestamp: new Date().toISOString()
      }
    });

    const data = response.data.data;
    console.log('📝 LLM Response:', data.message);
    
    if (data.functionCalls && data.functionCalls.length > 0) {
      console.log('\n🔧 Function calls made:');
      data.functionCalls.forEach((call, index) => {
        console.log(`  ${index + 1}. ${call.name}`);
        
        if (call.name === 'check_availability' && call.result && call.result.slots) {
          console.log(`     ✅ SLOTS VERIFICATION:`);
          console.log(`       - Total slots: ${call.result.slots.length}`);
          
          // Check if slots have displayTime
          const slotsWithDisplayTime = call.result.slots.filter(slot => slot.displayTime);
          console.log(`       - Slots with displayTime: ${slotsWithDisplayTime.length}/${call.result.slots.length}`);
          
          if (slotsWithDisplayTime.length > 0) {
            console.log(`       - Sample displayTimes: ${slotsWithDisplayTime.slice(0, 3).map(s => s.displayTime).join(', ')}`);
          }
          
          // Check dates of returned slots
          const slotDates = [...new Set(call.result.slots.map(slot => 
            new Date(slot.startTime).toISOString().split('T')[0]
          ))];
          console.log(`       - Slot dates: ${slotDates.join(', ')}`);
          
          if (call.result.searchParams && call.result.searchParams.preferredDate) {
            const requestedDate = call.result.searchParams.preferredDate;
            const sameDaySlots = call.result.slots.filter(slot => 
              new Date(slot.startTime).toISOString().split('T')[0] === requestedDate
            );
            console.log(`       - Same-day slots for ${requestedDate}: ${sameDaySlots.length}`);
          }
        }
        
        if (call.name === 'book_appointment') {
          console.log(`     ✅ BOOKING VERIFICATION:`);
          if (call.result && call.result.success) {
            console.log(`       - ✅ Booking successful: ${call.result.appointmentId || 'N/A'}`);
            console.log(`       - Patient: ${call.result.patient?.name || 'N/A'}`);
          } else {
            console.log(`       - ❌ Booking failed: ${call.result?.error || 'Unknown error'}`);
          }
        }
      });
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    return null;
  }
}

async function runFixVerification() {
  console.log('🔧 VERIFYING FIXES FOR BOOKING SYSTEM ISSUES');
  console.log('='.repeat(60));
  
  // Test 1: Check same-day availability (should return Thursday slots)
  await sendMessage("Is there any other availability for Thursday?");
  
  // Test 2: Check specific time availability
  await sendMessage("Can I book Thursday at 2pm?");
  
  // Test 3: Test new patient creation (different phone)
  await sendMessage("My name is John Smith, my phone is 07123456789, I'd like to book a standard appointment for Friday at 10am");
  
  console.log('\n✅ Fix verification complete!');
}

if (require.main === module) {
  runFixVerification().catch(console.error);
}

module.exports = { sendMessage }; 