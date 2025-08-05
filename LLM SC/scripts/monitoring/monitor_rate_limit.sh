#!/bin/bash
# Automated rate limit monitor
echo "🤖 Starting OpenAI rate limit monitor..."
echo "⏰ Checking every 2 minutes until rate limit clears"
echo "📱 Press Ctrl+C to stop monitoring"
echo "===========================================" 

count=1
while true; do
  echo "[$count] $(date +"%H:%M:%S") - Testing rate limit..."
  
  response=$(curl -s -X POST http://localhost:3002/webhook/webhook_ac41d73ce1b3a173ea9bd3f407b653b8d07b3f6fcaf5b5a4a2b7dcf8ae39c2c7 \
    -H "Content-Type: application/json" \
    -d '{
      "message": "Hello! Can you help me?",
      "sessionId": "monitor-",
      "userConsent": true
    }')
  
  intent=$(echo "$response" | jq -r ".data.metadata.intent // \"unknown\"")
  error=$(echo "$response" | jq -r ".data.metadata.context.error // \"none\"")
  
  if [[ "$error" == *"429"* ]]; then
    echo "    ❌ Still rate limited (429 error)"
  elif [[ "$intent" == "error" ]]; then
    echo "    ❌ Still failing (intent: error)"
  elif [[ "$intent" != "unknown" && "$intent" != "error" ]]; then
    echo ""
    echo "🎉 SUCCESS! Rate limit cleared!"
    echo "✅ Intent detected: $intent"
    echo "🚀 Your webhook is ready for AI conversations!"
    echo ""
    echo "Test your webhook now:"
    echo "curl -X POST http://localhost:3002/webhook/webhook_ac41d73ce1b3a173ea9bd3f407b653b8d07b3f6fcaf5b5a4a2b7dcf8ae39c2c7 \"
    echo "  -H \"Content-Type: application/json\" \"
    echo "  -d '{\"message\":\"I need to book an appointment\",\"sessionId\":\"success-test\",\"userConsent\":true}' | jq ."
    break
  else
    echo "    ⚠️  Unexpected response: $intent"
  fi
  
  echo "    ⏳ Waiting 2 minutes before next check..."
  sleep 120
  ((count++))
done
