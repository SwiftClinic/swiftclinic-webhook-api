#!/bin/bash

echo "🚀 Starting Admin Dashboard Backend..."

# Find the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && find ../../.. -maxdepth 1 -name ".env" | head -1 | xargs dirname)"

if [ -z "$PROJECT_ROOT" ]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi

ENV_FILE="$PROJECT_ROOT/.env"

echo "📁 Project root: $PROJECT_ROOT"
echo "🔧 Environment file: $ENV_FILE"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at: $ENV_FILE"
    echo "   Please create .env file in project root first"
    exit 1
fi

# Navigate to dashboard backend directory
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create data directory if it doesn't exist
DATA_DIR="$PROJECT_ROOT/data"
if [ ! -d "$DATA_DIR" ]; then
    echo "📁 Creating data directory..."
    mkdir -p "$DATA_DIR"
fi

# Set environment variables for dashboard
export NODE_ENV=development
export DASHBOARD_PORT=3001

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "🔨 Building TypeScript..."
    npm run build
fi

echo ""
echo "🎯 Admin Dashboard Backend Configuration:"
echo "   Environment: $NODE_ENV"
echo "   Port: $DASHBOARD_PORT"
echo "   Database: Multi-tenant with encryption"
echo "   Features: Instant clinic onboarding, tenant management"
echo ""

# Start the server
echo "🚀 Starting admin dashboard backend..."
npm run dev 