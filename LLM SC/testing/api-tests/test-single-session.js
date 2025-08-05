#!/usr/bin/env node

/**
 * Test script to demonstrate consistent session conversation memory
 */
const http = require('http');

const webhookId = 'webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f';
const sessionId = 'consistent-session-demo'; // Same session ID for all messages
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

    const req = http.request(options, (res) => {
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

async function testSingleSessionConversation() {
  console.log('🧪 Testing Single Session Conversation Memory');
  console.log('='.repeat(50));
  console.log(`Session ID: ${sessionId}`);
  console.log('');

  const messages = [
    'Can I make a booking?',
    'What services do you offer?',
    'Standard Appointment please',
    'Yes, please book a standard appointment for me. Tomorrow at 12pm would be great',
    'My name is Test Test, 000222000'
  ];

  try {
    for (let i = 0; i < messages.length; i++) {
      console.log(`\n📤 Message ${i + 1}: "${messages[i]}"`);
      
      const response = await sendMessage(messages[i], sessionId);
      console.log(`📥 Response ${i + 1}:`, response.data.message.substring(0, 150) + '...');
      console.log(`📊 Intent: ${response.data.metadata.intent} (${response.data.metadata.confidence})`);
      
      // Wait between messages to simulate real conversation
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎉 Single Session Test Completed!');
    console.log('\nNote: All messages used the same session ID for conversation continuity.');
    console.log('The AI should remember context and avoid repeating service information.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testSingleSessionConversation().catch(console.error); 