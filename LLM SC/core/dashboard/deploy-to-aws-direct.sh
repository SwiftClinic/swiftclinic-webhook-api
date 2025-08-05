#!/bin/bash

# Direct AWS Deployment Script
# Replace KEY_PATH with your actual .pem file path

echo "🚀 Deploying Webhook Updates to AWS Instance"
echo "============================================="

# Configuration - UPDATE THESE PATHS
KEY_PATH="~/Downloads/your-key.pem"  # Update this path to your .pem file
AWS_IP="51.20.74.192"
AWS_USER="ubuntu"  # or "ec2-user" depending on your AMI

echo "📋 Instance Details:"
echo "   IP: $AWS_IP"
echo "   User: $AWS_USER"
echo "   Key: $KEY_PATH"
echo ""

# Step 1: Upload the deployment package
echo "1. Uploading webhook-updates.zip..."
scp -i "$KEY_PATH" webhook-updates.zip "$AWS_USER@$AWS_IP:~/"

if [ $? -ne 0 ]; then
    echo "❌ Upload failed! Check your key path and permissions."
    echo "💡 Make sure your .pem file has correct permissions:"
    echo "   chmod 400 $KEY_PATH"
    exit 1
fi

echo "✅ Upload successful!"

# Step 2: Deploy on server
echo ""
echo "2. Deploying on AWS server..."
ssh -i "$KEY_PATH" "$AWS_USER@$AWS_IP" << 'EOF'
    echo "📦 Extracting deployment package..."
    unzip -o webhook-updates.zip
    
    echo "🔄 Backing up current deployment..."
    sudo cp -r /var/www/admin /var/www/admin.backup.$(date +%Y%m%d_%H%M%S)
    
    echo "📁 Deploying new files..."
    sudo cp -r aws-deploy/* /var/www/admin/
    
    echo "🔄 Restarting service..."
    sudo systemctl restart swiftclinic-admin-backend
    
    echo "📊 Checking service status..."
    sudo systemctl status swiftclinic-admin-backend --no-pager
    
    echo "🧹 Cleaning up..."
    rm -f webhook-updates.zip
    rm -rf aws-deploy/
    
    echo "✅ Deployment complete!"
EOF

echo ""
echo "🎉 AWS deployment finished!"
echo "🔗 Test your updates at: https://admin.swiftclinic.ai"