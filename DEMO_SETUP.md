# 🚀 Proactive Brainstorm Bot - Live Demo Setup

## Quick Start (Easiest Way)

1. **Run the demo script:**
   ```bash
   ./start-demo.sh
   ```

2. **Open your browser:**
   - Go to: `http://localhost:3000`
   - Share this URL with your friends!

3. **Start brainstorming!** 🧠

---

## Manual Setup (If you prefer step-by-step)

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
```bash
npm run build
```

### 3. Start the Web Server
```bash
npm run web
```

### 4. Open in Browser
Visit: `http://localhost:3000`

---

## 👥 Testing with Friends

### How to Join a Session
1. Each person opens `http://localhost:3000` in their browser
2. Enter your name and select your role:
   - **Partner** - Senior investment partner
   - **Principal** - Investment principal
   - **Analyst** - Investment analyst
   - **Entrepreneur** - Startup founder
   - **Guest** - External participant

3. Click "Join Session" to enter the brainstorming room

### 🤖 How to Interact with the AI Bot

The bot will automatically participate in your conversation and provide proactive assistance:

#### **Summon the Bot Directly:**
- Type `@bot` followed by your question
- Example: `@bot what's the average SaaS valuation multiple?`

#### **Trigger Automatic Responses:**
The bot will automatically respond when you discuss:
- **Investment topics**: valuation, market size, revenue, growth
- **Questions**: Any message ending with `?`
- **Fact-checking**: When numbers or claims are mentioned
- **Topic drift**: If conversation goes off-topic

#### **Control Bot Activity:**
Use the buttons at the bottom to adjust how active the bot is:
- **Normal Activity** - Standard proactive responses
- **Quiet Mode** - Only responds when summoned
- **Active Mode** - More frequent interventions

---

## 🎯 Demo Scenarios to Try

### Scenario 1: Investment Review
```
Partner: "Let's review the TechFlow AI Series A opportunity"
Analyst: "They're seeking $15M at a $60M pre-money valuation"
Bot: [Provides market data and valuation benchmarks]
```

### Scenario 2: Topic Drift Detection
```
Principal: "Their revenue growth is impressive at 300% YoY"
Partner: "Speaking of growth, did you see the game last night?"
Bot: [Redirects conversation back to investment discussion]
```

### Scenario 3: Information Requests
```
Entrepreneur: "What's the typical CAC for SaaS companies?"
Bot: [Provides relevant market data and benchmarks]
```

### Scenario 4: Fact Checking
```
Analyst: "I think the AI market is around $50B"
Bot: [Fact-checks and provides accurate market size data]
```

---

## 🔧 Troubleshooting

### Port Already in Use
If port 3000 is busy, the server will show an error. Try:
```bash
# Kill any process using port 3000
lsof -ti:3000 | xargs kill -9

# Or change the port in src/web-server.ts (line 15)
```

### Connection Issues
- Make sure the server is running (you should see "Web chat server running...")
- Check that your firewall isn't blocking port 3000
- Try refreshing the browser page

### Bot Not Responding
- The bot uses simulated responses for the demo
- Try using trigger words: valuation, market, revenue, @bot
- Check the browser console for any JavaScript errors

---

## 🌟 Features You'll See

### Real-time Chat
- Multi-user chat interface
- Live participant list
- Message timestamps
- User roles and avatars

### AI Bot Capabilities
- **Proactive interventions** based on conversation content
- **Topic drift detection** and redirection
- **Information provision** with market data
- **Fact-checking** of claims and numbers
- **Question answering** when summoned
- **Activity level control** (quiet/normal/active modes)

### Visual Indicators
- **Connection status** (green dot = connected)
- **Typing indicators** when bot is thinking
- **Intervention badges** showing why bot responded
- **Participant roles** displayed in chat

---

## 📱 Mobile Friendly

The interface works on mobile devices too! Your friends can join from their phones by visiting the same URL.

---

## 🎉 Have Fun!

This demo showcases the core functionality of the Proactive Brainstorm Bot. In a production environment, it would:

- Connect to real AI models (Google Gemini)
- Provide actual market data and research
- Learn from user feedback and preferences
- Integrate with calendar and meeting systems
- Support advanced features like document analysis

**Enjoy exploring the future of AI-assisted brainstorming!** 🚀

---

## 🛑 Stopping the Demo

Press `Ctrl+C` in the terminal to stop the server.