import { ProcessedMessage, ConversationContext, TopicCategory } from '../models';
import { UrgencyLevel } from '../models/Enums';
import { GeminiApiClient } from '../api/GeminiApiClient';

export interface FlowAnalysis {
  currentTopic: string;
  topicStability: number;
  participantEngagement: EngagementMetrics;
  conversationMomentum: MomentumIndicator;
  messagesOffTopic: number;
  interventionRecommended: boolean;
}

export interface EngagementMetrics {
  averageResponseTime: number;
  messageFrequency: number;
  participationBalance: number;
}

export interface MomentumIndicator {
  direction: 'increasing' | 'decreasing' | 'stable';
  strength: number;
}

export interface TopicDriftResult {
  isDrifting: boolean;
  originalTopic: string;
  currentDirection: string;
  driftSeverity: number;
  messagesOffTopic: number;
  suggestedRedirection?: string;
  urgencyLevel: UrgencyLevel;
  shouldInterventImmediately: boolean;
}

export interface RedirectionStrategy {
  approach: RedirectionApproach;
  message: string;
  contextSummary: string;
  diplomaticLevel: number; // 0-1 score for how gentle to be
}

export enum RedirectionApproach {
  GENTLE_REMINDER = 'gentle_reminder',
  CONTEXT_SUMMARY = 'context_summary',
  DIRECT_REDIRECT = 'direct_redirect',
  AGENDA_REFERENCE = 'agenda_reference'
}

export interface InformationGap {
  type: string;
  description: string;
  priority: number;
}

export interface ConversationHealth {
  overall: number;
  engagement: number;
  productivity: number;
  focus: number;
}

export interface ContextAnalyzer {
  analyzeConversationFlow(history: ProcessedMessage[]): Promise<FlowAnalysis>;
  detectTopicDrift(messages: ProcessedMessage[]): Promise<TopicDriftResult>;
  identifyInformationGaps(context: ConversationContext): Promise<InformationGap[]>;
  assessConversationHealth(context: ConversationContext): Promise<ConversationHealth>;
  calculateDriftUrgency(driftResult: TopicDriftResult): UrgencyLevel;
  generateRedirectionStrategy(originalTopic: string, currentTopic: string): Promise<RedirectionStrategy>;
}

export class DefaultContextAnalyzer implements ContextAnalyzer {
  private geminiClient: GeminiApiClient;
  private readonly topicStabilityThreshold = 0.7;
  private readonly driftDetectionWindow = 2; // Reduced from 5 to 2 for enhanced sensitivity
  private readonly investmentRelevanceThreshold = 0.6; // Threshold for intervention
  private readonly vcTopics = [
    'investment_evaluation',
    'market_analysis',
    'financial_metrics',
    'competitive_landscape',
    'team_assessment',
    'product_strategy',
    'growth_potential',
    'risk_assessment',
    'valuation',
    'due_diligence',
    'portfolio_management',
    'exit_strategy',
    'general_discussion',
    'off_topic'
  ];

  constructor(geminiClient: GeminiApiClient) {
    this.geminiClient = geminiClient;
  }

  async analyzeConversationFlow(history: ProcessedMessage[]): Promise<FlowAnalysis> {
    if (history.length === 0) {
      return this.getEmptyFlowAnalysis();
    }

    // Get recent messages for analysis
    const recentMessages = history.slice(-10);
    const conversationText = this.extractConversationText(recentMessages);

    // Analyze current topic using Gemini
    const currentTopic = await this.classifyCurrentTopic(conversationText);
    
    // Calculate topic stability
    const topicStability = await this.calculateTopicStability(history);
    
    // Analyze participant engagement
    const participantEngagement = this.analyzeParticipantEngagement(recentMessages);
    
    // Calculate conversation momentum
    const conversationMomentum = this.calculateConversationMomentum(recentMessages);

    // Count consecutive off-topic messages
    const messagesOffTopic = await this.countConsecutiveOffTopicMessages(recentMessages);
    
    // Determine if intervention is recommended
    const interventionRecommended = messagesOffTopic >= this.driftDetectionWindow;

    return {
      currentTopic,
      topicStability,
      participantEngagement,
      conversationMomentum,
      messagesOffTopic,
      interventionRecommended
    };
  }

  async detectTopicDrift(messages: ProcessedMessage[]): Promise<TopicDriftResult> {
    if (messages.length < this.driftDetectionWindow) {
      return {
        isDrifting: false,
        originalTopic: 'insufficient_data',
        currentDirection: 'unknown',
        driftSeverity: 0,
        messagesOffTopic: 0,
        urgencyLevel: UrgencyLevel.LOW,
        shouldInterventImmediately: false
      };
    }

    // Get the original topic from earlier messages (first half of conversation)
    const midPoint = Math.floor(messages.length / 2);
    const earlierMessages = messages.slice(0, Math.max(3, midPoint));
    const recentMessages = messages.slice(-this.driftDetectionWindow);

    const originalTopic = await this.classifyCurrentTopic(this.extractConversationText(earlierMessages));
    const currentDirection = await this.classifyCurrentTopic(this.extractConversationText(recentMessages));

    // Count consecutive off-topic messages
    const messagesOffTopic = await this.countConsecutiveOffTopicMessages(messages);
    
    // Calculate investment relevance score for recent messages
    const relevanceScore = await this.calculateInvestmentRelevanceScore(recentMessages);
    
    // Determine if drifting based on enhanced criteria
    const isDrifting = messagesOffTopic >= this.driftDetectionWindow && 
                      relevanceScore < this.investmentRelevanceThreshold;

    // Use Gemini to analyze topic drift with enhanced context
    const driftAnalysis = await this.analyzeDriftWithGemini(
      this.extractConversationText(earlierMessages),
      this.extractConversationText(recentMessages),
      originalTopic
    );

    // Calculate urgency level
    const urgencyLevel = this.calculateDriftUrgency({
      isDrifting,
      originalTopic,
      currentDirection,
      driftSeverity: driftAnalysis.severity,
      messagesOffTopic,
      urgencyLevel: UrgencyLevel.LOW,
      shouldInterventImmediately: false
    });

    // Determine if immediate intervention is needed
    const shouldInterventImmediately = isDrifting && 
                                     (urgencyLevel === UrgencyLevel.HIGH || 
                                      messagesOffTopic >= this.driftDetectionWindow + 1);

    return {
      isDrifting,
      originalTopic,
      currentDirection,
      driftSeverity: driftAnalysis.severity,
      messagesOffTopic,
      suggestedRedirection: driftAnalysis.suggestedRedirection,
      urgencyLevel,
      shouldInterventImmediately
    };
  }

  async identifyInformationGaps(context: ConversationContext): Promise<InformationGap[]> {
    const recentMessages = context.messageHistory.slice(-10);
    const conversationText = this.extractConversationText(recentMessages);

    const prompt = `
    Analyze this VC conversation and identify information gaps that could benefit from additional data or clarification.
    Focus on:
    1. Missing financial metrics or market data
    2. Unverified claims that need fact-checking
    3. Incomplete competitive analysis
    4. Missing team or product details
    5. Unclear investment terms or valuations

    Return a JSON array of gaps with format:
    [{"type": "gap_type", "description": "what's missing", "priority": 1-10}]

    Conversation: ${conversationText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(conversationText, prompt);
      return this.parseInformationGaps(response.content);
    } catch (error) {
      console.error('Error identifying information gaps:', error);
      return [];
    }
  }

  async assessConversationHealth(context: ConversationContext): Promise<ConversationHealth> {
    const recentMessages = context.messageHistory.slice(-15);
    
    if (recentMessages.length === 0) {
      return { overall: 0, engagement: 0, productivity: 0, focus: 0 };
    }

    // Calculate engagement score
    const engagement = this.calculateEngagementScore(recentMessages, context.participants.length);
    
    // Calculate productivity score using Gemini
    const productivity = await this.calculateProductivityScore(recentMessages);
    
    // Calculate focus score
    const focus = await this.calculateFocusScore(recentMessages);
    
    // Overall health is weighted average
    const overall = (engagement * 0.3 + productivity * 0.4 + focus * 0.3);

    return {
      overall: Math.round(overall * 100) / 100,
      engagement: Math.round(engagement * 100) / 100,
      productivity: Math.round(productivity * 100) / 100,
      focus: Math.round(focus * 100) / 100
    };
  }

  calculateDriftUrgency(driftResult: TopicDriftResult): UrgencyLevel {
    const { messagesOffTopic, driftSeverity } = driftResult;
    
    // High urgency if many consecutive off-topic messages or high severity
    if (messagesOffTopic >= 4 || driftSeverity > 0.8) {
      return UrgencyLevel.HIGH;
    }
    
    // Medium urgency if moderate drift
    if (messagesOffTopic >= this.driftDetectionWindow || driftSeverity > 0.5) {
      return UrgencyLevel.MEDIUM;
    }
    
    return UrgencyLevel.LOW;
  }

  async generateRedirectionStrategy(originalTopic: string, currentTopic: string): Promise<RedirectionStrategy> {
    const prompt = `
    Generate a diplomatic redirection strategy to guide a VC conversation back on track.
    
    Original topic: ${originalTopic}
    Current topic: ${currentTopic}
    
    Create a professional, natural redirection that:
    1. Acknowledges the current discussion briefly
    2. Provides context about the original topic
    3. Suggests returning to the main agenda diplomatically
    4. Maintains positive group dynamics
    
    Return a JSON object with:
    {
      "approach": "gentle_reminder|context_summary|direct_redirect|agenda_reference",
      "message": "the actual redirection message",
      "contextSummary": "brief summary of what was being discussed originally",
      "diplomaticLevel": number (0-1, where 1 is most gentle)
    }
    `;

    try {
      const response = await this.geminiClient.analyzeText(`${originalTopic} -> ${currentTopic}`, prompt);
      return this.parseRedirectionStrategy(response.content);
    } catch (error) {
      console.error('Error generating redirection strategy:', error);
      return this.getDefaultRedirectionStrategy(originalTopic);
    }
  }

  private async countConsecutiveOffTopicMessages(messages: ProcessedMessage[]): Promise<number> {
    if (messages.length === 0) return 0;
    
    let consecutiveOffTopic = 0;
    
    // Check messages from most recent backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageText = messages[i].originalMessage.content;
      
      try {
        const relevanceScore = await this.calculateMessageRelevanceScore(messageText);
        
        if (relevanceScore < this.investmentRelevanceThreshold) {
          consecutiveOffTopic++;
        } else {
          break; // Stop at first on-topic message
        }
      } catch (error) {
        // If we can't determine relevance, assume it's on-topic and stop counting
        break;
      }
    }
    
    return consecutiveOffTopic;
  }

  private async calculateInvestmentRelevanceScore(messages: ProcessedMessage[]): Promise<number> {
    if (messages.length === 0) return 1.0;
    
    const conversationText = this.extractConversationText(messages);
    
    const prompt = `
    Rate how relevant this conversation is to venture capital investment decisions on a scale of 0-1.
    
    Consider:
    - Discussion of companies, markets, or investment opportunities (high relevance)
    - Financial metrics, valuations, or business models (high relevance)
    - Team assessment, product strategy, or competitive analysis (high relevance)
    - General business topics that could inform investment decisions (medium relevance)
    - Personal anecdotes, weather, sports, or completely unrelated topics (low relevance)
    
    Return only a number between 0 and 1.
    
    Conversation: ${conversationText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(conversationText, prompt);
      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Error calculating investment relevance score:', error);
      return 0.5;
    }
  }

  private async calculateMessageRelevanceScore(messageText: string): Promise<number> {
    const prompt = `
    Rate how relevant this single message is to venture capital investment discussions on a scale of 0-1.
    
    Consider VC-relevant topics:
    - Investment opportunities, companies, markets
    - Financial metrics, valuations, business models
    - Team assessment, product strategy, competitive analysis
    - Due diligence, risk assessment, portfolio management
    
    Return only a number between 0 and 1.
    
    Message: ${messageText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(messageText, prompt);
      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Error calculating message relevance score:', error);
      return 0.5;
    }
  }

  private parseRedirectionStrategy(content: string): RedirectionStrategy {
    try {
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        const strategy = JSON.parse(jsonMatch[0]);
        return {
          approach: this.validateRedirectionApproach(strategy.approach),
          message: strategy.message || 'Let\'s refocus on our main discussion.',
          contextSummary: strategy.contextSummary || 'Previous investment discussion',
          diplomaticLevel: Math.max(0, Math.min(1, Number(strategy.diplomaticLevel) || 0.7))
        };
      }
    } catch (error) {
      console.error('Error parsing redirection strategy:', error);
    }
    return this.getDefaultRedirectionStrategy('investment discussion');
  }

  private validateRedirectionApproach(approach: string): RedirectionApproach {
    const validApproaches = Object.values(RedirectionApproach);
    return validApproaches.includes(approach as RedirectionApproach) 
      ? approach as RedirectionApproach 
      : RedirectionApproach.GENTLE_REMINDER;
  }

  private getDefaultRedirectionStrategy(originalTopic: string): RedirectionStrategy {
    return {
      approach: RedirectionApproach.GENTLE_REMINDER,
      message: `I notice we've moved away from our ${originalTopic} discussion. Should we circle back to that?`,
      contextSummary: `Discussion about ${originalTopic}`,
      diplomaticLevel: 0.8
    };
  }

  private async classifyCurrentTopic(conversationText: string): Promise<string> {
    const prompt = `
    Classify this VC conversation into one of these categories:
    ${this.vcTopics.join(', ')}

    Return only the category name that best fits the conversation.
    If the conversation covers multiple topics, return the most prominent one.
    If the conversation is not related to VC topics, return "off_topic".

    Conversation: ${conversationText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(conversationText, prompt);
      const topic = response.content.trim().toLowerCase().replace(/[^a-z_]/g, '');
      return this.vcTopics.includes(topic) ? topic : 'general_discussion';
    } catch (error) {
      console.error('Error classifying topic:', error);
      return 'general_discussion';
    }
  }

  private async calculateTopicStability(history: ProcessedMessage[]): Promise<number> {
    if (history.length < 5) return 1.0;

    // Analyze topic consistency over recent messages
    const windowSize = 5;
    const windows = [];
    
    for (let i = windowSize; i <= history.length; i += windowSize) {
      const window = history.slice(i - windowSize, i);
      const text = this.extractConversationText(window);
      const topic = await this.classifyCurrentTopic(text);
      windows.push(topic);
    }

    if (windows.length < 2) return 1.0;

    // Calculate stability as percentage of windows with same topic as most recent
    const mostRecentTopic = windows[windows.length - 1];
    const stableWindows = windows.filter(topic => topic === mostRecentTopic).length;
    
    return stableWindows / windows.length;
  }

  private analyzeParticipantEngagement(messages: ProcessedMessage[]): EngagementMetrics {
    if (messages.length === 0) {
      return { averageResponseTime: 0, messageFrequency: 0, participationBalance: 0 };
    }

    // Calculate average response time
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < messages.length; i++) {
      const timeDiff = messages[i].originalMessage.timestamp.getTime() - 
                      messages[i - 1].originalMessage.timestamp.getTime();
      totalResponseTime += timeDiff;
      responseCount++;
    }
    
    const averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

    // Calculate message frequency (messages per minute)
    const timeSpan = messages.length > 1 ? 
      messages[messages.length - 1].originalMessage.timestamp.getTime() - 
      messages[0].originalMessage.timestamp.getTime() : 0;
    const messageFrequency = timeSpan > 0 ? (messages.length / (timeSpan / 60000)) : 0;

    // Calculate participation balance
    const participantCounts = new Map<string, number>();
    messages.forEach(msg => {
      const count = participantCounts.get(msg.originalMessage.userId) || 0;
      participantCounts.set(msg.originalMessage.userId, count + 1);
    });

    const counts = Array.from(participantCounts.values());
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    const participationBalance = maxCount > 0 ? minCount / maxCount : 1;

    return {
      averageResponseTime: Math.round(averageResponseTime),
      messageFrequency: Math.round(messageFrequency * 100) / 100,
      participationBalance: Math.round(participationBalance * 100) / 100
    };
  }

  private calculateConversationMomentum(messages: ProcessedMessage[]): MomentumIndicator {
    if (messages.length < 3) {
      return { direction: 'stable', strength: 0 };
    }

    // Analyze message frequency over time windows
    const windowSize = Math.max(2, Math.floor(messages.length / 3));
    const windows = [];
    
    for (let i = windowSize; i <= messages.length; i += windowSize) {
      const window = messages.slice(i - windowSize, i);
      const timeSpan = window[window.length - 1].originalMessage.timestamp.getTime() - 
                     window[0].originalMessage.timestamp.getTime();
      const frequency = timeSpan > 0 ? (window.length / (timeSpan / 60000)) : 0;
      windows.push(frequency);
    }

    if (windows.length < 2) {
      return { direction: 'stable', strength: 0.5 };
    }

    // Calculate trend
    const recent = windows[windows.length - 1];
    const previous = windows[windows.length - 2];
    const change = recent - previous;
    const changePercent = previous > 0 ? Math.abs(change) / previous : 0;

    let direction: 'increasing' | 'decreasing' | 'stable';
    if (changePercent < 0.2) {
      direction = 'stable';
    } else if (change > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    const strength = Math.min(1, changePercent);

    return { direction, strength: Math.round(strength * 100) / 100 };
  }

  private async analyzeDriftWithGemini(
    originalText: string, 
    recentText: string, 
    originalTopic: string
  ): Promise<{ isDrifting: boolean; severity: number; suggestedRedirection?: string }> {
    const prompt = `
    Analyze if this VC conversation has drifted from its original topic.
    
    Original topic: ${originalTopic}
    Original conversation: ${originalText}
    Recent conversation: ${recentText}
    
    Return a JSON object with:
    {
      "isDrifting": boolean,
      "severity": number (0-1 scale),
      "suggestedRedirection": "optional suggestion to get back on track"
    }
    
    Consider drift severity based on:
    - How far the current discussion is from the original topic
    - Whether the drift is productive (related to VC decisions) or unproductive
    - The likelihood that participants want to return to the original topic
    `;

    try {
      const response = await this.geminiClient.analyzeText(recentText, prompt);
      return this.parseDriftAnalysis(response.content);
    } catch (error) {
      console.error('Error analyzing drift:', error);
      return { isDrifting: false, severity: 0 };
    }
  }

  private async calculateProductivityScore(messages: ProcessedMessage[]): Promise<number> {
    const conversationText = this.extractConversationText(messages);
    
    const prompt = `
    Rate the productivity of this VC conversation on a scale of 0-1.
    Consider:
    - Are participants making progress toward investment decisions?
    - Is valuable information being shared and discussed?
    - Are action items or next steps being identified?
    - Is the discussion focused and goal-oriented?
    
    Return only a number between 0 and 1.
    
    Conversation: ${conversationText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(conversationText, prompt);
      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Error calculating productivity score:', error);
      return 0.5;
    }
  }

  private async calculateFocusScore(messages: ProcessedMessage[]): Promise<number> {
    const conversationText = this.extractConversationText(messages);
    
    const prompt = `
    Rate how focused this VC conversation is on a scale of 0-1.
    Consider:
    - Is the discussion staying on relevant VC/investment topics?
    - Are participants avoiding tangents and off-topic discussions?
    - Is there a clear thread of conversation being maintained?
    
    Return only a number between 0 and 1.
    
    Conversation: ${conversationText}
    `;

    try {
      const response = await this.geminiClient.analyzeText(conversationText, prompt);
      const score = parseFloat(response.content.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Error calculating focus score:', error);
      return 0.5;
    }
  }

  private calculateEngagementScore(messages: ProcessedMessage[], participantCount: number): number {
    if (messages.length === 0 || participantCount === 0) return 0;

    // Count unique participants in recent messages
    const activeParticipants = new Set(messages.map(msg => msg.originalMessage.userId)).size;
    const participationRate = activeParticipants / participantCount;

    // Calculate average sentiment
    const avgSentiment = messages.reduce((sum, msg) => sum + msg.sentiment.overall, 0) / messages.length;
    const sentimentScore = (avgSentiment + 1) / 2; // Convert -1,1 to 0,1

    // Calculate message frequency
    const timeSpan = messages.length > 1 ? 
      messages[messages.length - 1].originalMessage.timestamp.getTime() - 
      messages[0].originalMessage.timestamp.getTime() : 0;
    const messageFrequency = timeSpan > 0 ? (messages.length / (timeSpan / 60000)) : 0;
    const frequencyScore = Math.min(1, messageFrequency / 5); // Normalize to 5 messages/min = 1.0

    // Weighted combination
    return (participationRate * 0.4 + sentimentScore * 0.3 + frequencyScore * 0.3);
  }

  private extractConversationText(messages: ProcessedMessage[]): string {
    return messages
      .map(msg => `${msg.originalMessage.userId}: ${msg.originalMessage.content}`)
      .join('\n');
  }

  private parseInformationGaps(content: string): InformationGap[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        const gaps = JSON.parse(jsonMatch[0]);
        return gaps.filter((gap: any) => 
          gap.type && gap.description && typeof gap.priority === 'number'
        );
      }
    } catch (error) {
      console.error('Error parsing information gaps:', error);
    }
    return [];
  }

  private parseDriftAnalysis(content: string): { isDrifting: boolean; severity: number; suggestedRedirection?: string } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return {
          isDrifting: Boolean(analysis.isDrifting),
          severity: Math.max(0, Math.min(1, Number(analysis.severity) || 0)),
          suggestedRedirection: analysis.suggestedRedirection
        };
      }
    } catch (error) {
      console.error('Error parsing drift analysis:', error);
    }
    return { isDrifting: false, severity: 0 };
  }

  private getEmptyFlowAnalysis(): FlowAnalysis {
    return {
      currentTopic: 'general_discussion',
      topicStability: 1.0,
      participantEngagement: {
        averageResponseTime: 0,
        messageFrequency: 0,
        participationBalance: 1.0
      },
      conversationMomentum: {
        direction: 'stable',
        strength: 0
      },
      messagesOffTopic: 0,
      interventionRecommended: false
    };
  }
}