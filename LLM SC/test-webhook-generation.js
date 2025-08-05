// Quick test to verify webhook URL generation
const { v4: uuidv4 } = require('uuid');

// Simulate the webhook URL generation logic
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://swiftclinic-webhook-api-production.up.railway.app';

function generateWebhookURL() {
  const webhookId = uuidv4();
  const webhookUrl = `${WEBHOOK_BASE_URL}/webhook/${webhookId}`;
  return { webhookId, webhookUrl };
}

console.log('🧪 Testing webhook URL generation...\n');

console.log('Environment Variables:');
console.log('WEBHOOK_BASE_URL:', process.env.WEBHOOK_BASE_URL || 'Not set (using default)');
console.log('Default URL:', 'https://swiftclinic-webhook-api-production.up.railway.app');
console.log('');

console.log('Generated webhook URLs:');
for (let i = 1; i <= 3; i++) {
  const { webhookId, webhookUrl } = generateWebhookURL();
  console.log(`${i}. Clinic ${i}:`);
  console.log(`   Webhook ID: ${webhookId}`);
  console.log(`   Webhook URL: ${webhookUrl}`);
  console.log('');
}

console.log('✅ All webhook URLs should point to your Railway API!');