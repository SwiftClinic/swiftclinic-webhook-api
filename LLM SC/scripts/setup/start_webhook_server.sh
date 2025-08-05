#!/bin/bash

echo "🚀 Starting Webhook API Server..."

# Kill any existing processes
echo "🛑 Stopping any existing webhook-api processes..."
pkill -f "webhook-api" || true
pkill -f "tsx watch" || true

# Change to webhook-api directory
cd "LLM SC/core/webhook-api"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the project
echo "🔨 Building the project..."
npm run build

# Start the server
echo "✅ Starting server..."
npm start 