#!/bin/bash

# SwiftClinic Admin Dashboard Production Deployment Script
# This script deploys your admin dashboard to www.swiftclinic.ai/admin

set -e  # Exit on any error

echo "🚀 SwiftClinic Admin Dashboard Deployment"
echo "=========================================="

# Configuration
DOMAIN="www.swiftclinic.ai"
DEPLOY_PATH="/var/www/swiftclinic/admin-dashboard"
NGINX_CONFIG="/etc/nginx/sites-available/swiftclinic.ai"
BACKEND_SERVICE="swiftclinic-admin-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "Don't run this script as root. Run as your regular user."
   exit 1
fi

# Step 1: Build Frontend for Production
echo ""
echo "1. Building Frontend for Production..."
cd frontend
npm install
npm run build
print_step "Frontend built successfully"

# Step 2: Create deployment directory
echo ""
echo "2. Setting up deployment directory..."
sudo mkdir -p $DEPLOY_PATH
sudo cp -r dist/* $DEPLOY_PATH/
sudo chown -R www-data:www-data $DEPLOY_PATH
print_step "Frontend files deployed to $DEPLOY_PATH"

# Step 3: Install Backend Dependencies
echo ""
echo "3. Setting up Backend..."
cd ../backend
npm install
npm run build
print_step "Backend built successfully"

# Step 4: Create systemd service for backend
echo ""
echo "4. Creating systemd service..."
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
Environment=FIREBASE_SERVICE_ACCOUNT_PATH=$PWD/../firebase-service-account.json
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $BACKEND_SERVICE
print_step "Backend service created"

# Step 5: Setup Nginx configuration
echo ""
echo "5. Configuring Nginx..."
if [ -f "$NGINX_CONFIG" ]; then
    print_warning "Nginx config already exists. Backing up..."
    sudo cp $NGINX_CONFIG ${NGINX_CONFIG}.backup
fi

sudo cp ../nginx-swiftclinic.conf $NGINX_CONFIG
sudo ln -sf $NGINX_CONFIG /etc/nginx/sites-enabled/
sudo nginx -t
print_step "Nginx configuration updated"

# Step 6: SSL Certificate Setup
echo ""
echo "6. SSL Certificate Setup..."
if command -v certbot &> /dev/null; then
    print_warning "Setting up SSL with Let's Encrypt..."
    sudo certbot --nginx -d swiftclinic.ai -d www.swiftclinic.ai
    print_step "SSL certificate configured"
else
    print_warning "Certbot not found. Install it with: sudo apt install certbot python3-certbot-nginx"
    print_warning "Then run: sudo certbot --nginx -d swiftclinic.ai -d www.swiftclinic.ai"
fi

# Step 7: Start services
echo ""
echo "7. Starting services..."
sudo systemctl restart $BACKEND_SERVICE
sudo systemctl reload nginx
print_step "Services started"

# Step 8: Firewall configuration
echo ""
echo "8. Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 'Nginx Full'
    sudo ufw allow 3001
    sudo ufw allow 3002
    print_step "Firewall configured"
else
    print_warning "UFW not found. Make sure ports 80, 443, 3001, and 3002 are open"
fi

# Final status check
echo ""
echo "9. Final status check..."
sleep 2

# Check backend
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_step "Backend API is running"
else
    print_error "Backend API is not responding"
fi

# Check frontend
if [ -f "$DEPLOY_PATH/index.html" ]; then
    print_step "Frontend files are deployed"
else
    print_error "Frontend files not found"
fi

echo ""
echo "🎉 Deployment Complete!"
echo "=========================================="
echo ""
echo "Your admin dashboard should now be available at:"
echo "🔗 https://www.swiftclinic.ai/admin"
echo ""
echo "Login credentials:"
echo "📧 Email: admin@swiftclinic.ai (or any email)"
echo "🔑 Password: admin123"
echo ""
echo "Useful commands:"
echo "• Check backend status: sudo systemctl status $BACKEND_SERVICE"
echo "• View backend logs: sudo journalctl -u $BACKEND_SERVICE -f"
echo "• Restart backend: sudo systemctl restart $BACKEND_SERVICE"
echo "• Check nginx status: sudo systemctl status nginx"
echo "• Test nginx config: sudo nginx -t"
echo ""
echo "📚 For troubleshooting, see DEPLOYMENT.md"
echo "" 