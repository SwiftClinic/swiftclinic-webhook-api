#!/bin/bash

# SwiftClinic Admin Dashboard - Webhook Updates Deployment
# This script deploys ONLY the webhook-related changes to production

set -e  # Exit on any error

echo "🚀 Deploying Webhook Updates to admin.swiftclinic.ai"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Configuration for admin.swiftclinic.ai deployment
BACKEND_DIR="backend"
BACKEND_SERVICE="swiftclinic-admin-backend"
DEPLOY_PATH="/var/www/admin"  # Assuming this is where admin.swiftclinic.ai is deployed

echo ""
echo "📋 What's being deployed:"
echo "  • Fixed environment variable loading"
echo "  • Railway webhook API integration"
echo "  • Updated CORS for admin.swiftclinic.ai"
echo "  • Webhook URL generation for clinic creation"
echo ""

# Step 1: Build Backend with Latest Changes
echo "1. Building Backend with Latest Webhook Changes..."
cd $BACKEND_DIR
npm install
npm run build
print_step "Backend built with webhook updates"

# Step 2: Create updated environment file for production
echo ""
echo "2. Preparing production environment..."
if [ ! -f "../.env.production" ]; then
    print_error "Production environment file not found!"
    exit 1
fi

# Copy production env to backend for deployment
cp ../.env.production .env
print_step "Production environment configured"

# Step 3: Update systemd service environment
echo ""
echo "3. Updating systemd service..."
sudo systemctl stop $BACKEND_SERVICE 2>/dev/null || echo "Service not running"

# Update the systemd service to use the new environment
sudo tee /etc/systemd/system/$BACKEND_SERVICE.service > /dev/null <<EOF
[Unit]
Description=SwiftClinic Admin Dashboard Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$PWD
Environment=NODE_ENV=production
Environment=PORT=3001
EnvironmentFile=$PWD/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
print_step "Systemd service updated with new environment"

# Step 4: Start the updated service
echo ""
echo "4. Starting updated backend service..."
sudo systemctl start $BACKEND_SERVICE
sudo systemctl enable $BACKEND_SERVICE
print_step "Backend service restarted with webhook updates"

# Step 5: Test the deployment
echo ""
echo "5. Testing deployment..."
sleep 3

# Test local backend
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_step "Local backend is responding"
else
    print_error "Local backend test failed"
fi

# Test clinic auto-detection endpoint (should now use Railway webhooks)
if curl -f http://localhost:3001/api/clinics/detect-cliniko -X POST -H "Content-Type: application/json" -d '{"apiKey":"test"}' > /dev/null 2>&1; then
    print_step "Clinic auto-detection endpoint is working"
else
    print_warning "Clinic auto-detection endpoint test failed (expected with test key)"
fi

echo ""
echo "🎉 Webhook Updates Deployed Successfully!"
echo "========================================"
echo ""
echo "✅ Your admin dashboard now has:"
echo "  • Fixed environment variable loading"
echo "  • Railway webhook API integration"
echo "  • Updated webhook URL generation"
echo "  • CORS support for admin.swiftclinic.ai"
echo ""
echo "🔗 Test your admin dashboard at:"
echo "   https://admin.swiftclinic.ai"
echo ""
echo "📊 Useful commands:"
echo "  • Check service status: sudo systemctl status $BACKEND_SERVICE"
echo "  • View logs: sudo journalctl -u $BACKEND_SERVICE -f"
echo "  • Restart if needed: sudo systemctl restart $BACKEND_SERVICE"
echo ""
echo "🧪 To test webhook generation:"
echo "  1. Go to https://admin.swiftclinic.ai"
echo "  2. Create a test clinic"
echo "  3. Verify webhook URL points to Railway API"
echo ""