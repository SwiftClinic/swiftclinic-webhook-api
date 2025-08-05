#!/bin/bash

# Deploy Dashboard Updates to AWS
# Run this script from your local machine to update AWS

echo "🚀 Deploying Dashboard Updates to AWS"
echo "====================================="

# You'll need to replace these with your actual AWS server details
AWS_USER="ubuntu"  # or ec2-user, depending on your AMI
AWS_HOST="admin.swiftclinic.ai"  # or your server's IP address
AWS_PATH="/var/www/admin"  # path where your dashboard is deployed on AWS

echo "📋 What's being deployed:"
echo "  • Fixed environment variable loading"
echo "  • Railway webhook API integration"
echo "  • Updated CORS for admin.swiftclinic.ai"
echo "  • Webhook URL generation for clinic creation"
echo ""

# Step 1: Build the backend locally
echo "1. Building backend locally..."
cd backend
npm install
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please fix TypeScript errors first."
    exit 1
fi

echo "✅ Backend built successfully"

# Step 2: Create deployment package
echo ""
echo "2. Creating deployment package..."
cd ..
mkdir -p deploy-temp
cp -r backend/dist deploy-temp/
cp -r backend/node_modules deploy-temp/
cp backend/package.json deploy-temp/
cp .env.production deploy-temp/.env
cp firebase-service-account.json deploy-temp/

echo "✅ Deployment package created"

# Step 3: Upload to AWS (you'll need to set up SSH key authentication)
echo ""
echo "3. Uploading to AWS server..."
echo "📌 You'll need to:"
echo "   1. Set up SSH key authentication to your AWS server"
echo "   2. Update AWS_USER, AWS_HOST, and AWS_PATH variables above"
echo "   3. Run the following commands:"
echo ""
echo "# Upload files:"
echo "rsync -avz --delete deploy-temp/ \$AWS_USER@\$AWS_HOST:\$AWS_PATH/"
echo ""
echo "# SSH into server and restart service:"
echo "ssh \$AWS_USER@\$AWS_HOST"
echo "sudo systemctl restart swiftclinic-admin-backend"
echo "sudo systemctl status swiftclinic-admin-backend"
echo ""
echo "💡 Or run this script with 'auto' parameter to attempt automatic deployment"

# Cleanup
rm -rf deploy-temp

if [ "$1" == "auto" ]; then
    echo ""
    echo "🔄 Attempting automatic deployment..."
    echo "⚠️  This requires SSH key setup to $AWS_HOST"
    
    # Uncomment these lines once you've set up SSH keys:
    # rsync -avz --delete deploy-temp/ $AWS_USER@$AWS_HOST:$AWS_PATH/
    # ssh $AWS_USER@$AWS_HOST "sudo systemctl restart swiftclinic-admin-backend"
    
    echo "❌ Automatic deployment is commented out for safety"
    echo "   Please set up SSH keys and uncomment the rsync/ssh lines"
fi

echo ""
echo "📚 Need help with SSH setup? See: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AccessingInstancesLinux.html"