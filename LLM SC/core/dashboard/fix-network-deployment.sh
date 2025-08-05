#!/bin/bash

# SwiftClinic Admin Dashboard Network Fix Deployment Script
# This script fixes the network errors on admin.swiftclinic.ai

set -e

echo "🔧 SwiftClinic Admin Dashboard Network Fix"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Build Frontend with Updated Configuration
echo ""
echo "1. Building Frontend with Network Fixes..."
cd frontend

# Create production environment file
cat > .env << EOF
# Frontend Environment Variables for Production Deployment
VITE_API_BASE_URL=https://admin.swiftclinic.ai/api
VITE_ADMIN_PASSWORD=admin123
VITE_APP_NAME=SwiftClinic Admin Dashboard
VITE_APP_VERSION=1.0.0
EOF

npm install
npm run build
print_step "Frontend built with correct API configuration"

# Step 2: Build Backend with Updated CORS
echo ""
echo "2. Building Backend with Network Fixes..."
cd ../backend
npm install
npm run build
print_step "Backend built with updated CORS configuration"

# Step 3: Deployment Instructions
echo ""
echo "3. Deployment Instructions..."
print_info "The following files have been updated with network fixes:"
echo "   • Frontend API configuration (uses https://admin.swiftclinic.ai/api)"
echo "   • Backend CORS configuration (allows admin.swiftclinic.ai)"
echo "   • New nginx configuration for admin subdomain"

echo ""
print_warning "Next Steps (Run on your server):"
echo ""
echo "# 1. Copy the new nginx configuration:"
echo "sudo cp nginx-admin-swiftclinic.conf /etc/nginx/sites-available/admin.swiftclinic.ai"
echo "sudo ln -sf /etc/nginx/sites-available/admin.swiftclinic.ai /etc/nginx/sites-enabled/"
echo ""
echo "# 2. Get SSL certificate for admin subdomain:"
echo "sudo certbot --nginx -d admin.swiftclinic.ai"
echo ""
echo "# 3. Deploy frontend files:"
echo "sudo mkdir -p /var/www/admin-dashboard"
echo "sudo cp -r frontend/dist/* /var/www/admin-dashboard/"
echo "sudo chown -R www-data:www-data /var/www/admin-dashboard"
echo ""
echo "# 4. Update backend service:"
echo "sudo systemctl stop swiftclinic-admin-backend"
echo "sudo cp -r backend/dist/* /path/to/backend/deployment/"
echo "sudo systemctl start swiftclinic-admin-backend"
echo ""
echo "# 5. Test nginx configuration and reload:"
echo "sudo nginx -t"
echo "sudo systemctl reload nginx"

echo ""
print_step "Network fixes ready for deployment!"

# Step 4: Create verification script
echo ""
echo "4. Creating verification script..."

cat > ../test-network-fix.sh << 'EOF'
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
EOF

chmod +x ../test-network-fix.sh
print_step "Verification script created: test-network-fix.sh"

echo ""
echo "🎉 Network Fix Deployment Package Ready!"
echo ""
print_info "Summary of Changes Made:"
echo "✅ Frontend now connects to https://admin.swiftclinic.ai/api"
echo "✅ Backend allows CORS from admin.swiftclinic.ai"
echo "✅ New nginx config for admin subdomain created"
echo "✅ Verification script created"
echo ""
print_warning "Deploy these changes to your server and run test-network-fix.sh to verify!"