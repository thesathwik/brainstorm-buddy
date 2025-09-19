import { ProcessedMessage } from './ProcessedMessage';
import { ChatMessage } from './ChatMessage';
import { Participant, AgendaItem } from './UserPreferences';
import { MeetingType } from './Enums';
import { InterventionRecord, UserReaction, EffectivenessScore } from './LearningModels';

export interface TopicChange {
  timestamp: Date;
  previousTopic: string;
  newTopic: string;
  confidence: number;
  triggerMessageId: string;
}

export interface EngagementMetrics {
  participantId: string;
  messageCount: number;
  lastActivity: Date;
  averageResponseTime: number;
  sentimentTrend: number; // -1 to 1 scale
}

export interface ConversationFlow {
  currentTopic: string;
  topicHistory: TopicChange[];
  participantEngagement: Map<string, EngagementMetrics>;
  conversationMomentum: number; // 0-1 scale
  lastTopicChange: Date;
}

export interface ConversationContext {
  sessionId: string;
  participants: Participant[];
  currentTopic: string;
  agenda?: AgendaItem[];
  messageHistory: ProcessedMessage[];
  interventionHistory: InterventionRecord[];
  startTime: Date;
  meetingType: MeetingType;
}

export class ConversationContextTracker {
  private context: ConversationContext;
  private conversationFlow: ConversationFlow;
  private readonly maxHistorySize: number = 1000;
  private readonly topicChangeThreshold: number = 0.7;

  constructor(
    sessionId: string,
    participants: Participant[],
    meetingType: MeetingType,
    agenda?: AgendaItem[]
  ) {
    this.context = {
      sessionId,
      participants,
      currentTopic: agenda?.[0]?.title || 'General Discussion',
      agenda,
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(),
      meetingType
    };

    this.conversationFlow = {
      currentTopic: this.context.currentTopic,
      topicHistory: [],
      participantEngagement: new Map(),
      conversationMomentum: 0,
      lastTopicChange: new Date()
    };

    // Initialize engagement metrics for all participants
    participants.forEach(participant => {
      this.conversationFlow.participantEngagement.set(participant.id, {
        participantId: participant.id,
        messageCount: 0,
        lastActivity: new Date(),
        averageResponseTime: 0,
        sentimentTrend: 0
      });
    });
  }

  /**
   * Add a processed message to the conversation context
   */
  addMessage(message: ProcessedMessage): void {
    // Add to message history with size limit
    this.context.messageHistory.push(message);
    if (this.context.messageHistory.length > this.maxHistorySize) {
      this.context.messageHistory.shift();
    }

    // Update participant engagement
    this.updateParticipantEngagement(message);

    // Check for topic changes
    this.detectTopicChange(message);

    // Update conversation momentum
    this.updateConversationMomentum();
  }

  /**
   * Get the current conversation context
   */
  getContext(): ConversationContext {
    return { ...this.context };
  }

  /**
   * Get conversation flow information
   */
  getConversationFlow(): ConversationFlow {
    return {
      ...this.conversationFlow,
      participantEngagement: new Map(this.conversationFlow.participantEngagement)
    };
  }

  /**
   * Get recent message history (last N messages)
   */
  getRecentMessages(count: number = 10): ProcessedMessage[] {
    return this.context.messageHistory.slice(-count);
  }

  /**
   * Get messages from a specific time window
   */
  getMessagesInTimeWindow(minutes: number): ProcessedMessage[] {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return this.context.messageHistory.filter(
      msg => msg.originalMessage.timestamp >= cutoffTime
    );
  }

  /**
   * Get engagement metrics for a specific participant
   */
  getParticipantEngagement(participantId: string): EngagementMetrics | undefined {
    return this.conversationFlow.participantEngagement.get(participantId);
  }

  /**
   * Get all participant engagement metrics
   */
  getAllParticipantEngagement(): EngagementMetrics[] {
    return Array.from(this.conversationFlow.participantEngagement.values());
  }

  /**
   * Check if conversation has been idle for a specified duration
   */
  isConversationIdle(minutes: number): boolean {
    if (this.context.messageHistory.length === 0) return true;
    
    const lastMessage = this.context.messageHistory[this.context.messageHistory.length - 1];
    const idleThreshold = new Date(Date.now() - minutes * 60 * 1000);
    return lastMessage.originalMessage.timestamp < idleThreshold;
  }

  /**
   * Get topic change history
   */
  getTopicHistory(): TopicChange[] {
    return [...this.conversationFlow.topicHistory];
  }

  /**
   * Update current topic manually (e.g., from agenda progression)
   */
  updateCurrentTopic(newTopic: string, confidence: number = 1.0): void {
    if (newTopic !== this.conversationFlow.currentTopic) {
      const topicChange: TopicChange = {
        timestamp: new Date(),
        previousTopic: this.conversationFlow.currentTopic,
        newTopic,
        confidence,
        triggerMessageId: 'manual'
      };

      this.conversationFlow.topicHistory.push(topicChange);
      this.conversationFlow.currentTopic = newTopic;
      this.context.currentTopic = newTopic;
      this.conversationFlow.lastTopicChange = new Date();
    }
  }

  /**
   * Add an intervention record
   */
  addIntervention(intervention: InterventionRecord): void {
    this.context.interventionHistory.push(intervention);
  }

  /**
   * Get conversation statistics
   */
  getConversationStats() {
    const totalMessages = this.context.messageHistory.length;
    const duration = Date.now() - this.context.startTime.getTime();
    const durationMinutes = duration / (1000 * 60);
    
    return {
      totalMessages,
      durationMinutes,
      messagesPerMinute: totalMessages / Math.max(durationMinutes, 1),
      participantCount: this.context.participants.length,
      topicChanges: this.conversationFlow.topicHistory.length,
      interventions: this.context.interventionHistory.length,
      conversationMomentum: this.conversationFlow.conversationMomentum
    };
  }

  private updateParticipantEngagement(message: ProcessedMessage): void {
    const participantId = message.originalMessage.userId;
    const engagement = this.conversationFlow.participantEngagement.get(participantId);
    
    if (engagement) {
      const now = new Date();
      const timeSinceLastMessage = now.getTime() - engagement.lastActivity.getTime();
      
      // Update engagement metrics
      engagement.messageCount++;
      engagement.lastActivity = now;
      
      // Update average response time (simple moving average)
      if (engagement.messageCount > 1) {
        engagement.averageResponseTime = 
          (engagement.averageResponseTime * (engagement.messageCount - 1) + timeSinceLastMessage) / 
          engagement.messageCount;
      }
      
      // Update sentiment trend (weighted average favoring recent messages)
      const sentimentWeight = 0.3;
      engagement.sentimentTrend = 
        engagement.sentimentTrend * (1 - sentimentWeight) + 
        message.sentiment.overall * sentimentWeight;

      // Update participant's engagement level in context
      const participant = this.context.participants.find(p => p.id === participantId);
      if (participant) {
        participant.engagementLevel = this.calculateEngagementLevel(engagement);
      }
    }
  }

  private calculateEngagementLevel(engagement: EngagementMetrics): number {
    const recentActivityWeight = 0.4;
    const messageFrequencyWeight = 0.3;
    const sentimentWeight = 0.3;

    // Recent activity score (higher if more recent)
    const timeSinceLastActivity = Date.now() - engagement.lastActivity.getTime();
    const recentActivityScore = Math.max(0, 1 - timeSinceLastActivity / (30 * 60 * 1000)); // 30 min window

    // Message frequency score (normalized)
    const avgMessagesPerMinute = engagement.messageCount / 
      Math.max(1, (Date.now() - this.context.startTime.getTime()) / (60 * 1000));
    const messageFrequencyScore = Math.min(1, avgMessagesPerMinute / 2); // Normalize to 2 messages/min = 1.0

    // Sentiment score (convert -1 to 1 range to 0 to 1)
    const sentimentScore = (engagement.sentimentTrend + 1) / 2;

    return (
      recentActivityScore * recentActivityWeight +
      messageFrequencyScore * messageFrequencyWeight +
      sentimentScore * sentimentWeight
    );
  }

  private detectTopicChange(message: ProcessedMessage): void {
    // Simple topic change detection based on topic classification confidence
    const topicClassifications = message.topicClassification;
    
    if (topicClassifications.length > 0) {
      const dominantTopic = topicClassifications.reduce((prev, current) => 
        prev.confidence > current.confidence ? prev : current
      );

      // Check if this represents a significant topic change
      if (dominantTopic.confidence > this.topicChangeThreshold && 
          dominantTopic.category !== this.conversationFlow.currentTopic) {
        
        const topicChange: TopicChange = {
          timestamp: message.originalMessage.timestamp,
          previousTopic: this.conversationFlow.currentTopic,
          newTopic: dominantTopic.category,
          confidence: dominantTopic.confidence,
          triggerMessageId: message.originalMessage.id
        };

        this.conversationFlow.topicHistory.push(topicChange);
        this.conversationFlow.currentTopic = dominantTopic.category;
        this.context.currentTopic = dominantTopic.category;
        this.conversationFlow.lastTopicChange = message.originalMessage.timestamp;
      }
    }
  }

  private updateConversationMomentum(): void {
    const recentMessages = this.getMessagesInTimeWindow(5); // Last 5 minutes
    
    if (recentMessages.length === 0) {
      this.conversationFlow.conversationMomentum = 0;
      return;
    }

    // Calculate momentum based on message frequency and engagement
    const messageFrequency = recentMessages.length / 5; // messages per minute
    const avgSentiment = recentMessages.reduce((sum, msg) => sum + msg.sentiment.overall, 0) / recentMessages.length;
    const participantDiversity = new Set(recentMessages.map(msg => msg.originalMessage.userId)).size;
    
    // Normalize and combine factors
    const frequencyScore = Math.min(1, messageFrequency / 3); // 3 messages/min = max
    const sentimentScore = (avgSentiment + 1) / 2; // Convert -1,1 to 0,1
    const diversityScore = Math.min(1, participantDiversity / this.context.participants.length);
    
    this.conversationFlow.conversationMomentum = (frequencyScore + sentimentScore + diversityScore) / 3;
  }
}