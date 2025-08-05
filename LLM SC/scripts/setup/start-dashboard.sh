#!/bin/bash

echo "🚀 Starting SwiftClinic Admin Dashboard..."
echo ""

# Check if we're in the right directory
if [ ! -d "LLM SC/core/dashboard" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Start the dashboard backend
echo "🔧 Starting Dashboard Backend (port 3001)..."
cd "LLM SC/core/dashboard/backend"
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start the dashboard frontend
echo "🎨 Starting Dashboard Frontend (port 3000)..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Wait a moment
sleep 3

echo ""
echo "✅ SwiftClinic Admin Dashboard is starting up!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend:  http://localhost:3001"
echo "🔐 Login:    admin@swiftclinic.ai / admin123"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user to stop
wait 