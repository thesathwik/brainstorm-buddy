import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProactiveBrainstormBot, BotConfiguration } from '../../src/index';
import { InterventionType, MeetingType, CommunicationStyle } from '../../src/models/Enums';
import { ChatMessage } from '../../src/models/ChatMessage';

describe('Professional Communication Integration', () => {
  let bot: ProactiveBrainstormBot;
  let config: BotConfiguration;

  beforeEach(() => {
    config = {
      geminiApiKey: 'test-key',
      chatPort: 8080,
      enableLearning: true,
      interventionThresholds: {
        topicDrift: 0.6,
        informationGap: 0.5,
        factCheck: 0.7
      }
    };

    bot = new ProactiveBrainstormBot(config);
  });

  describe('Professional Communication Validation Pipeline', () => {
    it('should remove robotic phrases from responses', async () => {
      const mockResponse = {
        content: 'Based on your question about market analysis, I can provide the following information.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.8
      };

      const userInput = 'What about market analysis?';
      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      // Access the private method through type assertion for testing
      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, userInput, context);

      expect(result.content).not.toContain('Based on your question about');
      expect(result.content).not.toContain('I can provide the following');
      expect(result.qualityScore).toBeGreaterThan(0.6);
    });

    it('should remove echoing patterns', async () => {
      const mockResponse = {
        content: 'Regarding market analysis, market analysis shows strong growth in the market analysis sector.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.8
      };

      const userInput = 'Tell me about market analysis trends';
      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, userInput, context);

      // Should not repeat "market analysis" excessively
      const occurrences = (result.content.match(/market analysis/gi) || []).length;
      expect(occurrences).toBeLessThan(3);
    });

    it('should ensure professional tone', async () => {
      const mockResponse = {
        content: 'Yeah, that\'s awesome! The company is gonna do great, I think.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.8
      };

      const userInput = 'What do you think about this company?';
      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, userInput, context);

      expect(result.content).not.toContain('Yeah');
      expect(result.content).not.toContain('awesome');
      expect(result.content).not.toContain('gonna');
      expect(result.content).not.toContain('I think');
      expect(result.validation.professionalScore).toBeGreaterThan(0.7);
    });

    it('should adapt response to meeting context', async () => {
      const mockResponse = {
        content: 'The company shows good performance.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.8
      };

      const userInput = 'How is the company performing?';
      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.PORTFOLIO_UPDATE
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, userInput, context);

      // Should adapt language for portfolio context
      expect(result.content).toContain('performance');
    });

    it('should regenerate low-quality responses', async () => {
      const mockResponse = {
        content: 'Based on your question about stuff, um, I think maybe it\'s good or whatever.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.8
      };

      const userInput = 'What about the investment opportunity?';
      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      // Mock the response generator to return a better response on regeneration
      const mockRegeneratedResponse = {
        content: 'The investment opportunity demonstrates strong potential based on market fundamentals.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.9
      };

      vi.spyOn(bot as any, 'responseGenerator').mockImplementation({
        generateResponse: vi.fn().mockResolvedValue(mockRegeneratedResponse)
      });

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, userInput, context);

      expect(result.qualityScore).toBeGreaterThan(0.6);
      expect(result.content).not.toContain('um');
      expect(result.content).not.toContain('whatever');
    });
  });

  describe('Enhanced Topic Drift Detection', () => {
    it('should detect drift after 2 consecutive off-topic messages', async () => {
      const messages = [
        createTestMessage('Let\'s discuss the Series A investment for TechCorp', 'user1'),
        createTestMessage('What are the financial projections?', 'user2'),
        createTestMessage('Did anyone watch the game last night?', 'user3'),
        createTestMessage('Yeah, it was amazing! Great touchdown in the fourth quarter.', 'user1')
      ];

      // Mock the context analyzer to detect drift
      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          currentTopic: 'sports',
          topicStability: 0.3,
          messagesOffTopic: 2,
          interventionRecommended: true
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'sports',
          driftSeverity: 0.8,
          messagesOffTopic: 2,
          shouldInterventImmediately: true
        })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      // Simulate processing the last message
      const lastMessage = messages[messages.length - 1];
      await (bot as any).handleMessage({
        ...lastMessage,
        sessionId: 'test-session'
      });

      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalled();
    });

    it('should generate diplomatic redirection for topic drift', async () => {
      const context = {
        sessionId: 'test-session',
        participants: [
          { name: 'Alice', role: 'partner' },
          { name: 'Bob', role: 'analyst' }
        ],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW,
        currentTopic: 'investment_evaluation'
      };

      const driftResult = {
        isDrifting: true,
        originalTopic: 'investment_evaluation',
        currentDirection: 'sports',
        driftSeverity: 0.8,
        messagesOffTopic: 2,
        shouldInterventImmediately: true
      };

      // Mock the intervention engine to recommend topic redirect
      const mockInterventionEngine = {
        shouldIntervene: vi.fn().mockResolvedValue({
          shouldRespond: true,
          interventionType: InterventionType.TOPIC_REDIRECT,
          confidence: 0.9,
          reasoning: 'Topic drift detected',
          isProactive: true
        })
      };

      (bot as any).interventionEngine = mockInterventionEngine;

      // Mock the response generator to create diplomatic redirection
      const mockResponseGenerator = {
        generateResponse: vi.fn().mockResolvedValue({
          content: 'I notice we\'ve moved away from our TechCorp investment discussion. Should we return to reviewing the financial projections?',
          type: InterventionType.TOPIC_REDIRECT,
          confidence: 0.9
        })
      };

      (bot as any).responseGenerator = mockResponseGenerator;

      const message = createTestMessage('The quarterback really made some great plays!', 'user1');
      await (bot as any).handleMessage({
        ...message,
        sessionId: 'test-session'
      });

      expect(mockInterventionEngine.shouldIntervene).toHaveBeenCalled();
      expect(mockResponseGenerator.generateResponse).toHaveBeenCalledWith(
        InterventionType.TOPIC_REDIRECT,
        expect.any(Object),
        expect.objectContaining({ topicDrift: driftResult })
      );
    });

    it('should maintain investment relevance scoring', async () => {
      const onTopicMessages = [
        createTestMessage('The company\'s revenue growth is impressive', 'user1'),
        createTestMessage('What about their market share?', 'user2')
      ];

      const offTopicMessages = [
        createTestMessage('Did you see the weather forecast?', 'user1'),
        createTestMessage('It\'s going to rain all week', 'user2')
      ];

      // Mock context analyzer to return different relevance scores
      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn()
          .mockResolvedValueOnce({
            messagesOffTopic: 0,
            interventionRecommended: false
          })
          .mockResolvedValueOnce({
            messagesOffTopic: 2,
            interventionRecommended: true
          }),
        detectTopicDrift: vi.fn()
          .mockResolvedValueOnce({
            isDrifting: false,
            messagesOffTopic: 0
          })
          .mockResolvedValueOnce({
            isDrifting: true,
            messagesOffTopic: 2,
            shouldInterventImmediately: true
          })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      // Process on-topic messages - should not trigger intervention
      for (const message of onTopicMessages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session-1'
        });
      }

      // Process off-topic messages - should trigger intervention
      for (const message of offTopicMessages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session-2'
        });
      }

      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalledTimes(2);
    });
  });

  describe('End-to-End Professional Response Validation', () => {
    it('should process complete conversation flow with professional standards', async () => {
      const conversationFlow = [
        createTestMessage('Let\'s review the Series B opportunity for DataCorp', 'partner1'),
        createTestMessage('What are their current metrics?', 'analyst1'),
        createTestMessage('Actually, did anyone try that new restaurant downtown?', 'partner1'),
        createTestMessage('Oh yes, the Italian place! Amazing pasta.', 'analyst1')
      ];

      // Mock all components for end-to-end test
      const mockMessageProcessor = {
        processMessage: vi.fn().mockImplementation((msg) => ({
          originalMessage: msg,
          extractedEntities: [],
          sentiment: { overall: 0.5 },
          topicClassification: ['off_topic'],
          urgencyLevel: 'low'
        }))
      };

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          currentTopic: 'restaurants',
          messagesOffTopic: 2,
          interventionRecommended: true
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'restaurants',
          messagesOffTopic: 2,
          shouldInterventImmediately: true
        })
      };

      const mockInterventionEngine = {
        shouldIntervene: vi.fn().mockResolvedValue({
          shouldRespond: true,
          interventionType: InterventionType.TOPIC_REDIRECT,
          confidence: 0.9,
          isProactive: true
        })
      };

      const mockResponseGenerator = {
        generateResponse: vi.fn().mockResolvedValue({
          content: 'Based on your question about restaurants, I think we should maybe get back to the DataCorp stuff or whatever.',
          type: InterventionType.TOPIC_REDIRECT,
          confidence: 0.8
        })
      };

      // Replace components with mocks
      (bot as any).messageProcessor = mockMessageProcessor;
      (bot as any).contextAnalyzer = mockContextAnalyzer;
      (bot as any).interventionEngine = mockInterventionEngine;
      (bot as any).responseGenerator = mockResponseGenerator;

      // Process the conversation
      for (const message of conversationFlow) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }

      // Verify that the final response was professionally validated
      expect(mockResponseGenerator.generateResponse).toHaveBeenCalled();
      
      // The bot should have processed all messages and made an intervention
      expect(bot.getMetrics().messagesProcessed).toBe(conversationFlow.length);
      expect(bot.getMetrics().interventionsMade).toBeGreaterThan(0);
    });

    it('should maintain quality standards across different meeting types', async () => {
      const meetingTypes = [
        MeetingType.INVESTMENT_REVIEW,
        MeetingType.DUE_DILIGENCE,
        MeetingType.STRATEGY_SESSION,
        MeetingType.PORTFOLIO_UPDATE
      ];

      for (const meetingType of meetingTypes) {
        const mockResponse = {
          content: 'Yeah, that\'s cool. I think maybe it\'s good.',
          type: InterventionType.INFORMATION_PROVIDE,
          confidence: 0.8
        };

        const context = {
          sessionId: `test-session-${meetingType}`,
          participants: [],
          messageHistory: [],
          meetingType
        };

        const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
        const result = await validateMethod(mockResponse, 'Test input', context);

        expect(result.validation.professionalScore).toBeGreaterThan(0.7);
        expect(result.qualityAssessment.overallScore).toBeGreaterThan(0.6);
        expect(result.content).not.toContain('Yeah');
        expect(result.content).not.toContain('cool');
      }
    });
  });

  describe('Integration Metrics and Monitoring', () => {
    it('should track professional communication metrics', async () => {
      const message = createTestMessage('Tell me about the investment', 'user1');
      
      // Mock components to simulate intervention
      const mockInterventionEngine = {
        shouldIntervene: vi.fn().mockResolvedValue({
          shouldRespond: true,
          interventionType: InterventionType.INFORMATION_PROVIDE,
          confidence: 0.9
        })
      };

      const mockResponseGenerator = {
        generateResponse: vi.fn().mockResolvedValue({
          content: 'The investment shows strong fundamentals.',
          type: InterventionType.INFORMATION_PROVIDE,
          confidence: 0.9
        })
      };

      (bot as any).interventionEngine = mockInterventionEngine;
      (bot as any).responseGenerator = mockResponseGenerator;

      await (bot as any).handleMessage({
        ...message,
        sessionId: 'test-session'
      });

      const metrics = bot.getMetrics();
      expect(metrics.messagesProcessed).toBe(1);
      expect(metrics.interventionsMade).toBe(1);
      expect(metrics.interventionsByType[InterventionType.INFORMATION_PROVIDE]).toBe(1);
    });

    it('should log quality scores for monitoring', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const mockResponse = {
        content: 'Professional response content.',
        type: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.9
      };

      const context = {
        sessionId: 'test-session',
        participants: [],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      await validateMethod(mockResponse, 'Test input', context);

      // Should log quality metrics
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});

// Helper function to create test messages
function createTestMessage(content: string, userId: string): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId,
    content,
    timestamp: new Date(),
    metadata: {}
  };
}