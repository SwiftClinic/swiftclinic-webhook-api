#!/usr/bin/env node

/**
 * Test script to verify conversation memory functionality
 */
const https = require('https');

const webhookId = 'webhook_ac41d73ce1b3a173ea9bd3f407b653b8d07b3f6fcaf5b5a4a2b7dcf8ae39c2c7';
const sessionId = 'memory-test-session-' + Date.now();
const baseUrl = 'http://localhost:3002';

async function sendMessage(message, sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      message,
      sessionId,
      userConsent: true
    });

    const options = {
      hostname: 'localhost',
      port: 3002,
      path: `/webhook/${webhookId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = require('http').request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testConversationMemory() {
  console.log('🧪 Testing Conversation Memory Functionality');
  console.log('=' * 50);
  console.log(`Session ID: ${sessionId}`);
  console.log('');

  try {
    // Test 1: Initial conversation with booking inquiry
    console.log('Test 1: Initial booking inquiry...');
    const response1 = await sendMessage('I would like to book an appointment', sessionId);
    console.log('✅ Response 1:', response1.data.message.substring(0, 100) + '...');
    console.log('📊 Intent:', response1.data.metadata.intent);
    console.log('');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Follow-up message that should remember context
    console.log('Test 2: Follow-up message (should remember previous context)...');
    const response2 = await sendMessage('What times are available tomorrow?', sessionId);
    console.log('✅ Response 2:', response2.data.message.substring(0, 100) + '...');
    console.log('📊 Intent:', response2.data.metadata.intent);
    console.log('');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Provide personal information
    console.log('Test 3: Providing personal information...');
    const response3 = await sendMessage('My name is John Doe and my phone is 555-0123', sessionId);
    console.log('✅ Response 3:', response3.data.message.substring(0, 100) + '...');
    console.log('📊 Intent:', response3.data.metadata.intent);
    console.log('');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Reference previous information (memory test)
    console.log('Test 4: Referencing previous information (memory test)...');
    const response4 = await sendMessage('Can you confirm my contact details?', sessionId);
    console.log('✅ Response 4:', response4.data.message.substring(0, 100) + '...');
    console.log('📊 Intent:', response4.data.metadata.intent);
    console.log('');

    // Test 5: New session (should not remember)
    console.log('Test 5: New session (should not remember previous conversation)...');
    const newSessionId = 'memory-test-new-' + Date.now();
    const response5 = await sendMessage('What are my contact details?', newSessionId);
    console.log('✅ Response 5:', response5.data.message.substring(0, 100) + '...');
    console.log('📊 Intent:', response5.data.metadata.intent);
    console.log('');

    console.log('🎉 Conversation Memory Test Completed Successfully!');
    console.log('');
    console.log('Key Observations:');
    console.log('- Responses 1-4 used the same session ID and should show conversation continuity');
    console.log('- Response 5 used a new session ID and should not reference previous information');
    console.log('- Check server logs for database persistence messages');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testConversationMemory().catch(console.error); 