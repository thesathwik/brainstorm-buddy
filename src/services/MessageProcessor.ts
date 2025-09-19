import { ChatMessage, ProcessedMessage, ConversationContext } from '../models';
import { Entity, SentimentScore, TopicCategory } from '../models/ProcessedMessage';
import { UrgencyLevel, MeetingType } from '../models/Enums';
import { GeminiApiClient } from '../api/GeminiApiClient';

export interface MessageProcessor {
  processMessage(message: ChatMessage): Promise<ProcessedMessage>;
  maintainConversationHistory(messages: ChatMessage[]): ConversationContext;
  detectConversationPauses(): boolean;
}

export class DefaultMessageProcessor implements MessageProcessor {
  private geminiClient: GeminiApiClient;
  private lastMessageTime: Date | null = null;
  private pauseThresholdMs: number = 10000; // 10 seconds

  constructor(geminiClient: GeminiApiClient) {
    this.geminiClient = geminiClient;
  }

  async processMessage(message: ChatMessage): Promise<ProcessedMessage> {
    try {
      // Extract entities using Gemini API
      const entities = await this.extractEntities(message.content);
      
      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(message.content);
      
      // Classify topics
      const topicClassification = await this.classifyTopics(message.content);
      
      // Determine urgency level
      const urgencyLevel = this.determineUrgencyLevel(message.content, sentiment);
      
      // Update last message time for pause detection
      this.lastMessageTime = message.timestamp;

      return {
        originalMessage: message,
        extractedEntities: entities,
        sentiment,
        topicClassification,
        urgencyLevel
      };
    } catch (error) {
      // Fallback to basic processing if Gemini API fails
      return this.createFallbackProcessedMessage(message);
    }
  }

  maintainConversationHistory(messages: ChatMessage[]): ConversationContext {
    // Create a basic conversation context
    // This will be enhanced in later tasks with more sophisticated context tracking
    const sessionId = this.generateSessionId();
    const participants = this.extractParticipants(messages);
    const currentTopic = this.inferCurrentTopic(messages);
    
    return {
      sessionId,
      participants,
      currentTopic,
      messageHistory: [], // Will be populated with processed messages
      interventionHistory: [],
      startTime: messages.length > 0 ? messages[0].timestamp : new Date(),
      meetingType: MeetingType.GENERAL_DISCUSSION // Default type
    };
  }

  detectConversationPauses(): boolean {
    if (!this.lastMessageTime) return false;
    
    const now = new Date();
    const timeSinceLastMessage = now.getTime() - this.lastMessageTime.getTime();
    
    return timeSinceLastMessage > this.pauseThresholdMs;
  }

  private async extractEntities(text: string): Promise<Entity[]> {
    const prompt = `Extract entities from the following text. Focus on:
    - Company names
    - Financial terms and metrics
    - Market sectors
    - People names
    - Investment terms
    
    Return a JSON array of entities with type, value, and confidence (0-1).
    Format: [{"type": "company", "value": "Apple Inc", "confidence": 0.9}]`;

    try {
      const response = await this.geminiClient.analyzeText(text, prompt);
      return this.parseEntitiesFromResponse(response.content, text);
    } catch (error) {
      return this.extractBasicEntities(text);
    }
  }

  private async analyzeSentiment(text: string): Promise<SentimentScore> {
    const prompt = `Analyze the sentiment of this text and return scores for positive, negative, and neutral sentiment (0-1 scale each).
    Also provide an overall sentiment score (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive).
    
    Return JSON format: {"positive": 0.2, "negative": 0.1, "neutral": 0.7, "overall": 0.1}`;

    try {
      const response = await this.geminiClient.analyzeText(text, prompt);
      return this.parseSentimentFromResponse(response.content);
    } catch (error) {
      return this.calculateBasicSentiment(text);
    }
  }

  private async classifyTopics(text: string): Promise<TopicCategory[]> {
    const prompt = `Classify the topic of this text into VC-relevant categories:
    - investment_analysis
    - market_research
    - company_evaluation
    - financial_discussion
    - strategy_planning
    - due_diligence
    - portfolio_management
    - off_topic
    
    Return JSON array: [{"category": "investment_analysis", "confidence": 0.8, "keywords": ["valuation", "metrics"]}]`;

    try {
      const response = await this.geminiClient.analyzeText(text, prompt);
      return this.parseTopicsFromResponse(response.content);
    } catch (error) {
      return this.classifyBasicTopics(text);
    }
  }

  private determineUrgencyLevel(text: string, sentiment: SentimentScore): UrgencyLevel {
    // Simple heuristic for urgency detection
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
    const highPriorityKeywords = ['important', 'priority', 'deadline', 'time-sensitive'];
    
    const lowerText = text.toLowerCase();
    
    if (urgentKeywords.some(keyword => lowerText.includes(keyword))) {
      return UrgencyLevel.HIGH;
    }
    
    if (highPriorityKeywords.some(keyword => lowerText.includes(keyword))) {
      return UrgencyLevel.MEDIUM;
    }
    
    // High negative sentiment might indicate urgency
    if (sentiment.negative > 0.7) {
      return UrgencyLevel.MEDIUM;
    }
    
    return UrgencyLevel.LOW;
  }

  private parseEntitiesFromResponse(response: string, originalText: string): Entity[] {
    try {
      const parsed = JSON.parse(response);
      return parsed.map((entity: any, index: number) => ({
        type: entity.type || 'unknown',
        value: entity.value || '',
        confidence: entity.confidence || 0.5,
        startIndex: originalText.indexOf(entity.value) || 0,
        endIndex: (originalText.indexOf(entity.value) + entity.value.length) || 0
      }));
    } catch (error) {
      return this.extractBasicEntities(originalText);
    }
  }

  private parseSentimentFromResponse(response: string): SentimentScore {
    try {
      const parsed = JSON.parse(response);
      return {
        positive: parsed.positive || 0,
        negative: parsed.negative || 0,
        neutral: parsed.neutral || 1,
        overall: parsed.overall || 0
      };
    } catch (error) {
      return { positive: 0, negative: 0, neutral: 1, overall: 0 };
    }
  }

  private parseTopicsFromResponse(response: string): TopicCategory[] {
    try {
      const parsed = JSON.parse(response);
      return parsed.map((topic: any) => ({
        category: topic.category || 'off_topic',
        confidence: topic.confidence || 0.5,
        keywords: topic.keywords || []
      }));
    } catch (error) {
      return this.classifyBasicTopics('');
    }
  }

  private extractBasicEntities(text: string): Entity[] {
    const entities: Entity[] = [];
    
    // Simple regex patterns for basic entity extraction
    const companyPattern = /\b[A-Z][a-zA-Z0-9\s&.,-]*(?:Inc|Corp|LLC|Ltd|Company|Co)\b/g;
    const financialPattern = /\$[\d,]+(?:\.\d{2})?[MBK]?|\d+(?:\.\d+)?%/g;
    
    let match;
    
    // Extract company names
    while ((match = companyPattern.exec(text)) !== null) {
      entities.push({
        type: 'company',
        value: match[0],
        confidence: 0.6,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    // Extract financial terms
    while ((match = financialPattern.exec(text)) !== null) {
      entities.push({
        type: 'financial',
        value: match[0],
        confidence: 0.7,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
    
    return entities;
  }

  private calculateBasicSentiment(text: string): SentimentScore {
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'strong', 'growth'];
    const negativeWords = ['bad', 'poor', 'negative', 'decline', 'loss', 'risk'];
    
    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    
    const total = positiveCount + negativeCount;
    if (total === 0) {
      return { positive: 0, negative: 0, neutral: 1, overall: 0 };
    }
    
    const positive = positiveCount / words.length;
    const negative = negativeCount / words.length;
    const neutral = 1 - positive - negative;
    const overall = (positiveCount - negativeCount) / words.length;
    
    return { positive, negative, neutral, overall };
  }

  private classifyBasicTopics(text: string): TopicCategory[] {
    const investmentKeywords = ['investment', 'valuation', 'funding', 'round', 'equity'];
    const marketKeywords = ['market', 'competition', 'industry', 'sector', 'trends'];
    
    const lowerText = text.toLowerCase();
    const topics: TopicCategory[] = [];
    
    if (investmentKeywords.some(keyword => lowerText.includes(keyword))) {
      topics.push({
        category: 'investment_analysis',
        confidence: 0.6,
        keywords: investmentKeywords.filter(keyword => lowerText.includes(keyword))
      });
    }
    
    if (marketKeywords.some(keyword => lowerText.includes(keyword))) {
      topics.push({
        category: 'market_research',
        confidence: 0.6,
        keywords: marketKeywords.filter(keyword => lowerText.includes(keyword))
      });
    }
    
    if (topics.length === 0) {
      topics.push({
        category: 'off_topic',
        confidence: 0.8,
        keywords: []
      });
    }
    
    return topics;
  }

  private createFallbackProcessedMessage(message: ChatMessage): ProcessedMessage {
    return {
      originalMessage: message,
      extractedEntities: this.extractBasicEntities(message.content),
      sentiment: this.calculateBasicSentiment(message.content),
      topicClassification: this.classifyBasicTopics(message.content),
      urgencyLevel: UrgencyLevel.LOW
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractParticipants(messages: ChatMessage[]): any[] {
    // Basic participant extraction - will be enhanced in later tasks
    const uniqueUserIds = [...new Set(messages.map(msg => msg.userId))];
    return uniqueUserIds.map(userId => ({
      id: userId,
      name: `User_${userId}`,
      role: 'guest', // Default role
      preferences: {},
      engagementLevel: 0.5
    }));
  }

  private inferCurrentTopic(messages: ChatMessage[]): string {
    if (messages.length === 0) return 'No topic identified';
    
    // Simple topic inference from recent messages
    const recentMessages = messages.slice(-5);
    const combinedText = recentMessages.map(msg => msg.content).join(' ');
    
    // Basic keyword-based topic inference
    if (combinedText.toLowerCase().includes('investment')) return 'Investment Discussion';
    if (combinedText.toLowerCase().includes('market')) return 'Market Analysis';
    if (combinedText.toLowerCase().includes('company')) return 'Company Evaluation';
    
    return 'General Discussion';
  }
}