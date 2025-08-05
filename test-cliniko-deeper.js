const axios = require('axios');

const API_BASE = 'http://localhost:3002';
const WEBHOOK_ID = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';

async function testMultipleDates() {
  console.log('🔍 Testing multiple dates to understand availability patterns...\n');
  
  const testDates = [
    { date: '2025-08-07', day: 'Thursday 7th August' },
    { date: '2025-08-05', day: 'Tuesday 5th August' },
    { date: '2025-08-06', day: 'Wednesday 6th August' },
    { date: '2025-08-08', day: 'Friday 8th August' },
    { date: '2025-08-11', day: 'Monday 11th August' }
  ];
  
  for (const testDate of testDates) {
    console.log(`📅 Testing ${testDate.day} (${testDate.date}):`);
    
    try {
      const response = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
        message: `Check availability for a Standard Appointment on ${testDate.date}`,
        sessionId: `test_${testDate.date.replace(/-/g, '_')}`,
        userConsent: true
      }, { timeout: 15000 });
      
      const functionCall = response.data.data.functionCalls?.find(call => call.name === 'check_availability');
      
      if (functionCall?.result) {
        const result = functionCall.result;
        const totalSlots = result.slots?.length || 0;
        const daySlots = result.specificTimeCheck?.totalSlotsOnDay || 0;
        
        console.log(`  📊 Results:`);
        console.log(`    - Total available slots: ${totalSlots}`);
        console.log(`    - Slots on this specific day: ${daySlots}`);
        
        if (totalSlots > 0) {
          console.log(`    - Available days with slots: ${result.availableTimePatterns?.totalDaysWithAvailability || 'N/A'}`);
          console.log(`    - Sample times: ${result.availableTimePatterns?.mostCommonTimes?.slice(0,3).join(', ') || 'N/A'}`);
        }
        
        if (result.slots && result.slots.length > 0) {
          const sampleSlot = result.slots[0];
          console.log(`    - Sample slot: ${new Date(sampleSlot.startTime).toDateString()} at ${new Date(sampleSlot.startTime).toLocaleTimeString()}`);
        }
      } else {
        console.log(`  ❌ No availability data returned`);
      }
      
    } catch (error) {
      console.log(`  💥 Error testing ${testDate.day}: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
  }
}

async function testBusinessHours() {
  console.log('🕐 Testing business hours check...\n');
  
  try {
    // Test if the system recognizes business hours
    const response = await axios.post(`${API_BASE}/webhook/${WEBHOOK_ID}`, {
      message: 'What are your opening hours?',
      sessionId: 'business_hours_test',
      userConsent: true
    }, { timeout: 15000 });
    
    console.log('📝 Business hours response:', response.data.data.message);
    
  } catch (error) {
    console.log('💥 Error checking business hours:', error.message);
  }
}

async function testConnectionAndCredentials() {
  console.log('🔗 Testing API connection status...\n');
  
  try {
    // Test the connection endpoint
    const response = await axios.post(`${API_BASE}/test-connection/${WEBHOOK_ID}`, {}, { timeout: 15000 });
    
    console.log('📊 Connection test result:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data.data?.success;
    
  } catch (error) {
    console.log('💥 Connection test error:', error.message);
    if (error.response) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function runDeepDive() {
  console.log('🧪 DEEP DIVE: Cliniko API Investigation');
  console.log('='.repeat(60));
  
  // First check connection
  const connectionWorking = await testConnectionAndCredentials();
  console.log(`\n🔍 API Connection: ${connectionWorking ? '✅ Working' : '❌ Failed'}\n`);
  
  // Test business hours understanding
  await testBusinessHours();
  
  // Test multiple dates to see patterns
  await testMultipleDates();
  
  console.log('='.repeat(60));
  console.log('🎯 ANALYSIS SUMMARY:');
  console.log('If ALL dates show 0 slots → API connection issue');
  console.log('If SOME dates have slots → Calendar is working, specific dates are blocked');
  console.log('If Thursday specifically has 0 slots → Your requirement is met (10am unavailable)');
  console.log('='.repeat(60));
}

if (require.main === module) {
  runDeepDive()
    .then(() => {
      console.log('\n🎯 Deep dive completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Deep dive failed:', error);
      process.exit(1);
    });
}

module.exports = { testMultipleDates }; 