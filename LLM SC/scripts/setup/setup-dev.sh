#!/bin/bash

# Physio Chat System - Development Setup Script
# This script initializes the development environment

set -e  # Exit on any error

echo "🏥 Setting up Physio Chat System for Development"
echo "=================================================="

# Check prerequisites
echo "✅ Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

echo "✅ Node.js $(node --version) and npm $(npm --version) are available"

# Create .env file if it doesn't exist
echo "🔧 Setting up environment configuration..."

if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp configs/environment.template .env
    
    # Generate secure passwords
    MASTER_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    SESSION_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
    
    # Replace placeholders in .env file
    sed -i.bak "s/your-very-secure-master-password-here-at-least-32-chars/$MASTER_PASSWORD/g" .env
    sed -i.bak "s/your-session-secret-at-least-64-chars-random/$SESSION_SECRET/g" .env
    rm .env.bak 2>/dev/null || true
    
    echo "✅ Created .env file with secure generated passwords"
    echo "⚠️  IMPORTANT: Your .env file contains secure passwords. Keep it safe!"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."

# Install main project dependencies
echo "📦 Installing main project dependencies..."
npm install

# Install dashboard backend dependencies
echo "📦 Installing dashboard backend dependencies..."
cd dashboard/backend
npm install
cd ../..

echo "✅ All dependencies installed successfully"

# Create data and logs directories
echo "📁 Creating required directories..."
mkdir -p data logs
touch data/.gitkeep logs/.gitkeep
echo "✅ Created data and logs directories"

# Test compilation
echo "🔨 Testing TypeScript compilation..."
cd dashboard/backend
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi
cd ../..

# Display next steps
echo ""
echo "🎉 Development environment setup complete!"
echo "========================================"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Start the dashboard backend:"
echo "   npm run dev:dashboard-backend"
echo ""
echo "2. Test the health endpoint:"
echo "   curl http://localhost:3001/health"
echo ""
echo "3. View the comprehensive documentation:"
echo "   cat docs/README.md"
echo ""
echo "4. Create your first clinic via API:"
echo "   See docs/README.md for examples"
echo ""
echo "🔒 Security reminders:"
echo "• Your .env file contains sensitive passwords - never commit it to git"
echo "• Change default passwords before deploying to production"
echo "• Review the security checklist in docs/README.md"
echo ""
echo "📞 Need help? Check the documentation in docs/README.md"
echo ""

# Test basic functionality
echo "🧪 Running basic functionality test..."
echo "This will start the server briefly to test initialization..."

cd dashboard/backend
timeout 10s npm run dev 2>/dev/null || {
    if [ $? -eq 124 ]; then
        echo "✅ Server started successfully (test completed)"
    else
        echo "❌ Server failed to start - check the logs above"
        exit 1
    fi
}
cd ../..

echo "✅ Setup verification complete!"
echo ""
echo "Ready to build! 🚀" 