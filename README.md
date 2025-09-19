# Proactive Brainstorm Bot

A proactive AI bot for VC boardroom brainstorming sessions that intelligently monitors conversations and intervenes when it can add value.

## Project Structure

```
src/
├── models/           # Core data models and interfaces
│   ├── ChatMessage.ts
│   ├── ProcessedMessage.ts
│   ├── ConversationContext.ts
│   ├── InterventionDecision.ts
│   ├── UserPreferences.ts
│   ├── Enums.ts
│   └── index.ts
├── services/         # Business logic services
│   ├── MessageProcessor.ts
│   ├── ContextAnalyzer.ts
│   ├── InterventionDecisionEngine.ts
│   ├── ResponseGenerator.ts
│   ├── LearningModule.ts
│   └── index.ts
├── api/             # External API integrations
│   ├── GeminiApiClient.ts
│   ├── ChatInterface.ts
│   └── index.ts
├── config/          # Configuration and environment
│   ├── environment.ts
│   ├── logger.ts
│   └── index.ts
└── index.ts         # Main application entry point

tests/               # Test files
├── models/
├── config/
└── setup.ts
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Set your Gemini API key in `.env`:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

## Development

- **Build**: `npm run build`
- **Test**: `npm run test`
- **Test (run once)**: `npm run test:run`
- **Development**: `npm run dev`

## Core Interfaces

### ChatMessage
Basic chat message structure with metadata support.

### ProcessedMessage
Enhanced message with AI analysis including entities, sentiment, and topic classification.

### ConversationContext
Complete conversation state including participants, history, and intervention records.

### InterventionDecision
Decision engine output determining when and how the bot should respond.

## Environment Variables

- `GEMINI_API_KEY`: Required - Your Gemini API key
- `LOG_LEVEL`: Optional - Logging level (error, warn, info, debug)
- `PORT`: Optional - Application port (default: 3000)
- `NODE_ENV`: Optional - Environment (development, production, test)
- `MAX_MESSAGE_HISTORY`: Optional - Maximum messages to keep in memory (default: 100)
- `INTERVENTION_COOLDOWN_MS`: Optional - Minimum time between interventions (default: 5000ms)

## Implementation Status

This is the foundational setup. Core interfaces and project structure are complete. Individual components will be implemented in subsequent tasks according to the implementation plan.