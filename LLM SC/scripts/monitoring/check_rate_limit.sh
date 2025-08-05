#!/bin/bash
# Quick rate limit check
echo "🔍 Testing OpenAI rate limit status..."
response=$(curl -s -X POST http://localhost:3002/webhook/webhook_ac41d73ce1b3a173ea9bd3f407b653b8d07b3f6fcaf5b5a4a2b7dcf8ae39c2c7 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test",
    "sessionId": "rate-limit-check",
    "userConsent": true
  }' | jq -r ".data.metadata.intent // .data.metadata.context.error")

if [[ "$response" == *"429"* ]]; then
  echo "❌ Rate limit still active: $response"
  echo "⏰ Try again in 5-10 minutes"
elif [[ "$response" == "error" ]]; then
  echo "❌ Still rate limited (check full response for details)"
else
  echo "✅ Rate limit cleared! Intent: $response"
  echo "🎉 Your webhook is ready for AI conversations!"
fi
