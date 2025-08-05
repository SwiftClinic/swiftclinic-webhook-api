#!/bin/bash

# SwiftClinic Server Setup Script
# Run this on your fresh Ubuntu 22.04 server

set -e

echo "🚀 SwiftClinic Server Setup"
echo "=========================="

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
echo "🔧 Installing essential packages..."
sudo apt install -y nginx nodejs npm certbot python3-certbot-nginx ufw curl git

# Install Node.js 18 (LTS)
echo "📦 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installations
echo "✅ Verifying installations..."
node --version
npm --version
nginx -v

# Configure firewall
echo "🔒 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 3001
sudo ufw allow 3002
sudo ufw --force enable

# Create directories
echo "📁 Creating directories..."
sudo mkdir -p /var/www/swiftclinic/admin-dashboard
sudo mkdir -p /var/www/swiftclinic/main-site

# Set permissions
sudo chown -R $USER:www-data /var/www/swiftclinic
sudo chmod -R 755 /var/www/swiftclinic

# Start and enable nginx
echo "🌐 Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Upload your admin dashboard files"
echo "2. Configure DNS in Namecheap"
echo "3. Run the deployment script"
echo "" 