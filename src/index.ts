import { validateEnvironment, logger } from './config';
import { InterventionType, MeetingType, BotStatus } from './models';
import { DefaultGeminiApiClient } from './api/GeminiApiClient';
import { DefaultContextAnalyzer } from './services/ContextAnalyzer';
import { CommunicationFilter } from './services/CommunicationFilter';
import { DefaultResponseGenerator } from './services/ResponseGenerator';
import { DefaultInterventionDecisionEngine } from './services/InterventionDecisionEngine';
import { DefaultMessageProcessor } from './services/MessageProcessor';

// Validate environment on startup (skip in test environment)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  try {
    validateEnvironment();
    logger.info('Environment validation passed');
  } catch (error) {
    logger.error('Environment validation failed:', error);
    process.exit(1);
  }
}

export interface BotConfiguration {
  geminiApiKey: string;
  chatPort?: number;
  logLevel?: string;
  enableLearning?: boolean;
  interventionThresholds?: {
    topicDrift: number;
    informationGap: number;
    factCheck: number;
  };
}

export interface BotMetrics {
  messagesProcessed: number;
  interventionsMade: number;
  interventionsByType: Record<InterventionType, number>;
  averageResponseTime: number;
  uptime: number;
  errorCount: number;
  learningEvents: number;
}

// Main application entry point
export class ProactiveBrainstormBot {
  private isRunning: boolean = false;
  private startTime: Date | null = null;
  private metrics: BotMetrics;
  private activeConversations: Map<string, any> = new Map();
  private components: Map<string, any> = new Map();
  
  // Enhanced components for professional communication and focus protection
  private geminiClient!: DefaultGeminiApiClient;
  private contextAnalyzer!: DefaultContextAnalyzer;
  private communicationFilter!: CommunicationFilter;
  private responseGenerator!: DefaultResponseGenerator;
  private interventionEngine!: DefaultInterventionDecisionEngine;
  private messageProcessor!: DefaultMessageProcessor;

  constructor(private config: BotConfiguration) {
    // Validate required configuration
    if (!config.geminiApiKey && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    logger.info('Initializing Proactive Brainstorm Bot...');
    
    // Initialize metrics
    this.metrics = {
      messagesProcessed: 0,
      interventionsMade: 0,
      interventionsByType: {
        [InterventionType.TOPIC_REDIRECT]: 0,
        [InterventionType.INFORMATION_PROVIDE]: 0,
        [InterventionType.FACT_CHECK]: 0,
        [InterventionType.CLARIFICATION_REQUEST]: 0,
        [InterventionType.SUMMARY_OFFER]: 0
      },
      averageResponseTime: 0,
      uptime: 0,
      errorCount: 0,
      learningEvents: 0
    };

    this.initializeComponents();
    logger.info('Proactive Brainstorm Bot initialized successfully');
  }

  private initializeComponents(): void {
    try {
      // Initialize Gemini API client
      this.geminiClient = new DefaultGeminiApiClient(this.config.geminiApiKey);
      
      // Initialize enhanced components with professional communication and focus protection
      this.contextAnalyzer = new DefaultContextAnalyzer(this.geminiClient);
      this.communicationFilter = new CommunicationFilter();
      this.responseGenerator = new DefaultResponseGenerator(this.geminiClient);
      this.interventionEngine = new DefaultInterventionDecisionEngine({
        topicDriftThreshold: this.config.interventionThresholds?.topicDrift || 0.6,
        informationGapThreshold: this.config.interventionThresholds?.informationGap || 0.7,
        engagementThreshold: 0.3,
        momentumThreshold: 0.2,
        confidenceThreshold: 0.5
      });
      this.messageProcessor = new DefaultMessageProcessor(this.geminiClient);
      
      // Store components in map for compatibility
      this.components.set('messageProcessor', this.messageProcessor);
      this.components.set('contextAnalyzer', this.contextAnalyzer);
      this.components.set('interventionEngine', this.interventionEngine);
      this.components.set('responseGenerator', this.responseGenerator);
      this.components.set('communicationFilter', this.communicationFilter);
      this.components.set('geminiClient', this.geminiClient);
      
      logger.info('All enhanced components initialized successfully');
      logger.info('Professional communication filters enabled');
      logger.info('Enhanced topic drift detection with 2-message threshold enabled');
    } catch (error) {
      logger.error('Failed to initialize components:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Placeholder for event handler setup
    // In a real implementation, this would set up message handling, connections, etc.
    logger.info('Event handlers configured');
  }

  private async handleMessage(message: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.metrics.messagesProcessed++;
      
      logger.info(`Processing message: ${message.content}`);
      
      // Get or create conversation context
      const context = this.activeConversations.get(message.sessionId) || 
                     this.createConversationContext(message.sessionId);
      
      // Process message with enhanced analysis
      const processedMessage = await this.messageProcessor.processMessage(message);
      context.messageHistory.push(processedMessage);
      
      // Analyze conversation flow with enhanced topic drift detection
      const flowAnalysis = await this.contextAnalyzer.analyzeConversationFlow(context.messageHistory);
      
      // Detect topic drift with 2-message threshold
      const driftResult = await this.contextAnalyzer.detectTopicDrift(context.messageHistory);
      
      // Make intervention decision with enhanced criteria
      const interventionDecision = await this.interventionEngine.shouldIntervene(
        context,
        flowAnalysis,
        context.participants[0]?.preferences || {}
      );
      
      // Generate response if intervention is needed
      if (interventionDecision.shouldRespond) {
        const response = await this.responseGenerator.generateResponse(
          interventionDecision.interventionType,
          context,
          { topicDrift: driftResult, flowAnalysis }
        );
        
        // Apply professional communication validation pipeline
        const validatedResponse = await this.validateAndEnhanceResponse(
          response,
          message.content,
          context
        );
        
        // Send validated response
        await this.sendResponse(validatedResponse, message.sessionId);
        
        // Update metrics
        this.metrics.interventionsMade++;
        this.metrics.interventionsByType[interventionDecision.interventionType]++;
        
        logger.info(`Intervention made: ${interventionDecision.interventionType}`);
        logger.info(`Response quality score: ${validatedResponse.qualityScore}`);
      }
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeMetrics(responseTime);

    } catch (error) {
      this.metrics.errorCount++;
      logger.error('Error handling message:', error);
    }
  }

  private createConversationContext(sessionId: string): any {
    const context = {
      sessionId,
      participants: [],
      currentTopic: '',
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(),
      meetingType: MeetingType.GENERAL_DISCUSSION
    };

    this.activeConversations.set(sessionId, context);
    return context;
  }

  private cleanupConversationContext(sessionId: string): void {
    this.activeConversations.delete(sessionId);
  }

  /**
   * Validates and enhances response using professional communication pipeline
   */
  private async validateAndEnhanceResponse(
    response: any,
    userInput: string,
    context: any
  ): Promise<any> {
    let enhancedContent = response.content;
    
    // Step 1: Remove robotic phrases
    enhancedContent = this.communicationFilter.removeRoboticPhrases(enhancedContent);
    
    // Step 2: Remove echoing patterns
    enhancedContent = this.communicationFilter.removeEchoingPatterns(enhancedContent, userInput);
    
    // Step 3: Enhance natural flow
    enhancedContent = this.communicationFilter.enhanceNaturalFlow(enhancedContent);
    
    // Step 4: Ensure professional tone
    enhancedContent = this.communicationFilter.ensureProfessionalTone(enhancedContent);
    
    // Step 5: Validate business language
    const validation = this.communicationFilter.validateBusinessLanguage(enhancedContent);
    
    // Step 6: Adapt to meeting context if available
    if (context.meetingType) {
      enhancedContent = this.communicationFilter.adaptToMeetingContext(
        enhancedContent,
        context.meetingType
      );
    }
    
    // Step 7: Adjust for participant roles if available
    if (context.participants && context.participants.length > 0) {
      enhancedContent = this.communicationFilter.adjustForParticipantRoles(
        enhancedContent,
        context.participants
      );
    }
    
    // Step 8: Evaluate overall communication quality
    const qualityAssessment = this.communicationFilter.evaluateCommunicationQuality(
      enhancedContent,
      userInput
    );
    
    // If quality is too low, regenerate response
    if (qualityAssessment.overallScore < 0.6) {
      logger.warn(`Low quality response detected (score: ${qualityAssessment.overallScore}), regenerating...`);
      
      // Regenerate with stricter guidelines
      const regeneratedResponse = await this.responseGenerator.generateResponse(
        response.type,
        context,
        { 
          strictProfessionalMode: true,
          previousAttempt: response.content,
          qualityIssues: validation.issues
        }
      );
      
      // Re-validate the regenerated response
      enhancedContent = this.communicationFilter.ensureProfessionalTone(regeneratedResponse.content);
      enhancedContent = this.communicationFilter.removeRoboticPhrases(enhancedContent);
    }
    
    return {
      ...response,
      content: enhancedContent,
      qualityScore: qualityAssessment.overallScore,
      validation: validation,
      qualityAssessment: qualityAssessment
    };
  }

  /**
   * Sends response to the chat interface
   */
  private async sendResponse(response: any, sessionId: string): Promise<void> {
    // In a real implementation, this would send to the actual chat interface
    logger.info(`Sending response to session ${sessionId}: ${response.content}`);
    logger.debug(`Response quality metrics:`, {
      qualityScore: response.qualityScore,
      professionalScore: response.validation.professionalScore,
      naturalness: response.qualityAssessment.naturalness,
      clarity: response.qualityAssessment.clarity
    });
  }

  private updateResponseTimeMetrics(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const totalMessages = this.metrics.messagesProcessed;
    this.metrics.averageResponseTime = ((currentAvg * (totalMessages - 1)) + responseTime) / totalMessages;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    try {
      logger.info('Starting Proactive Brainstorm Bot...');
      
      // Initialize all components
      this.setupEventHandlers();
      
      this.isRunning = true;
      this.startTime = new Date();
      
      logger.info('Proactive Brainstorm Bot started successfully');
      logger.info(`Bot configured for port ${this.config.chatPort || 8080}`);
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Bot is not running');
      return;
    }

    try {
      logger.info('Stopping Proactive Brainstorm Bot...');
      
      // Cleanup active conversations
      for (const [sessionId] of this.activeConversations) {
        this.cleanupConversationContext(sessionId);
      }

      this.isRunning = false;
      this.startTime = null;
      
      logger.info('Proactive Brainstorm Bot stopped successfully');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      activeConversations: this.activeConversations.size,
      metrics: {
        ...this.metrics,
        uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
      }
    };
  }

  getMetrics(): BotMetrics {
    return {
      ...this.metrics,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
    };
  }

  async updateConfiguration(newConfig: Partial<BotConfiguration>): Promise<void> {
    Object.assign(this.config, newConfig);
    logger.info('Configuration updated');
  }

  // Expose contextAnalyzer for intelligent topic drift detection
  getContextAnalyzer(): DefaultContextAnalyzer {
    return this.contextAnalyzer;
  }
}

// Export all models and services for external use
export * from './models';
export * from './api';
export * from './config';