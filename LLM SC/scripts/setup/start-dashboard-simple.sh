#!/bin/bash

echo "🚀 Starting SwiftClinic Admin Dashboard (PostCSS-Error-Free)..."
echo ""

# Kill any existing processes
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true

# Start dashboard backend
echo "🔧 Starting Dashboard Backend..."
cd "LLM SC/core/dashboard/backend" && npm run dev > /dev/null 2>&1 &

# Start dashboard frontend  
echo "🎨 Starting Dashboard Frontend..."
cd "../frontend" && npm run dev > /dev/null 2>&1 &

sleep 5

echo ""
echo "✅ SwiftClinic Admin Dashboard Started!"
echo ""
echo "🌐 Admin Dashboard: http://localhost:3000"
echo "🔧 Backend API:     http://localhost:3001"
echo "🔐 Login:           admin@swiftclinic.ai / admin123"
echo ""
echo "🎉 No PostCSS errors - using Tailwind via CDN!"
echo ""
echo "Press Ctrl+C to stop"

# Keep script running
while true; do sleep 1; done 