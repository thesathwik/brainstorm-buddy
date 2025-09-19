#!/bin/bash

echo "🚀 Launching Proactive Brainstorm Bot for Friends"
echo "==============================================="

# Set up ngrok authentication with correct token
echo "🔐 Setting up ngrok authentication..."
ngrok config add-authtoken 32o7YtjlzEo8XPssLu1l5Y9mett_2MoYfn1sfDiqVpQhBW6Ch

# Set the API key
export GEMINI_API_KEY="AIzaSyB-37jPZch7VTY9pQryNFS4DrTc7HFOXzc"

echo "📦 Building the project..."
npm run build

echo "🌐 Starting the bot server..."
# Start the bot server in the background
export GEMINI_API_KEY="AIzaSyB-37jPZch7VTY9pQryNFS4DrTc7HFOXzc"
npm run web &
SERVER_PID=$!

# Wait a moment for the server to start
echo "⏳ Waiting for server to start..."
sleep 3

echo "🌍 Creating public tunnel with ngrok..."
# Start ngrok and capture the URL
ngrok http 3000 --log=stdout > ngrok.log &
NGROK_PID=$!

# Wait for ngrok to start and get the URL
echo "⏳ Setting up public URL..."
sleep 5

# Extract the public URL from ngrok
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys, json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -z "$PUBLIC_URL" ]; then
    echo "⚠️  Could not get ngrok URL automatically. Check ngrok dashboard at http://localhost:4040"
    echo "📱 Your local server is running at: http://localhost:3001"
else
    echo ""
    echo "🎉 SUCCESS! Your bot is now live!"
    echo "================================"
    echo ""
    echo "📱 Share this URL with your friends:"
    echo "   $PUBLIC_URL"
    echo ""
    echo "📋 Send them this message:"
    echo "---"
    echo "🚀 Join our AI-powered brainstorming session!"
    echo "Click: $PUBLIC_URL"
    echo "Enter your name, select your role, and start brainstorming!"
    echo "💡 Try typing '@bot' to ask the AI assistant questions"
    echo "---"
    echo ""
fi

echo "🔍 Monitoring:"
echo "   • Bot server logs: This terminal"
echo "   • ngrok dashboard: http://localhost:4040"
echo "   • Local access: http://localhost:3000"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo "\n🛑 Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $NGROK_PID 2>/dev/null
    rm -f ngrok.log
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait