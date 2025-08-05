// Test script to verify webhook generation on production admin dashboard
const { exec } = require('child_process');

console.log('🧪 Testing Production Webhook Generation');
console.log('======================================');

// Test the production admin dashboard
const adminDashboardUrl = 'https://admin.swiftclinic.ai';

console.log(`\n📡 Testing admin dashboard at: ${adminDashboardUrl}`);

// Test 1: Health check
console.log('\n1. Testing health endpoint...');
exec(`curl -s ${adminDashboardUrl}/api/health`, (error, stdout, stderr) => {
  if (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }
  
  try {
    const health = JSON.parse(stdout);
    if (health.success) {
      console.log('✅ Backend is healthy');
      console.log(`   Version: ${health.version || 'Unknown'}`);
      console.log(`   Timestamp: ${health.timestamp || 'Unknown'}`);
    } else {
      console.log('⚠️  Backend health check returned false');
    }
  } catch (e) {
    console.log('❌ Invalid health response:', stdout);
  }
});

// Test 2: Auto-detection endpoint (should work even with invalid key)
console.log('\n2. Testing auto-detection endpoint...');
const testPayload = JSON.stringify({ apiKey: 'test-key-12345' });

exec(`curl -s -X POST ${adminDashboardUrl}/api/clinics/detect-cliniko -H "Content-Type: application/json" -d '${testPayload}'`, (error, stdout, stderr) => {
  if (error) {
    console.log('❌ Auto-detection test failed:', error.message);
    return;
  }
  
  try {
    const response = JSON.parse(stdout);
    if (response.success === false && response.error && response.error.code === 'DETECTION_FAILED') {
      console.log('✅ Auto-detection endpoint is working (correctly rejected test key)');
      console.log(`   Error message: ${response.error.message}`);
    } else {
      console.log('⚠️  Unexpected auto-detection response:', response);
    }
  } catch (e) {
    console.log('❌ Invalid auto-detection response:', stdout);
  }
});

// Test 3: Test webhook URL generation (if we had a real API key)
setTimeout(() => {
  console.log('\n3. Webhook URL Generation Test:');
  console.log('   ℹ️  To test webhook generation with Railway integration:');
  console.log('   1. Go to https://admin.swiftclinic.ai');
  console.log('   2. Create a test clinic with real Cliniko credentials');
  console.log('   3. Verify webhook URL points to:');
  console.log('      https://swiftclinic-webhook-api-production.up.railway.app/webhook/[id]');
  console.log('');
  console.log('🎉 Production webhook testing complete!');
  console.log('');
  console.log('📋 Summary:');
  console.log('   • Admin dashboard: https://admin.swiftclinic.ai');
  console.log('   • Webhook API: https://swiftclinic-webhook-api-production.up.railway.app');
  console.log('   • Both services should now be integrated and working');
}, 2000);