console.log('=== ENVIRONMENT DEBUG ===');

// Test loading from current directory
console.log('1. Loading .env from current dir:');
const result1 = require('dotenv').config();
console.log('   Result:', result1);

// Test loading from parent directory
console.log('2. Loading .env from parent dir:');
const result2 = require('dotenv').config({ path: '../.env' });
console.log('   Result:', result2);

console.log('3. Final environment state:');
console.log('   OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
console.log('   API Key length:', process.env.OPENAI_API_KEY?.length || 0);
console.log('   API Key starts with:', process.env.OPENAI_API_KEY?.substring(0, 10));

// Test OpenAI call
const OpenAI = require('openai').default;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testCall() {
  try {
    console.log('4. Testing OpenAI call...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5
    });
    console.log('   ✅ SUCCESS:', completion.choices[0].message.content);
  } catch (error) {
    console.log('   ❌ FAILED:', error.message);
    console.log('   Error type:', error.constructor.name);
    console.log('   Status:', error.status);
  }
}

testCall(); 