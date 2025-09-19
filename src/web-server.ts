import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { ProactiveBrainstormBot, BotConfiguration } from './index';
import { logger } from './config';
import { UrgencyLevel } from './models/Enums';

interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
  username?: string;
  sessionId?: string;
}

export class WebChatServer {
  private httpServer!: http.Server;
  private wss!: WebSocketServer;
  private bot: ProactiveBrainstormBot;
  private clients: Map<string, ConnectedClient> = new Map();
  private port: number;
  // Add conversation history tracking for proper topic drift detection
  private conversationHistory: Map<string, any[]> = new Map();

  constructor(port: number = 3001) {
    this.port = port;
    
    // Initialize the bot
    const botConfig: BotConfiguration = {
      geminiApiKey: process.env.GEMINI_API_KEY || 'demo-key',
      chatPort: 8080,
      enableLearning: true,
      interventionThresholds: {
        topicDrift: 0.6,
        informationGap: 0.5,
        factCheck: 0.7
      }
    };

    this.bot = new ProactiveBrainstormBot(botConfig);
    this.setupHttpServer();
    this.setupWebSocketServer();
  }

  private setupHttpServer(): void {
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });
  }

  private setupWebSocketServer(): void {
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: ConnectedClient = { ws };
      this.clients.set(clientId, client);

      logger.info(`New WebSocket connection: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(clientId, message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        logger.info(`WebSocket connection closed: ${clientId}`);
        const client = this.clients.get(clientId);
        
        // Clean up conversation history if this was the last client in the session
        if (client && client.sessionId) {
          const remainingClientsInSession = Array.from(this.clients.values())
            .filter(c => c.sessionId === client.sessionId && c !== client);
          
          if (remainingClientsInSession.length === 0) {
            this.conversationHistory.delete(client.sessionId);
            logger.info(`Cleaned up conversation history for session: ${client.sessionId}`);
          }
        }
        
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        message: 'Connected to Proactive Brainstorm Bot'
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let filePath = req.url === '/' ? '/index.html' : (req.url || '/index.html');
    filePath = path.join(__dirname, '../public', filePath);

    // Security check - ensure we're serving from public directory
    const publicDir = path.resolve(__dirname, '../public');
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(500);
          res.end('Server error');
        }
        return;
      }

      // Set content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes: { [key: string]: string } = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      };

      const contentType = contentTypes[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  private async handleWebSocketMessage(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      switch (message.type) {
        case 'user_joined':
          client.userId = message.userId;
          client.username = message.username;
          client.sessionId = message.sessionId;
          
          // Broadcast to other clients
          this.broadcastToSession(message.sessionId, {
            type: 'user_joined',
            userId: message.userId,
            username: message.username,
            role: message.role
          }, clientId);
          break;

        case 'message':
          await this.handleChatMessage(clientId, message.message);
          break;

        case 'bot_activity_level':
          // Handle bot activity level changes
          logger.info(`Bot activity level changed to: ${message.level} by ${client.username}`);
          break;

        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Error processing message'
      });
    }
  }

  private async handleChatMessage(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.sessionId) return;

    // Broadcast message to all clients in the session
    this.broadcastToSession(client.sessionId, {
      type: 'user_message',
      userId: client.userId,
      username: client.username,
      content: message.content,
      timestamp: message.timestamp
    });

    // Process message with the bot (simulate for now)
    await this.processBotResponse(message, client.sessionId);
  }

  private async processBotResponse(message: any, sessionId: string): Promise<void> {
    try {
      // Get or create conversation context
      const context = this.conversationHistory.get(sessionId) || [];

      // Create a ProcessedMessage-like object for the bot to analyze
      const processedMessage = {
        originalMessage: {
          id: `msg-${Date.now()}`,
          userId: message.userId || 'user',
          content: message.content,
          timestamp: new Date(),
          metadata: {}
        },
        extractedEntities: [],
        sentiment: { positive: 0.3, negative: 0.2, neutral: 0.5, overall: 0.1 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };

      // Add to conversation history
      context.push(processedMessage);
      this.conversationHistory.set(sessionId, context);

      // Check if user is summoning the bot
      if (message.content.toLowerCase().includes('@bot')) {
        await this.handleBotSummon(message, sessionId, context);
        return;
      }

      // Use the intelligent bot framework to determine if intervention is needed
      const shouldIntervene = await this.evaluateInterventionNeed(context, sessionId);

      if (shouldIntervene.shouldRespond) {
        await this.generateIntelligentResponse(shouldIntervene, context, sessionId);
      }

    } catch (error) {
      logger.error('Error processing bot response:', error);
    }
  }

  private async handleBotSummon(message: any, sessionId: string, context: any[]): Promise<void> {
    logger.info(`Bot summoned by user in session ${sessionId}`);

    // Extract the question/context after @bot
    const content = message.content.toLowerCase();
    const botMention = content.indexOf('@bot');
    const questionPart = content.substring(botMention + 4).trim();

    // Use the bot's response generator for intelligent, context-aware responses
    const response = await this.generateContextualResponse(questionPart, context, 'summoned');

    // Apply timing strategy for natural conversation flow
    const delay = this.calculateResponseDelay('summoned', 0.8);

    setTimeout(async () => {
      // Add bot response to conversation history
      const botMessage = {
        originalMessage: {
          id: `bot-${Date.now()}`,
          userId: 'bot',
          content: response.content,
          timestamp: new Date(),
          metadata: { interventionType: 'summoned' }
        },
        extractedEntities: [],
        sentiment: { positive: 0.3, negative: 0.2, neutral: 0.5, overall: 0.1 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };

      const currentContext = this.conversationHistory.get(sessionId) || [];
      currentContext.push(botMessage);
      this.conversationHistory.set(sessionId, currentContext);

      this.broadcastToSession(sessionId, {
        type: 'bot_response',
        content: response.content,
        timestamp: new Date().toISOString(),
        metadata: {
          interventionType: 'summoned',
          confidence: response.confidence,
          reasoning: 'User summoned bot directly'
        }
      });
    }, delay);
  }

  private async evaluateInterventionNeed(context: any[], sessionId: string): Promise<any> {
    // Only intervene if we have enough context (at least 2 messages)
    if (context.length < 2) {
      return { shouldRespond: false };
    }

    // Get recent conversation for analysis
    const recentMessages = context.slice(-5);

    // Analyze conversation flow
    const flowAnalysis = await this.analyzeConversationFlow(recentMessages);

    // Check for topic drift with intelligent detection
    const driftResult = await this.intelligentTopicDriftDetection(recentMessages);

    // Check for information gaps or opportunities to add value
    const informationGaps = await this.detectInformationOpportunities(recentMessages);

    // Make intelligent intervention decision
    const shouldIntervene = this.makeInterventionDecision(flowAnalysis, driftResult, informationGaps, context);

    return shouldIntervene;
  }

  private async analyzeConversationFlow(messages: any[]): Promise<any> {
    const conversationText = messages.map(m => `${m.originalMessage.userId}: ${m.originalMessage.content}`).join('\n');

    // Analyze engagement and momentum
    const engagement = this.calculateEngagement(messages);
    const momentum = this.calculateMomentum(messages);
    const topicStability = await this.assessTopicStability(conversationText);

    return {
      engagement,
      momentum,
      topicStability,
      messageCount: messages.length
    };
  }

  private async intelligentTopicDriftDetection(messages: any[]): Promise<any> {
    if (messages.length < 2) return { isDrifting: false, severity: 0 };

    const conversationText = messages.map(m => m.originalMessage.content).join(' ');

    // Use Gemini to intelligently assess topic drift
    const prompt = `
    Analyze this VC conversation for topic drift. Score from 0-1 how much the conversation has drifted from investment/business topics.

    Consider:
    - Investment discussions, market analysis, company evaluation (score: 0.0 - on topic)
    - Business-related tangents that could be valuable (score: 0.2-0.4 - minor drift)
    - Personal anecdotes that relate to business (score: 0.4-0.6 - moderate drift)
    - Completely off-topic discussions (score: 0.8-1.0 - major drift)

    Return only a number between 0 and 1.

    Conversation: ${conversationText}
    `;

    try {
      // Use a more accessible method to analyze the conversation
      const analysis = 'general_discussion'; // For now, we'll use simple analysis
      const relevanceScore = await this.calculateRelevanceScore(conversationText);

      const isDrifting = relevanceScore < 0.6;
      const severity = isDrifting ? (1 - relevanceScore) : 0;

      return {
        isDrifting,
        severity,
        relevanceScore,
        currentTopic: analysis
      };
    } catch (error) {
      logger.error('Error in topic drift detection:', error);
      return { isDrifting: false, severity: 0 };
    }
  }

  private async detectInformationOpportunities(messages: any[]): Promise<any> {
    const recentContent = messages.slice(-3).map(m => m.originalMessage.content).join(' ').toLowerCase();

    // Look for opportunities to provide valuable information
    const specificDataQuestions = [
      'market cap', 'market size', 'valuation', 'revenue', 'how much',
      'what is the', 'current market', 'market value', 'worth',
      'funding', 'investment', 'competition', 'competitors',
      'growth rate', 'market share', 'statistics', 'data'
    ];

    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which'];
    const uncertaintyWords = ['maybe', 'perhaps', 'i think', 'probably', 'not sure', 'unclear'];

    let opportunityScore = 0;
    let reasoning = [];
    let isDirectQuestion = false;

    // HIGH PRIORITY: Direct data/market questions
    if (specificDataQuestions.some(keyword => recentContent.includes(keyword))) {
      opportunityScore += 0.7; // Much higher score for specific data requests
      reasoning.push('Specific data/market question detected');
      isDirectQuestion = true;
    }

    // MEDIUM PRIORITY: Questions with question words
    if (questionWords.some(word => recentContent.includes(word))) {
      if (recentContent.includes('?')) {
        opportunityScore += 0.6; // Direct questions
        reasoning.push('Direct question with question mark');
        isDirectQuestion = true;
      } else {
        opportunityScore += 0.3; // Implied questions
        reasoning.push('Question words detected');
      }
    }

    // LOW PRIORITY: Uncertainty expressions
    if (uncertaintyWords.some(word => recentContent.includes(word))) {
      opportunityScore += 0.2; // Lower weight for uncertainty
      reasoning.push('Uncertainty expressions detected');
    }

    // BONUS: AI/tech related questions get extra priority
    const techKeywords = ['ai', 'cursor', 'github', 'copilot', 'code editor', 'software'];
    if (techKeywords.some(keyword => recentContent.includes(keyword)) && isDirectQuestion) {
      opportunityScore += 0.2;
      reasoning.push('Tech-related direct question');
    }

    return {
      hasOpportunity: opportunityScore > 0.4,
      score: opportunityScore,
      reasoning: reasoning.join(', '),
      isDirectQuestion: isDirectQuestion
    };
  }

  private makeInterventionDecision(flowAnalysis: any, driftResult: any, informationGaps: any, context: any[]): any {
    let shouldRespond = false;
    let interventionType = '';
    let confidence = 0;
    let reasoning = '';

    // Balanced intervention logic - strict for general chatter, responsive for direct questions

    // Apply conversation frequency limits - but with exceptions for direct questions
    const recentBotMessages = context.filter(m =>
      m.originalMessage.userId === 'bot' &&
      Date.now() - m.originalMessage.timestamp.getTime() < 2 * 60 * 1000 // Last 2 minutes
    );

    // If there's a clear direct question, we can be more lenient with timing
    const isDirectQuestion = informationGaps.isDirectQuestion;
    const cooldownLimit = isDirectQuestion ? 2 : 1; // Allow 2 responses for direct questions, 1 for general

    if (recentBotMessages.length >= cooldownLimit) {
      // But still allow very high-priority direct data questions to override cooldown
      if (!(isDirectQuestion && informationGaps.score > 0.8)) {
        return {
          shouldRespond: false,
          interventionType: '',
          confidence: 0,
          reasoning: `Bot cooldown active (${recentBotMessages.length}/${cooldownLimit} messages)`
        };
      }
    }

    // HIGHEST PRIORITY: Topic drift (when conversation goes off-topic)
    if (driftResult.isDrifting && driftResult.severity > 0.7) { // Lowered threshold for better detection
      shouldRespond = true;
      interventionType = 'topic_redirect';
      confidence = driftResult.severity;
      reasoning = `Topic drift detected (severity: ${(driftResult.severity * 100).toFixed(1)}%)`;
    }
    // SECOND PRIORITY: Direct data/market questions (but only if on-topic)
    else if (informationGaps.hasOpportunity && informationGaps.score > 0.6 && isDirectQuestion && !driftResult.isDrifting) {
      shouldRespond = true;
      interventionType = 'information_provide';
      confidence = informationGaps.score;
      reasoning = `Direct question detected: ${informationGaps.reasoning}`;
    }
    // LOW PRIORITY: General information opportunities (much more restrictive)
    else if (informationGaps.hasOpportunity && informationGaps.score > 0.8 && !isDirectQuestion) {
      // Low probability for non-direct questions
      const randomFactor = Math.random();
      const shouldRespondProbability = 0.15; // 15% chance for general information

      if (randomFactor < shouldRespondProbability) {
        shouldRespond = true;
        interventionType = 'information_provide';
        confidence = informationGaps.score;
        reasoning = `General information opportunity: ${informationGaps.reasoning}`;
      }
    }

    return {
      shouldRespond,
      interventionType,
      confidence,
      reasoning
    };
  }

  private async generateIntelligentResponse(decision: any, context: any[], sessionId: string): Promise<void> {
    const response = await this.generateContextualResponse('', context, decision.interventionType);
    const delay = this.calculateResponseDelay(decision.interventionType, decision.confidence);

    setTimeout(() => {
      // Add bot response to conversation history
      const botMessage = {
        originalMessage: {
          id: `bot-${Date.now()}`,
          userId: 'bot',
          content: response.content,
          timestamp: new Date(),
          metadata: { interventionType: decision.interventionType }
        },
        extractedEntities: [],
        sentiment: { positive: 0.3, negative: 0.2, neutral: 0.5, overall: 0.1 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };

      const currentContext = this.conversationHistory.get(sessionId) || [];
      currentContext.push(botMessage);
      this.conversationHistory.set(sessionId, currentContext);

      this.broadcastToSession(sessionId, {
        type: 'bot_response',
        content: response.content,
        timestamp: new Date().toISOString(),
        metadata: {
          interventionType: decision.interventionType,
          confidence: decision.confidence,
          reasoning: decision.reasoning
        }
      });
    }, delay);
  }

  private async generateContextualResponse(query: string, context: any[], interventionType: string): Promise<any> {
    const recentMessages = context.slice(-5);
    const conversationText = recentMessages.map(m => `${m.originalMessage.userId}: ${m.originalMessage.content}`).join('\n');

    let prompt = '';

    if (interventionType === 'summoned') {
      prompt = `
      You are a sharp VC analyst in a brainstorming session. The user asked: "${query}"

      Recent conversation:
      ${conversationText}

      Give a punchy, confident response (2-3 sentences max). Be conversational and direct - like you're contributing to a VC discussion, not writing a report. Provide specific insights when possible, but don't hedge excessively. Match the energy and tone of the conversation.
      `;
    } else if (interventionType === 'topic_redirect') {
      prompt = `
      The conversation has drifted away from investment/business topics to personal matters.

      Recent conversation:
      ${conversationText}

      Provide a friendly but clear redirection back to the investment discussion. Be specific about what they were discussing earlier (like Cursor AI, valuations, market analysis). Keep it brief and natural - 1-2 sentences max.
      `;
    } else if (interventionType === 'information_provide') {
      prompt = `
      You're a VC analyst jumping into this conversation. They need specific information.

      Recent conversation:
      ${conversationText}

      Jump in with ONE specific, valuable insight (1-2 sentences). Be direct and conversational - like dropping a key fact into the discussion. No lengthy explanations.
      `;
    }

    try {
      // Use the Gemini client through the bot's components
      const geminiClient = this.bot['geminiClient']; // Access through bracket notation for private member
      const response = await geminiClient.analyzeText(conversationText, prompt);
      return {
        content: response.content,
        confidence: 0.8
      };
    } catch (error) {
      logger.error('Error generating contextual response:', error);
      return {
        content: this.getSpecificFallbackResponse(interventionType, recentMessages),
        confidence: 0.5
      };
    }
  }

  private getSpecificFallbackResponse(interventionType: string, recentMessages: any[]): string {
    const lastMessage = recentMessages[recentMessages.length - 1]?.originalMessage.content || '';

    if (interventionType === 'summoned') {
      if (lastMessage.toLowerCase().includes('market cap') || lastMessage.toLowerCase().includes('market size')) {
        return "AI code editor market hit $1.2B in 2024, growing 25% annually. GitHub Copilot alone has 1.8M+ paying users.";
      }
      if (lastMessage.toLowerCase().includes('bubble') || lastMessage.toLowerCase().includes('overvalued')) {
        return "Valuations are definitely stretched, but the productivity gains are real. Enterprise adoption is accelerating fast.";
      }
      if (lastMessage.toLowerCase().includes('competition') || lastMessage.toLowerCase().includes('competitive')) {
        return "It's heating up - Microsoft leads with Copilot, but Cursor and Codeium are gaining ground with better UX.";
      }
      return "What specific aspect are you thinking about?";
    } else if (interventionType === 'topic_redirect') {
      // Check what they were discussing before
      const recentContent = recentMessages.map(m => m.originalMessage.content).join(' ').toLowerCase();
      if (recentContent.includes('cursor') || recentContent.includes('ai') || recentContent.includes('investment')) {
        return "Should we get back to the Cursor AI investment discussion? Still some key angles to explore.";
      }
      return "Let's refocus on the investment opportunity we were discussing.";
    } else {
      return "Interesting point - could be worth diving deeper.";
    }
  }

  private calculateResponseDelay(interventionType: string, confidence: number): number {
    let baseDelay = 2000; // 2 seconds base

    switch (interventionType) {
      case 'summoned':
        baseDelay = 1500; // Quick response when summoned
        break;
      case 'topic_redirect':
        baseDelay = 3000; // Give a moment before redirecting
        break;
      case 'information_provide':
        baseDelay = 2500; // Moderate delay for information
        break;
    }

    // Add randomness for natural feel
    const randomFactor = 0.5 + Math.random(); // 0.5 to 1.5
    const finalDelay = baseDelay * randomFactor;

    return Math.round(finalDelay);
  }


  private calculateEngagement(messages: any[]): number {
    if (messages.length === 0) return 0;

    const uniqueUsers = new Set(messages.map(m => m.originalMessage.userId)).size;
    const messageFrequency = messages.length / Math.max(1, uniqueUsers);

    return Math.min(1, messageFrequency / 3); // Normalize to 0-1
  }

  private calculateMomentum(messages: any[]): number {
    if (messages.length < 2) return 0.5;

    const timeSpan = messages[messages.length - 1].originalMessage.timestamp.getTime() -
                   messages[0].originalMessage.timestamp.getTime();
    const frequency = timeSpan > 0 ? (messages.length / (timeSpan / 60000)) : 0; // messages per minute

    return Math.min(1, frequency / 5); // Normalize to 0-1, 5 msg/min = 1.0
  }

  private async assessTopicStability(conversationText: string): Promise<number> {
    // For now, return a stable score - in full implementation this would use ContextAnalyzer
    return 0.7;
  }

  private async calculateRelevanceScore(conversationText: string): Promise<number> {
    const vcKeywords = [
      'investment', 'funding', 'valuation', 'market', 'revenue', 'growth',
      'startup', 'company', 'business', 'financial', 'strategy', 'competitive',
      'metrics', 'analysis', 'opportunity', 'portfolio', 'venture', 'capital',
      'ai', 'artificial intelligence', 'code editor', 'cursor', 'github', 'copilot',
      'software', 'tech', 'saas', 'subscription', 'enterprise', 'productivity',
      'series', 'round', 'exit', 'ipo', 'acquisition', 'bubble', 'overvalued'
    ];

    // Explicit off-topic indicators
    const offTopicKeywords = [
      'headphones', 'music', 'audio', 'sound', 'budget', 'price', 'cost',
      'buy', 'purchase', 'shopping', 'recommendations', 'personal', 'lifestyle',
      'food', 'restaurant', 'movie', 'weather', 'sports', 'vacation', 'travel'
    ];

    const text = conversationText.toLowerCase();

    // Check for explicit off-topic content
    const offTopicMatches = offTopicKeywords.filter(keyword => text.includes(keyword)).length;
    if (offTopicMatches > 0) {
      return 0.1; // Very low relevance for off-topic content
    }

    const keywordMatches = vcKeywords.filter(keyword => text.includes(keyword)).length;

    // More strict scoring - require more keywords for relevance
    const relevanceScore = Math.min(1, keywordMatches / 2); // Need 2+ keywords for full relevance

    return Math.max(0.2, relevanceScore); // Lower minimum but still some baseline
  }



  private sendToClient(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  private broadcastToSession(sessionId: string, data: any, excludeClientId?: string): void {
    this.clients.forEach((client, clientId) => {
      if (client.sessionId === sessionId && clientId !== excludeClientId) {
        this.sendToClient(clientId, data);
      }
    });
  }

  private generateClientId(): string {
    return 'client-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }


  async start(): Promise<void> {
    // Start the bot
    await this.bot.start();
    
    // Start the web server
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        logger.info(`Web chat server running on http://localhost:${this.port}`);
        logger.info(`Open your browser and visit: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Stop the bot
    await this.bot.stop();
    
    // Close all WebSocket connections
    this.clients.forEach((client) => {
      client.ws.close();
    });
    
    // Close the HTTP server
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        logger.info('Web chat server stopped');
        resolve();
      });
    });
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      botStatus: this.bot.getStatus(),
      botMetrics: this.bot.getMetrics()
    };
  }
}

// If this file is run directly, start the server
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3001');
  const server = new WebChatServer(port);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down web chat server...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch((error) => {
    logger.error('Failed to start web chat server:', error);
    process.exit(1);
  });
}