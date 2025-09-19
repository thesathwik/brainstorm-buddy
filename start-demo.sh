#!/bin/bash

echo "🚀 Starting Proactive Brainstorm Bot Demo"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔧 Building the project..."
npm run build

echo "🌐 Starting the web chat server..."
echo ""
echo "🎉 Demo is ready!"
echo ""
echo "📱 Open your browser and go to: http://localhost:3000"
echo "👥 Share this URL with your friends to join the session"
echo ""
echo "💡 Tips for testing:"
echo "   • Try mentioning '@bot' to summon the AI assistant"
echo "   • Discuss investment topics like 'valuation', 'market size', 'revenue'"
echo "   • Ask questions with '?' to trigger responses"
echo "   • Try going off-topic to see topic drift detection"
echo ""
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Set a demo API key if none is provided
export GEMINI_API_KEY=${GEMINI_API_KEY:-"demo-key-for-testing"}

# Start the web server
npm run start:web