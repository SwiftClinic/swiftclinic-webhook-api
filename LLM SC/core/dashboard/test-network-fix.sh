#!/bin/bash

echo "🧪 Testing SwiftClinic Admin Dashboard Network Fix"
echo "================================================"

# Test 1: Health check
echo "Testing API health endpoint..."
health_response=$(curl -s -w "%{http_code}" https://admin.swiftclinic.ai/api/health -o /tmp/health_check.json)

if [ "$health_response" = "200" ]; then
    echo "✅ API Health Check: PASSED"
    cat /tmp/health_check.json | jq .
else
    echo "❌ API Health Check: FAILED (HTTP $health_response)"
fi

# Test 2: Frontend accessibility
echo ""
echo "Testing frontend accessibility..."
frontend_response=$(curl -s -w "%{http_code}" https://admin.swiftclinic.ai -o /dev/null)

if [ "$frontend_response" = "200" ]; then
    echo "✅ Frontend Access: PASSED"
else
    echo "❌ Frontend Access: FAILED (HTTP $frontend_response)"
fi

# Test 3: CORS headers
echo ""
echo "Testing CORS headers..."
cors_response=$(curl -s -H "Origin: https://admin.swiftclinic.ai" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: X-Requested-With" -X OPTIONS https://admin.swiftclinic.ai/api/health -v 2>&1 | grep -i "access-control")

if [ ! -z "$cors_response" ]; then
    echo "✅ CORS Headers: PRESENT"
    echo "$cors_response"
else
    echo "❌ CORS Headers: MISSING"
fi

echo ""
echo "🎯 If all tests pass, your admin dashboard should work properly!"
echo "   Visit: https://admin.swiftclinic.ai"
