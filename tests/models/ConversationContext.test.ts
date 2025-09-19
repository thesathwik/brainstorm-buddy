import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  ConversationContextTracker, 
  TopicChange, 
  EngagementMetrics,
  InterventionRecord 
} from '../../src/models/ConversationContext';
import { ProcessedMessage } from '../../src/models/ProcessedMessage';
import { ChatMessage } from '../../src/models/ChatMessage';
import { Participant } from '../../src/models/UserPreferences';
import { 
  MeetingType, 
  VCRole, 
  InterventionFrequency, 
  CommunicationStyle,
  UrgencyLevel 
} from '../../src/models/Enums';

describe('ConversationContextTracker', () => {
  let tracker: ConversationContextTracker;
  let mockParticipants: Participant[];
  let mockAgenda: any[];

  beforeEach(() => {
    mockParticipants = [
      {
        id: 'user1',
        name: 'Alice Partner',
        role: VCRole.PARTNER,
        preferences: {
          interventionFrequency: InterventionFrequency.MODERATE,
          preferredInformationTypes: [],
          communicationStyle: CommunicationStyle.CONVERSATIONAL,
          topicExpertise: []
        },
        engagementLevel: 0.5
      },
      {
        id: 'user2',
        name: 'Bob Analyst',
        role: VCRole.ANALYST,
        preferences: {
          interventionFrequency: InterventionFrequency.ACTIVE,
          preferredInformationTypes: [],
          communicationStyle: CommunicationStyle.DETAILED,
          topicExpertise: []
        },
        engagementLevel: 0.7
      }
    ];

    mockAgenda = [
      { id: '1', title: 'Investment Review', priority: 1 },
      { id: '2', title: 'Market Analysis', priority: 2 }
    ];

    tracker = new ConversationContextTracker(
      'session-123',
      mockParticipants,
      MeetingType.INVESTMENT_REVIEW,
      mockAgenda
    );
  });

  describe('Initialization', () => {
    it('should initialize with correct session data', () => {
      const context = tracker.getContext();
      
      expect(context.sessionId).toBe('session-123');
      expect(context.participants).toHaveLength(2);
      expect(context.meetingType).toBe(MeetingType.INVESTMENT_REVIEW);
      expect(context.currentTopic).toBe('Investment Review');
      expect(context.messageHistory).toHaveLength(0);
      expect(context.interventionHistory).toHaveLength(0);
    });

    it('should initialize engagement metrics for all participants', () => {
      const flow = tracker.getConversationFlow();
      
      expect(flow.participantEngagement.size).toBe(2);
      expect(flow.participantEngagement.has('user1')).toBe(true);
      expect(flow.participantEngagement.has('user2')).toBe(true);
      
      const user1Engagement = flow.participantEngagement.get('user1');
      expect(user1Engagement?.messageCount).toBe(0);
      expect(user1Engagement?.sentimentTrend).toBe(0);
    });

    it('should handle initialization without agenda', () => {
      const trackerNoAgenda = new ConversationContextTracker(
        'session-456',
        mockParticipants,
        MeetingType.GENERAL_DISCUSSION
      );
      
      const context = trackerNoAgenda.getContext();
      expect(context.currentTopic).toBe('General Discussion');
      expect(context.agenda).toBeUndefined();
    });
  });

  describe('Message Management', () => {
    let mockMessage: ProcessedMessage;

    beforeEach(() => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user1',
        content: 'Let\'s discuss the Series A funding for TechCorp',
        timestamp: new Date()
      };

      mockMessage = {
        originalMessage: chatMessage,
        extractedEntities: [
          { type: 'company', value: 'TechCorp', confidence: 0.9, startIndex: 0, endIndex: 8 }
        ],
        sentiment: { positive: 0.7, negative: 0.1, neutral: 0.2, overall: 0.6 },
        topicClassification: [
          { category: 'funding', confidence: 0.8, keywords: ['Series A', 'funding'] }
        ],
        urgencyLevel: UrgencyLevel.MEDIUM
      };
    });

    it('should add messages to history', () => {
      tracker.addMessage(mockMessage);
      
      const context = tracker.getContext();
      expect(context.messageHistory).toHaveLength(1);
      expect(context.messageHistory[0]).toBe(mockMessage);
    });

    it('should maintain message history size limit', () => {
      // Add messages beyond the limit (1000)
      for (let i = 0; i < 1005; i++) {
        const msg = { ...mockMessage };
        msg.originalMessage = { ...mockMessage.originalMessage, id: `msg-${i}` };
        tracker.addMessage(msg);
      }
      
      const context = tracker.getContext();
      expect(context.messageHistory).toHaveLength(1000);
      expect(context.messageHistory[0].originalMessage.id).toBe('msg-5'); // First 5 should be removed
    });

    it('should get recent messages correctly', () => {
      // Add 15 messages
      for (let i = 0; i < 15; i++) {
        const msg = { ...mockMessage };
        msg.originalMessage = { ...mockMessage.originalMessage, id: `msg-${i}` };
        tracker.addMessage(msg);
      }
      
      const recent = tracker.getRecentMessages(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].originalMessage.id).toBe('msg-10');
      expect(recent[4].originalMessage.id).toBe('msg-14');
    });

    it('should get messages in time window', () => {
      const now = new Date();
      const oldMessage = { ...mockMessage };
      oldMessage.originalMessage = { ...mockMessage.originalMessage, timestamp: new Date(now.getTime() - 10 * 60 * 1000) }; // 10 minutes ago
      
      const recentMessage = { ...mockMessage };
      recentMessage.originalMessage = { ...mockMessage.originalMessage, timestamp: new Date(now.getTime() - 2 * 60 * 1000) }; // 2 minutes ago
      
      tracker.addMessage(oldMessage);
      tracker.addMessage(recentMessage);
      
      const messagesInWindow = tracker.getMessagesInTimeWindow(5); // Last 5 minutes
      expect(messagesInWindow).toHaveLength(1);
      expect(messagesInWindow[0]).toBe(recentMessage);
    });
  });

  describe('Participant Engagement Tracking', () => {
    it('should update participant engagement when messages are added', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user1',
        content: 'Great point about the market opportunity',
        timestamp: new Date()
      };

      const processedMessage: ProcessedMessage = {
        originalMessage: chatMessage,
        extractedEntities: [],
        sentiment: { positive: 0.8, negative: 0.1, neutral: 0.1, overall: 0.7 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };

      tracker.addMessage(processedMessage);
      
      const engagement = tracker.getParticipantEngagement('user1');
      expect(engagement?.messageCount).toBe(1);
      expect(engagement?.sentimentTrend).toBeCloseTo(0.21, 1); // 0.7 * 0.3 weight
      expect(engagement?.lastActivity).toBeInstanceOf(Date);
    });

    it('should calculate engagement levels correctly', () => {
      // Add multiple messages for user1
      for (let i = 0; i < 3; i++) {
        const chatMessage: ChatMessage = {
          id: `msg-${i}`,
          userId: 'user1',
          content: `Message ${i}`,
          timestamp: new Date(Date.now() - i * 1000) // Spread over time
        };

        const processedMessage: ProcessedMessage = {
          originalMessage: chatMessage,
          extractedEntities: [],
          sentiment: { positive: 0.6, negative: 0.2, neutral: 0.2, overall: 0.4 },
          topicClassification: [],
          urgencyLevel: UrgencyLevel.LOW
        };

        tracker.addMessage(processedMessage);
      }
      
      const context = tracker.getContext();
      const user1 = context.participants.find(p => p.id === 'user1');
      expect(user1?.engagementLevel).toBeGreaterThan(0);
      expect(user1?.engagementLevel).toBeLessThanOrEqual(1);
    });

    it('should get all participant engagement metrics', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user2',
        content: 'I agree with the analysis',
        timestamp: new Date()
      };

      const processedMessage: ProcessedMessage = {
        originalMessage: chatMessage,
        extractedEntities: [],
        sentiment: { positive: 0.9, negative: 0.05, neutral: 0.05, overall: 0.85 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };

      tracker.addMessage(processedMessage);
      
      const allEngagement = tracker.getAllParticipantEngagement();
      expect(allEngagement).toHaveLength(2);
      
      const user2Engagement = allEngagement.find(e => e.participantId === 'user2');
      expect(user2Engagement?.messageCount).toBe(1);
    });
  });

  describe('Topic Change Detection', () => {
    it('should detect topic changes based on message classification', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user1',
        content: 'Let\'s shift to discussing market trends',
        timestamp: new Date()
      };

      const processedMessage: ProcessedMessage = {
        originalMessage: chatMessage,
        extractedEntities: [],
        sentiment: { positive: 0.5, negative: 0.2, neutral: 0.3, overall: 0.3 },
        topicClassification: [
          { category: 'Market Trends', confidence: 0.8, keywords: ['market', 'trends'] }
        ],
        urgencyLevel: UrgencyLevel.MEDIUM
      };

      tracker.addMessage(processedMessage);
      
      const flow = tracker.getConversationFlow();
      expect(flow.currentTopic).toBe('Market Trends');
      
      const topicHistory = tracker.getTopicHistory();
      expect(topicHistory).toHaveLength(1);
      expect(topicHistory[0].previousTopic).toBe('Investment Review');
      expect(topicHistory[0].newTopic).toBe('Market Trends');
      expect(topicHistory[0].confidence).toBe(0.8);
    });

    it('should not change topic for low confidence classifications', () => {
      const chatMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user1',
        content: 'Maybe we should look at competitors',
        timestamp: new Date()
      };

      const processedMessage: ProcessedMessage = {
        originalMessage: chatMessage,
        extractedEntities: [],
        sentiment: { positive: 0.3, negative: 0.1, neutral: 0.6, overall: 0.2 },
        topicClassification: [
          { category: 'Competitive Analysis', confidence: 0.5, keywords: ['competitors'] }
        ],
        urgencyLevel: UrgencyLevel.LOW
      };

      tracker.addMessage(processedMessage);
      
      const flow = tracker.getConversationFlow();
      expect(flow.currentTopic).toBe('Investment Review'); // Should remain unchanged
      expect(tracker.getTopicHistory()).toHaveLength(0);
    });

    it('should allow manual topic updates', () => {
      tracker.updateCurrentTopic('Due Diligence Review', 1.0);
      
      const flow = tracker.getConversationFlow();
      expect(flow.currentTopic).toBe('Due Diligence Review');
      
      const context = tracker.getContext();
      expect(context.currentTopic).toBe('Due Diligence Review');
      
      const topicHistory = tracker.getTopicHistory();
      expect(topicHistory).toHaveLength(1);
      expect(topicHistory[0].triggerMessageId).toBe('manual');
    });
  });

  describe('Conversation Flow Analysis', () => {
    it('should detect idle conversations', () => {
      expect(tracker.isConversationIdle(1)).toBe(true); // No messages yet
      
      const oldMessage: ProcessedMessage = {
        originalMessage: {
          id: 'msg-1',
          userId: 'user1',
          content: 'Old message',
          timestamp: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
        },
        extractedEntities: [],
        sentiment: { positive: 0.5, negative: 0.2, neutral: 0.3, overall: 0.3 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };
      
      tracker.addMessage(oldMessage);
      expect(tracker.isConversationIdle(5)).toBe(true); // Idle for more than 5 minutes
      expect(tracker.isConversationIdle(15)).toBe(false); // Not idle for 15 minutes
    });

    it('should calculate conversation momentum', () => {
      // Add several recent messages to build momentum
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        const message: ProcessedMessage = {
          originalMessage: {
            id: `msg-${i}`,
            userId: i % 2 === 0 ? 'user1' : 'user2', // Alternate users
            content: `Message ${i}`,
            timestamp: new Date(now.getTime() - i * 30 * 1000) // 30 seconds apart
          },
          extractedEntities: [],
          sentiment: { positive: 0.7, negative: 0.1, neutral: 0.2, overall: 0.6 },
          topicClassification: [],
          urgencyLevel: UrgencyLevel.MEDIUM
        };
        
        tracker.addMessage(message);
      }
      
      const flow = tracker.getConversationFlow();
      expect(flow.conversationMomentum).toBeGreaterThan(0);
      expect(flow.conversationMomentum).toBeLessThanOrEqual(1);
    });

    it('should provide conversation statistics', () => {
      // Wait a small amount to ensure duration > 0
      const startTime = Date.now();
      
      // Add some messages and interventions
      const message: ProcessedMessage = {
        originalMessage: {
          id: 'msg-1',
          userId: 'user1',
          content: 'Test message',
          timestamp: new Date()
        },
        extractedEntities: [],
        sentiment: { positive: 0.5, negative: 0.2, neutral: 0.3, overall: 0.3 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };
      
      tracker.addMessage(message);
      tracker.updateCurrentTopic('New Topic');
      
      const intervention: InterventionRecord = {
        id: 'int-1',
        timestamp: new Date(),
        type: 'topic_redirect',
        trigger: 'topic_drift',
        response: 'Let\'s get back to the main topic'
      };
      
      tracker.addIntervention(intervention);
      
      // Ensure some time has passed
      const elapsed = Date.now() - startTime;
      if (elapsed < 1) {
        // Force a small delay if needed
        const futureTime = new Date(startTime + 1);
        vi.setSystemTime(futureTime);
      }
      
      const stats = tracker.getConversationStats();
      expect(stats.totalMessages).toBe(1);
      expect(stats.participantCount).toBe(2);
      expect(stats.topicChanges).toBe(1);
      expect(stats.interventions).toBe(1);
      expect(stats.durationMinutes).toBeGreaterThanOrEqual(0);
      expect(stats.conversationMomentum).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Intervention Management', () => {
    it('should add and track interventions', () => {
      const intervention: InterventionRecord = {
        id: 'int-1',
        timestamp: new Date(),
        type: 'information_provide',
        trigger: 'company_mention',
        response: 'Here\'s some relevant information about TechCorp...'
      };
      
      tracker.addIntervention(intervention);
      
      const context = tracker.getContext();
      expect(context.interventionHistory).toHaveLength(1);
      expect(context.interventionHistory[0]).toBe(intervention);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message history gracefully', () => {
      expect(tracker.getRecentMessages(10)).toHaveLength(0);
      expect(tracker.getMessagesInTimeWindow(5)).toHaveLength(0);
      expect(tracker.isConversationIdle(1)).toBe(true);
    });

    it('should handle participant not found in engagement update', () => {
      const unknownUserMessage: ProcessedMessage = {
        originalMessage: {
          id: 'msg-1',
          userId: 'unknown-user',
          content: 'Message from unknown user',
          timestamp: new Date()
        },
        extractedEntities: [],
        sentiment: { positive: 0.5, negative: 0.2, neutral: 0.3, overall: 0.3 },
        topicClassification: [],
        urgencyLevel: UrgencyLevel.LOW
      };
      
      // Should not throw error
      expect(() => tracker.addMessage(unknownUserMessage)).not.toThrow();
      
      const engagement = tracker.getParticipantEngagement('unknown-user');
      expect(engagement).toBeUndefined();
    });

    it('should handle duplicate topic updates', () => {
      tracker.updateCurrentTopic('Same Topic');
      tracker.updateCurrentTopic('Same Topic'); // Duplicate
      
      const topicHistory = tracker.getTopicHistory();
      expect(topicHistory).toHaveLength(1); // Should only record one change
    });
  });
});