#!/bin/bash

echo "🧠 Starting Webhook API (Brain)..."

# Find the project root (look for package.json)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR" && find . -maxdepth 3 -name "package.json" -path "*/package.json" | head -1 | xargs dirname)"

if [ -z "$PROJECT_ROOT" ]; then
    # Fallback: assume we're in LLM SC/scripts/setup and project root is ../..
    PROJECT_ROOT="$SCRIPT_DIR/../.."
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Check if .env exists and has OpenAI API key
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at: $ENV_FILE"
    echo "   Please run setup-dev.sh first or create .env file"
    exit 1
fi

if ! grep -q "OPENAI_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
    echo "❌ Please set your OpenAI API key in .env file first!"
    echo "   Edit $ENV_FILE and replace 'your-openai-api-key-here' with your actual key"
    exit 1
fi

# Change to webhook API directory and start
WEBHOOK_DIR="$PROJECT_ROOT/LLM SC/core/webhook-api"
cd "$WEBHOOK_DIR"

echo "✅ Starting webhook API from: $WEBHOOK_DIR"
echo "✅ Using environment from: $ENV_FILE"
npm run dev

