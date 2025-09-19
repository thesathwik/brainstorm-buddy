#!/bin/bash

echo "🚀 Starting Proactive Brainstorm Bot for Friends"
echo "==============================================="

# Set the API key
export GEMINI_API_KEY="AIzaSyB-37jPZch7VTY9pQryNFS4DrTc7HFOXzc"

echo "📦 Building the project..."
npm run build

echo "🌐 Starting the bot server..."

# Start the bot server in the background
npm run web &
BOT_PID=$!

# Wait a moment for the server to start
sleep 3

echo "🔗 Creating public tunnel with ngrok..."

# Start ngrok and capture the URL
ngrok http 3001 --log=stdout > ngrok.log &
NGROK_PID=$!

# Wait for ngrok to start
sleep 3

# Extract the public URL
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io')

echo ""
echo "🎉 SUCCESS! Your bot is now live!"
echo "================================="
echo ""
echo "📱 Share this URL with your friends:"
echo "   $PUBLIC_URL"
echo ""
echo "💬 Instructions for your friends:"
echo "   1. Click the link above"
echo "   2. Enter their name and role"
echo "   3. Click 'Join Session'"
echo "   4. Start brainstorming!"
echo ""
echo "🤖 Bot Features:"
echo "   • Type '@bot' to ask questions"
echo "   • Discuss investments, valuations, market size"
echo "   • Bot will provide proactive insights"
echo "   • Try going off-topic to see drift detection"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BOT_PID 2>/dev/null
    kill $NGROK_PID 2>/dev/null
    rm -f ngrok.log
    echo "✅ Stopped successfully"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Keep the script running
echo "🔄 Bot is running... (Press Ctrl+C to stop)"
wait