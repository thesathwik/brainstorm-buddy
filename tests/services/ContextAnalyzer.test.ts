import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultContextAnalyzer } from '../../src/services/ContextAnalyzer';
import { GeminiApiClient } from '../../src/api/GeminiApiClient';
import { ProcessedMessage, ConversationContext, ChatMessage } from '../../src/models';
import { UrgencyLevel, MeetingType, VCRole } from '../../src/models/Enums';

// Mock GeminiApiClient
const mockGeminiClient = {
  analyzeText: vi.fn(),
  generateResponse: vi.fn(),
  isHealthy: vi.fn()
} as unknown as GeminiApiClient;

describe('ContextAnalyzer', () => {
  let contextAnalyzer: DefaultContextAnalyzer;

  beforeEach(() => {
    vi.clearAllMocks();
    contextAnalyzer = new DefaultContextAnalyzer(mockGeminiClient);
  });

  // Helper function to create test messages
  const createTestMessage = (
    id: string,
    userId: string,
    content: string,
    timestamp: Date = new Date(),
    topicCategory: string = 'investment_evaluation',
    sentiment: number = 0.5
  ): ProcessedMessage => ({
    originalMessage: {
      id,
      userId,
      content,
      timestamp,
      metadata: {}
    } as ChatMessage,
    extractedEntities: [],
    sentiment: {
      positive: sentiment > 0 ? sentiment : 0,
      negative: sentiment < 0 ? Math.abs(sentiment) : 0,
      neutral: sentiment === 0 ? 1 : 0,
      overall: sentiment
    },
    topicClassification: [{
      category: topicCategory,
      confidence: 0.8,
      keywords: []
    }],
    urgencyLevel: UrgencyLevel.MEDIUM
  });

  const createTestContext = (messages: ProcessedMessage[] = []): ConversationContext => ({
    sessionId: 'test-session',
    participants: [
      {
        id: 'user1',
        name: 'Alice',
        role: VCRole.PARTNER,
        preferences: {
          interventionFrequency: 'medium' as any,
          preferredInformationTypes: [],
          communicationStyle: 'professional' as any,
          topicExpertise: []
        },
        engagementLevel: 0.8
      },
      {
        id: 'user2',
        name: 'Bob',
        role: VCRole.ANALYST,
        preferences: {
          interventionFrequency: 'medium' as any,
          preferredInformationTypes: [],
          communicationStyle: 'professional' as any,
          topicExpertise: []
        },
        engagementLevel: 0.7
      }
    ],
    currentTopic: 'investment_evaluation',
    messageHistory: messages,
    interventionHistory: [],
    startTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    meetingType: MeetingType.INVESTMENT_REVIEW
  });

  describe('analyzeConversationFlow', () => {
    it('should return empty flow analysis for no messages', async () => {
      const result = await contextAnalyzer.analyzeConversationFlow([]);
      
      expect(result).toEqual({
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
      });
    });

    it('should analyze conversation flow with messages', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'What do you think about this startup?', new Date(Date.now() - 10000)),
        createTestMessage('2', 'user2', 'The market size looks promising', new Date(Date.now() - 5000)),
        createTestMessage('3', 'user1', 'I agree, but what about the competition?', new Date())
      ];

      // Mock Gemini response for topic classification
      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.currentTopic).toBe('investment_evaluation');
      expect(result.topicStability).toBeGreaterThan(0);
      expect(result.participantEngagement.messageFrequency).toBeGreaterThan(0);
      expect(result.participantEngagement.participationBalance).toBe(0.5); // min/max ratio: 1/2 = 0.5
      expect(result.conversationMomentum.direction).toMatch(/increasing|decreasing|stable/);
    });

    it('should handle Gemini API errors gracefully', async () => {
      const messages = [createTestMessage('1', 'user1', 'Test message')];
      
      vi.mocked(mockGeminiClient.analyzeText).mockRejectedValue(new Error('API Error'));

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.currentTopic).toBe('general_discussion'); // Fallback topic
      expect(result.topicStability).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectTopicDrift', () => {
    it('should return no drift for insufficient messages', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Short conversation')
      ];

      const result = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(result.isDrifting).toBe(false);
      expect(result.originalTopic).toBe('insufficient_data');
      expect(result.driftSeverity).toBe(0);
      expect(result.messagesOffTopic).toBe(0);
      expect(result.urgencyLevel).toBe(UrgencyLevel.LOW);
      expect(result.shouldInterventImmediately).toBe(false);
    });

    it('should detect topic drift with enhanced sensitivity (2 consecutive off-topic messages)', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Let\'s discuss the investment metrics', new Date(Date.now() - 30000), 'investment_evaluation'),
        createTestMessage('2', 'user2', 'The revenue growth is 200%', new Date(Date.now() - 25000), 'investment_evaluation'),
        createTestMessage('3', 'user1', 'Speaking of growth, how was your weekend?', new Date(Date.now() - 20000), 'off_topic'),
        createTestMessage('4', 'user2', 'Great! I went hiking', new Date(Date.now() - 10000), 'off_topic')
      ];

      // Mock Gemini responses for enhanced drift detection
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: 'investment_evaluation',
          confidence: 0.9,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: 'off_topic',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // Low relevance for message 4
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.2', // Low relevance for message 3
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.8', // High relevance for message 2 - stops counting
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.3', // Low investment relevance score for recent messages (below 0.6 threshold)
          confidence: 0.8,
          usage: { inputTokens: 15, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '{"isDrifting": true, "severity": 0.7, "suggestedRedirection": "Let\'s return to discussing the investment metrics"}',
          confidence: 0.7,
          usage: { inputTokens: 20, outputTokens: 15 }
        });

      const result = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(result.isDrifting).toBe(true);
      expect(result.originalTopic).toBe('investment_evaluation');
      expect(result.currentDirection).toBe('off_topic');
      expect(result.messagesOffTopic).toBe(2);
      expect(result.urgencyLevel).toBe(UrgencyLevel.MEDIUM);
      expect(result.shouldInterventImmediately).toBe(false); // Only true if urgency is HIGH or messagesOffTopic >= 3
    });

    it('should not trigger drift for investment-relevant discussions', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Let\'s discuss the investment metrics', new Date(Date.now() - 30000), 'investment_evaluation'),
        createTestMessage('2', 'user2', 'The revenue growth is 200%', new Date(Date.now() - 25000), 'investment_evaluation'),
        createTestMessage('3', 'user1', 'What about the competitive landscape?', new Date(Date.now() - 20000), 'competitive_landscape'),
        createTestMessage('4', 'user2', 'There are three main competitors in this space', new Date(Date.now() - 10000), 'competitive_landscape')
      ];

      // Mock Gemini responses for relevant discussion
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: 'investment_evaluation',
          confidence: 0.9,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: 'competitive_landscape',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.8', // High investment relevance score
          confidence: 0.8,
          usage: { inputTokens: 15, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.9', // High relevance for individual message
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.8', // High relevance for individual message
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '{"isDrifting": false, "severity": 0.1, "suggestedRedirection": null}',
          confidence: 0.7,
          usage: { inputTokens: 20, outputTokens: 15 }
        });

      const result = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(result.isDrifting).toBe(false);
      expect(result.messagesOffTopic).toBe(0);
      expect(result.urgencyLevel).toBe(UrgencyLevel.LOW);
      expect(result.shouldInterventImmediately).toBe(false);
    });

    it('should escalate urgency for multiple consecutive off-topic messages', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Let\'s discuss the investment', new Date(Date.now() - 50000), 'investment_evaluation'),
        createTestMessage('2', 'user2', 'How was your weekend?', new Date(Date.now() - 40000), 'off_topic'),
        createTestMessage('3', 'user1', 'Great! Went to the beach', new Date(Date.now() - 30000), 'off_topic'),
        createTestMessage('4', 'user2', 'Nice weather lately', new Date(Date.now() - 20000), 'off_topic'),
        createTestMessage('5', 'user1', 'Yes, perfect for outdoor activities', new Date(Date.now() - 10000), 'off_topic')
      ];

      // Mock Gemini responses for high drift scenario
      // The order is: originalTopic, currentDirection, countConsecutiveOffTopicMessages (backwards), calculateInvestmentRelevanceScore, analyzeDriftWithGemini
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: 'investment_evaluation', // originalTopic classification
          confidence: 0.9,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: 'off_topic', // currentDirection classification
          confidence: 0.9,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // Message 5 relevance (backwards from end)
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // Message 4 relevance
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // Message 3 relevance
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // Message 2 relevance
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.8', // Message 1 relevance (high, stops counting)
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.1', // calculateInvestmentRelevanceScore for recent messages (below 0.6)
          confidence: 0.9,
          usage: { inputTokens: 15, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '{"isDrifting": true, "severity": 0.9, "suggestedRedirection": "We should return to our investment discussion"}', // analyzeDriftWithGemini
          confidence: 0.8,
          usage: { inputTokens: 20, outputTokens: 15 }
        });

      const result = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(result.isDrifting).toBe(true);
      expect(result.messagesOffTopic).toBe(4);
      expect(result.urgencyLevel).toBe(UrgencyLevel.HIGH);
      expect(result.shouldInterventImmediately).toBe(true);
      expect(result.driftSeverity).toBe(0.9);
    });

    it('should handle malformed Gemini responses', async () => {
      const messages = Array.from({ length: 4 }, (_, i) => 
        createTestMessage(`${i + 1}`, 'user1', `Message ${i + 1}`)
      );

      // Mock Gemini responses with malformed JSON
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: 'investment_evaluation',
          confidence: 0.9,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: 'general_discussion',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.5', // Message relevance - below threshold
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.5', // Message relevance - below threshold
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.5', // Message relevance - below threshold
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.5', // Message relevance - below threshold
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.5', // Investment relevance score - below threshold
          confidence: 0.5,
          usage: { inputTokens: 15, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: 'invalid json response',
          confidence: 0.7,
          usage: { inputTokens: 20, outputTokens: 15 }
        });

      const result = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(result.isDrifting).toBe(true); // Drift detected because relevance scores are below threshold and >= 2 messages off-topic
      expect(result.driftSeverity).toBe(0);
      expect(result.urgencyLevel).toBe(UrgencyLevel.HIGH); // HIGH because messagesOffTopic >= 4
    });
  });

  describe('identifyInformationGaps', () => {
    it('should identify information gaps in conversation', async () => {
      const context = createTestContext([
        createTestMessage('1', 'user1', 'This startup claims 500% growth but I don\'t see the data'),
        createTestMessage('2', 'user2', 'What about their competition? Who are the main players?'),
        createTestMessage('3', 'user1', 'The team seems experienced but we need to verify their backgrounds')
      ]);

      const mockGapsResponse = `[
        {"type": "financial_verification", "description": "Growth claims need supporting data", "priority": 9},
        {"type": "competitive_analysis", "description": "Missing competitive landscape information", "priority": 7},
        {"type": "team_verification", "description": "Team background verification needed", "priority": 6}
      ]`;

      // Clear any previous mocks and set up fresh mock for this test
      vi.clearAllMocks();
      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValueOnce({
        content: mockGapsResponse,
        confidence: 0.8,
        usage: { inputTokens: 50, outputTokens: 30 }
      });

      const result = await contextAnalyzer.identifyInformationGaps(context);
      
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('financial_verification');
      expect(result[0].priority).toBe(9);
      expect(result[1].type).toBe('competitive_analysis');
      expect(result[2].type).toBe('team_verification');
    });

    it('should handle empty conversation gracefully', async () => {
      const context = createTestContext([]);

      // Clear mocks and set up fresh mock for this test
      vi.clearAllMocks();
      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValueOnce({
        content: '[]',
        confidence: 0.5,
        usage: { inputTokens: 5, outputTokens: 2 }
      });

      const result = await contextAnalyzer.identifyInformationGaps(context);
      
      expect(result).toEqual([]);
    });

    it('should handle API errors when identifying gaps', async () => {
      const context = createTestContext([
        createTestMessage('1', 'user1', 'Test message')
      ]);

      vi.mocked(mockGeminiClient.analyzeText).mockRejectedValue(new Error('API Error'));

      const result = await contextAnalyzer.identifyInformationGaps(context);
      
      expect(result).toEqual([]);
    });
  });

  describe('assessConversationHealth', () => {
    it('should return zero health for empty conversation', async () => {
      const context = createTestContext([]);

      const result = await contextAnalyzer.assessConversationHealth(context);
      
      expect(result.overall).toBe(0);
      expect(result.engagement).toBe(0);
      expect(result.productivity).toBe(0);
      expect(result.focus).toBe(0);
    });

    it('should assess healthy conversation correctly', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Let\'s review the investment proposal', new Date(Date.now() - 30000), 'investment_evaluation', 0.7),
        createTestMessage('2', 'user2', 'The financials look strong', new Date(Date.now() - 25000), 'investment_evaluation', 0.8),
        createTestMessage('3', 'user1', 'I agree, what about market size?', new Date(Date.now() - 20000), 'market_analysis', 0.6),
        createTestMessage('4', 'user2', 'Market is $2B and growing at 15% annually', new Date(Date.now() - 15000), 'market_analysis', 0.7),
        createTestMessage('5', 'user1', 'That\'s promising. Next steps?', new Date(Date.now() - 10000), 'investment_evaluation', 0.8)
      ];
      
      const context = createTestContext(messages);

      // Mock Gemini responses for productivity and focus scores
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: '0.85',
          confidence: 0.9,
          usage: { inputTokens: 30, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.90',
          confidence: 0.9,
          usage: { inputTokens: 30, outputTokens: 5 }
        });

      const result = await contextAnalyzer.assessConversationHealth(context);
      
      expect(result.overall).toBeGreaterThan(0.5);
      expect(result.engagement).toBeGreaterThan(0.5);
      expect(result.productivity).toBe(0.85);
      expect(result.focus).toBe(0.90);
    });

    it('should handle low engagement conversation', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Hello', new Date(Date.now() - 60000), 'general_discussion', -0.2),
        createTestMessage('2', 'user1', 'Anyone there?', new Date(Date.now() - 30000), 'general_discussion', -0.3),
        createTestMessage('3', 'user1', 'I guess not...', new Date(), 'general_discussion', -0.5)
      ];
      
      const context = createTestContext(messages);

      // Mock low productivity and focus scores
      vi.mocked(mockGeminiClient.analyzeText)
        .mockResolvedValueOnce({
          content: '0.2',
          confidence: 0.8,
          usage: { inputTokens: 20, outputTokens: 5 }
        })
        .mockResolvedValueOnce({
          content: '0.3',
          confidence: 0.8,
          usage: { inputTokens: 20, outputTokens: 5 }
        });

      const result = await contextAnalyzer.assessConversationHealth(context);
      
      expect(result.overall).toBeLessThan(0.5);
      expect(result.engagement).toBeLessThan(0.5); // Low participation balance (only one participant)
      expect(result.productivity).toBe(0.2);
      expect(result.focus).toBe(0.3);
    });
  });

  describe('topic stability calculation', () => {
    it('should return high stability for consistent topics', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => 
        createTestMessage(`${i + 1}`, 'user1', `Investment message ${i + 1}`, 
          new Date(Date.now() - (10 - i) * 5000), 'investment_evaluation')
      );

      // Mock consistent topic classification
      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.9,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.topicStability).toBeGreaterThan(0.8);
    });
  });

  describe('conversation momentum calculation', () => {
    it('should detect increasing momentum', async () => {
      const baseTime = Date.now();
      const messages = [
        createTestMessage('1', 'user1', 'Message 1', new Date(baseTime - 60000)),
        createTestMessage('2', 'user2', 'Message 2', new Date(baseTime - 50000)),
        createTestMessage('3', 'user1', 'Message 3', new Date(baseTime - 35000)),
        createTestMessage('4', 'user2', 'Message 4', new Date(baseTime - 20000)),
        createTestMessage('5', 'user1', 'Message 5', new Date(baseTime - 5000)),
        createTestMessage('6', 'user2', 'Message 6', new Date(baseTime))
      ];

      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.conversationMomentum.direction).toBe('increasing');
      expect(result.conversationMomentum.strength).toBeGreaterThan(0);
    });

    it('should detect stable momentum for consistent pace', async () => {
      const baseTime = Date.now();
      const messages = [
        createTestMessage('1', 'user1', 'Message 1', new Date(baseTime - 60000)),
        createTestMessage('2', 'user2', 'Message 2', new Date(baseTime - 50000)),
        createTestMessage('3', 'user1', 'Message 3', new Date(baseTime - 40000)),
        createTestMessage('4', 'user2', 'Message 4', new Date(baseTime - 30000)),
        createTestMessage('5', 'user1', 'Message 5', new Date(baseTime - 20000)),
        createTestMessage('6', 'user2', 'Message 6', new Date(baseTime - 10000))
      ];

      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.conversationMomentum.direction).toBe('stable');
    });
  });

  describe('participant engagement analysis', () => {
    it('should calculate balanced participation correctly', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Message from user1', new Date(Date.now() - 30000)),
        createTestMessage('2', 'user2', 'Message from user2', new Date(Date.now() - 25000)),
        createTestMessage('3', 'user1', 'Another from user1', new Date(Date.now() - 20000)),
        createTestMessage('4', 'user2', 'Another from user2', new Date(Date.now() - 15000))
      ];

      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.participantEngagement.participationBalance).toBe(1.0); // Perfect balance
      expect(result.participantEngagement.messageFrequency).toBeGreaterThan(0);
      expect(result.participantEngagement.averageResponseTime).toBeGreaterThan(0);
    });

    it('should detect imbalanced participation', async () => {
      const messages = [
        createTestMessage('1', 'user1', 'Message 1', new Date(Date.now() - 30000)),
        createTestMessage('2', 'user1', 'Message 2', new Date(Date.now() - 25000)),
        createTestMessage('3', 'user1', 'Message 3', new Date(Date.now() - 20000)),
        createTestMessage('4', 'user2', 'Only message from user2', new Date(Date.now() - 15000))
      ];

      vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
        content: 'investment_evaluation',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 5 }
      });

      const result = await contextAnalyzer.analyzeConversationFlow(messages);
      
      expect(result.participantEngagement.participationBalance).toBeLessThan(1.0);
      expect(result.participantEngagement.participationBalance).toBeCloseTo(0.33, 1); // 1/3 ratio
    });
  });

  describe('Enhanced Topic Drift Detection (Task 4.1)', () => {
    describe('calculateDriftUrgency', () => {
      it('should return HIGH urgency for many consecutive off-topic messages', () => {
        const driftResult = {
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'off_topic',
          driftSeverity: 0.7,
          messagesOffTopic: 4,
          urgencyLevel: UrgencyLevel.LOW,
          shouldInterventImmediately: false
        };

        const urgency = contextAnalyzer.calculateDriftUrgency(driftResult);
        expect(urgency).toBe(UrgencyLevel.HIGH);
      });

      it('should return HIGH urgency for high drift severity', () => {
        const driftResult = {
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'off_topic',
          driftSeverity: 0.9,
          messagesOffTopic: 2,
          urgencyLevel: UrgencyLevel.LOW,
          shouldInterventImmediately: false
        };

        const urgency = contextAnalyzer.calculateDriftUrgency(driftResult);
        expect(urgency).toBe(UrgencyLevel.HIGH);
      });

      it('should return MEDIUM urgency for moderate drift', () => {
        const driftResult = {
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'off_topic',
          driftSeverity: 0.6,
          messagesOffTopic: 2,
          urgencyLevel: UrgencyLevel.LOW,
          shouldInterventImmediately: false
        };

        const urgency = contextAnalyzer.calculateDriftUrgency(driftResult);
        expect(urgency).toBe(UrgencyLevel.MEDIUM);
      });

      it('should return LOW urgency for minimal drift', () => {
        const driftResult = {
          isDrifting: false,
          originalTopic: 'investment_evaluation',
          currentDirection: 'investment_evaluation',
          driftSeverity: 0.2,
          messagesOffTopic: 1,
          urgencyLevel: UrgencyLevel.LOW,
          shouldInterventImmediately: false
        };

        const urgency = contextAnalyzer.calculateDriftUrgency(driftResult);
        expect(urgency).toBe(UrgencyLevel.LOW);
      });
    });

    describe('generateRedirectionStrategy', () => {
      it('should generate diplomatic redirection strategy', async () => {
        const mockStrategyResponse = `{
          "approach": "gentle_reminder",
          "message": "I notice we've moved to discussing weekend plans. Should we circle back to evaluating the investment opportunity?",
          "contextSummary": "We were discussing the startup's revenue growth and market potential",
          "diplomaticLevel": 0.8
        }`;

        vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
          content: mockStrategyResponse,
          confidence: 0.8,
          usage: { inputTokens: 30, outputTokens: 20 }
        });

        const strategy = await contextAnalyzer.generateRedirectionStrategy('investment_evaluation', 'off_topic');
        
        expect(strategy.approach).toBe('gentle_reminder');
        expect(strategy.message).toContain('investment opportunity');
        expect(strategy.contextSummary).toContain('revenue growth');
        expect(strategy.diplomaticLevel).toBe(0.8);
      });

      it('should handle API errors with default strategy', async () => {
        vi.mocked(mockGeminiClient.analyzeText).mockRejectedValue(new Error('API Error'));

        const strategy = await contextAnalyzer.generateRedirectionStrategy('investment_evaluation', 'off_topic');
        
        expect(strategy.approach).toBe('gentle_reminder');
        expect(strategy.message).toContain('investment_evaluation');
        expect(strategy.diplomaticLevel).toBe(0.8);
      });

      it('should handle malformed JSON responses', async () => {
        vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
          content: 'invalid json response',
          confidence: 0.5,
          usage: { inputTokens: 10, outputTokens: 5 }
        });

        const strategy = await contextAnalyzer.generateRedirectionStrategy('investment_evaluation', 'off_topic');
        
        expect(strategy.approach).toBe('gentle_reminder');
        expect(strategy.message).toBeDefined();
        expect(strategy.diplomaticLevel).toBeGreaterThan(0);
      });

      it('should validate redirection approach values', async () => {
        const mockStrategyResponse = `{
          "approach": "invalid_approach",
          "message": "Test message",
          "contextSummary": "Test summary",
          "diplomaticLevel": 0.7
        }`;

        vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
          content: mockStrategyResponse,
          confidence: 0.8,
          usage: { inputTokens: 30, outputTokens: 20 }
        });

        const strategy = await contextAnalyzer.generateRedirectionStrategy('investment_evaluation', 'off_topic');
        
        expect(strategy.approach).toBe('gentle_reminder'); // Should fallback to valid approach
      });
    });

    describe('investment relevance scoring', () => {
      it('should score investment-related messages highly', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'The startup has 300% revenue growth and strong market traction'),
          createTestMessage('2', 'user2', 'What about their competitive moat and scalability?')
        ];

        vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
          content: '0.9', // High investment relevance
          confidence: 0.9,
          usage: { inputTokens: 20, outputTokens: 5 }
        });

        // Access private method through type assertion for testing
        const analyzer = contextAnalyzer as any;
        const score = await analyzer.calculateInvestmentRelevanceScore(messages);
        
        expect(score).toBe(0.9);
      });

      it('should score off-topic messages lowly', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'How was your weekend?'),
          createTestMessage('2', 'user2', 'Great! Went to the beach and had a wonderful time')
        ];

        vi.mocked(mockGeminiClient.analyzeText).mockResolvedValue({
          content: '0.1', // Low investment relevance
          confidence: 0.8,
          usage: { inputTokens: 20, outputTokens: 5 }
        });

        const analyzer = contextAnalyzer as any;
        const score = await analyzer.calculateInvestmentRelevanceScore(messages);
        
        expect(score).toBe(0.1);
      });

      it('should handle API errors gracefully', async () => {
        const messages = [createTestMessage('1', 'user1', 'Test message')];

        vi.mocked(mockGeminiClient.analyzeText).mockRejectedValue(new Error('API Error'));

        const analyzer = contextAnalyzer as any;
        const score = await analyzer.calculateInvestmentRelevanceScore(messages);
        
        expect(score).toBe(0.5); // Default fallback score
      });
    });

    describe('consecutive off-topic message counting', () => {
      it('should count consecutive off-topic messages from the end', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'Investment discussion'),
          createTestMessage('2', 'user2', 'Weekend plans'),
          createTestMessage('3', 'user1', 'Beach trip'),
          createTestMessage('4', 'user2', 'Weather talk')
        ];

        // Mock relevance scores: checking from end backwards
        // Message 4 (Weather talk) - irrelevant
        // Message 3 (Beach trip) - irrelevant  
        // Message 2 (Weekend plans) - irrelevant
        // Message 1 (Investment discussion) - relevant (stops here)
        vi.mocked(mockGeminiClient.analyzeText)
          .mockResolvedValueOnce({ content: '0.2', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 4
          .mockResolvedValueOnce({ content: '0.1', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 3
          .mockResolvedValueOnce({ content: '0.1', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 2
          .mockResolvedValueOnce({ content: '0.8', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }); // Message 1 (relevant, stops)

        const analyzer = contextAnalyzer as any;
        const count = await analyzer.countConsecutiveOffTopicMessages(messages);
        
        expect(count).toBe(3);
      });

      it('should stop counting at first relevant message', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'Investment discussion'),
          createTestMessage('2', 'user2', 'Market analysis'),
          createTestMessage('3', 'user1', 'Weekend plans'),
          createTestMessage('4', 'user2', 'Beach trip')
        ];

        // Mock relevance scores: checking from end backwards
        // Message 4 (Beach trip) - irrelevant
        // Message 3 (Weekend plans) - irrelevant
        // Message 2 (Market analysis) - relevant (stops here)
        vi.mocked(mockGeminiClient.analyzeText)
          .mockResolvedValueOnce({ content: '0.2', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 4
          .mockResolvedValueOnce({ content: '0.1', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 3
          .mockResolvedValueOnce({ content: '0.8', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }); // Message 2 (relevant, stops)

        const analyzer = contextAnalyzer as any;
        const count = await analyzer.countConsecutiveOffTopicMessages(messages);
        
        expect(count).toBe(2);
      });

      it('should return 0 for all relevant messages', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'Investment metrics'),
          createTestMessage('2', 'user2', 'Market analysis')
        ];

        // Mock high relevance scores
        vi.mocked(mockGeminiClient.analyzeText)
          .mockResolvedValueOnce({ content: '0.8', confidence: 0.9, usage: { inputTokens: 10, outputTokens: 5 } })
          .mockResolvedValueOnce({ content: '0.9', confidence: 0.9, usage: { inputTokens: 10, outputTokens: 5 } });

        const analyzer = contextAnalyzer as any;
        const count = await analyzer.countConsecutiveOffTopicMessages(messages);
        
        expect(count).toBe(0);
      });
    });

    describe('enhanced flow analysis', () => {
      it('should include messagesOffTopic and interventionRecommended in flow analysis', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'Investment discussion'),
          createTestMessage('2', 'user2', 'Weekend plans'),
          createTestMessage('3', 'user1', 'Beach trip')
        ];

        // Mock topic classification and relevance scoring
        // First call: classifyCurrentTopic
        // Then calls for countConsecutiveOffTopicMessages (from end backwards)
        vi.mocked(mockGeminiClient.analyzeText)
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // topic classification
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // topic stability calls
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } })
          .mockResolvedValueOnce({ content: '0.1', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 3 (Beach trip)
          .mockResolvedValueOnce({ content: '0.2', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 2 (Weekend plans)
          .mockResolvedValueOnce({ content: '0.8', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }); // Message 1 (Investment) - stops

        const result = await contextAnalyzer.analyzeConversationFlow(messages);
        
        expect(result.messagesOffTopic).toBeGreaterThanOrEqual(2);
        expect(result.interventionRecommended).toBe(true); // >= 2 off-topic messages
      });

      it('should not recommend intervention for fewer than threshold off-topic messages', async () => {
        const messages = [
          createTestMessage('1', 'user1', 'Investment discussion'),
          createTestMessage('2', 'user2', 'Weekend plans')
        ];

        // Mock topic classification and relevance scoring
        vi.mocked(mockGeminiClient.analyzeText)
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // topic classification
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // topic stability calls
          .mockResolvedValueOnce({ content: 'investment_evaluation', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } })
          .mockResolvedValueOnce({ content: '0.2', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }) // Message 2 (Weekend plans)
          .mockResolvedValueOnce({ content: '0.8', confidence: 0.8, usage: { inputTokens: 10, outputTokens: 5 } }); // Message 1 (Investment) - stops

        const result = await contextAnalyzer.analyzeConversationFlow(messages);
        
        expect(result.messagesOffTopic).toBe(1);
        expect(result.interventionRecommended).toBe(false); // < 2 off-topic messages
      });
    });
  });
});