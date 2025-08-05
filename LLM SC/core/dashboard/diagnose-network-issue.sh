#!/bin/bash

# SwiftClinic Admin Dashboard Network Diagnostic Script
# Use this to diagnose current network issues before applying fixes

echo "🔍 SwiftClinic Admin Dashboard Network Diagnostics"
echo "=================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_test() {
    echo -e "${BLUE}🧪 Testing: $1${NC}"
}

print_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_fail() {
    echo -e "${RED}❌ $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

echo ""
print_test "Domain Resolution"
if nslookup admin.swiftclinic.ai > /dev/null 2>&1; then
    print_pass "admin.swiftclinic.ai resolves to IP"
    nslookup admin.swiftclinic.ai | grep "Address:" | tail -1
else
    print_fail "admin.swiftclinic.ai does not resolve"
fi

echo ""
print_test "HTTPS Connectivity"
if curl -s -f https://admin.swiftclinic.ai > /dev/null 2>&1; then
    print_pass "HTTPS connection successful"
else
    print_fail "HTTPS connection failed"
fi

echo ""
print_test "API Health Endpoint"
api_response=$(curl -s -w "%{http_code}" https://admin.swiftclinic.ai/api/health -o /tmp/api_health.json)
if [ "$api_response" = "200" ]; then
    print_pass "API health endpoint responding (HTTP 200)"
    if command -v jq &> /dev/null; then
        cat /tmp/api_health.json | jq .
    else
        cat /tmp/api_health.json
    fi
else
    print_fail "API health endpoint failed (HTTP $api_response)"
    if [ -f /tmp/api_health.json ]; then
        echo "Response content:"
        cat /tmp/api_health.json
    fi
fi

echo ""
print_test "Backend Service Status (if on server)"
if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet swiftclinic-admin-backend; then
        print_pass "Backend service is running"
        systemctl status swiftclinic-admin-backend --no-pager -l
    else
        print_fail "Backend service is not running"
        print_warn "Run: sudo systemctl status swiftclinic-admin-backend"
    fi
else
    print_warn "Not on server - cannot check service status"
fi

echo ""
print_test "Nginx Configuration (if on server)"
if command -v nginx &> /dev/null; then
    if nginx -t > /dev/null 2>&1; then
        print_pass "Nginx configuration is valid"
    else
        print_fail "Nginx configuration has errors"
        nginx -t
    fi
else
    print_warn "Not on server - cannot check nginx"
fi

echo ""
print_test "Port 3001 Accessibility (Backend)"
if command -v nc &> /dev/null; then
    if nc -z localhost 3001 2>/dev/null; then
        print_pass "Port 3001 is accessible"
    else
        print_fail "Port 3001 is not accessible"
        print_warn "Backend may not be running on port 3001"
    fi
else
    print_warn "netcat not available - cannot test port"
fi

echo ""
print_test "CORS Headers"
cors_test=$(curl -s -I -H "Origin: https://admin.swiftclinic.ai" https://admin.swiftclinic.ai/api/health | grep -i "access-control-allow-origin")
if [ ! -z "$cors_test" ]; then
    print_pass "CORS headers present"
    echo "$cors_test"
else
    print_fail "CORS headers missing"
    print_warn "This will cause frontend connection issues"
fi

echo ""
echo "🎯 DIAGNOSTIC SUMMARY"
echo "==================="
echo ""
echo "Common Issues and Solutions:"
echo ""
echo "1. If API health endpoint fails:"
echo "   - Check if backend service is running"
echo "   - Verify nginx proxy configuration"
echo "   - Check firewall settings"
echo ""
echo "2. If CORS headers are missing:"
echo "   - Update backend CORS configuration"
echo "   - Restart backend service"
echo ""
echo "3. If domain doesn't resolve:"
echo "   - Check DNS settings"
echo "   - Verify domain configuration"
echo ""
echo "4. If HTTPS fails:"
echo "   - Check SSL certificate"
echo "   - Verify nginx SSL configuration"
echo ""
echo "💡 Run the fix-network-deployment.sh script to apply automated fixes!"