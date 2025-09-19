#!/bin/bash

echo "🚀 Setting up Proactive Brainstorm Bot for Friends"
echo "================================================="

# Set the API key
export GEMINI_API_KEY="AIzaSyB-37jPZch7VTY9pQryNFS4DrTc7HFOXzc"

# Get local IP address
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

echo ""
echo "🌐 Your bot will be available at:"
echo "   Local:    http://localhost:3001"
echo "   Network:  http://$LOCAL_IP:3001"
echo ""
echo "📱 Share this with friends on the same WiFi:"
echo "   http://$LOCAL_IP:3001"
echo ""
echo "🌍 For remote friends, use ngrok:"
echo "   1. Install ngrok: brew install ngrok"
echo "   2. In another terminal: ngrok http 3001"
echo "   3. Share the ngrok URL with friends"
echo ""
echo "🎉 Starting the server..."
echo "   Press Ctrl+C to stop"
echo ""

# Start the server
npm run web