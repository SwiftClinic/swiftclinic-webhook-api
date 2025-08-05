#!/bin/bash

# Physio Chat System - Development Setup Script
echo "🏥 Setting up Physio Chat System for Development"
echo "=================================================="

# Check prerequisites
echo "✅ Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
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

echo ""
echo "🎉 Development environment setup complete!"
echo "========================================"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Install dependencies:"
echo "   npm install && cd dashboard/backend && npm install && cd ../.."
echo ""
echo "2. Start the dashboard backend:"
echo "   npm run dev:dashboard-backend"
echo ""
echo "3. Test the health endpoint:"
echo "   curl http://localhost:3001/health"
echo ""
echo "Ready to build! 🚀"
