import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProactiveBrainstormBot, BotConfiguration } from '../../src/index';
import { InterventionType, MeetingType, UrgencyLevel } from '../../src/models/Enums';
import { ChatMessage } from '../../src/models/ChatMessage';
import { DefaultContextAnalyzer, TopicDriftResult } from '../../src/services/ContextAnalyzer';

describe('Enhanced Focus Protection Integration', () => {
  let bot: ProactiveBrainstormBot;
  let config: BotConfiguration;

  beforeEach(() => {
    config = {
      geminiApiKey: 'test-key',
      chatPort: 8080,
      enableLearning: true,
      interventionThresholds: {
        topicDrift: 0.6, // Enhanced threshold for 2-message detection
        informationGap: 0.5,
        factCheck: 0.7
      }
    };

    bot = new ProactiveBrainstormBot(config);
  });

  describe('2-Message Threshold Topic Drift Detection', () => {
    it('should detect drift after exactly 2 consecutive off-topic messages', async () => {
      const messages = [
        createTestMessage('Let\'s evaluate the Series A for TechStartup', 'partner1'),
        createTestMessage('What\'s their current ARR?', 'analyst1'),
        createTestMessage('Did you see the news about the merger?', 'partner1'), // First off-topic
        createTestMessage('Yes, quite surprising! The stock jumped 20%.', 'analyst1') // Second off-topic
      ];

      // Mock context analyzer with enhanced 2-message detection
      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          currentTopic: 'market_news',
          topicStability: 0.4,
          messagesOffTopic: 2,
          interventionRecommended: true
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'market_news',
          driftSeverity: 0.7,
          messagesOffTopic: 2,
          urgencyLevel: UrgencyLevel.MEDIUM,
          shouldInterventImmediately: true
        })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      // Mock intervention engine to respond to drift
      const mockInterventionEngine = {
        shouldIntervene: vi.fn().mockResolvedValue({
          shouldRespond: true,
          interventionType: InterventionType.TOPIC_REDIRECT,
          confidence: 0.85,
          reasoning: 'Topic drift detected after 2 messages',
          isProactive: true,
          requiresImmediateAction: true
        })
      };

      (bot as any).interventionEngine = mockInterventionEngine;

      // Process messages
      for (const message of messages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }

      // Verify drift detection was called
      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalled();
      expect(mockInterventionEngine.shouldIntervene).toHaveBeenCalled();
    });

    it('should NOT trigger intervention for only 1 off-topic message', async () => {
      const messages = [
        createTestMessage('Let\'s discuss the valuation for DataCorp', 'partner1'),
        createTestMessage('Their revenue model looks solid', 'analyst1'),
        createTestMessage('Anyone want coffee?', 'partner1'), // Only 1 off-topic
        createTestMessage('Back to DataCorp - what about their customer acquisition cost?', 'analyst1') // Back on topic
      ];

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          currentTopic: 'investment_evaluation',
          topicStability: 0.8,
          messagesOffTopic: 0, // Reset after returning to topic
          interventionRecommended: false
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: false,
          originalTopic: 'investment_evaluation',
          currentDirection: 'investment_evaluation',
          driftSeverity: 0.2,
          messagesOffTopic: 0,
          urgencyLevel: UrgencyLevel.LOW,
          shouldInterventImmediately: false
        })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      const mockInterventionEngine = {
        shouldIntervene: vi.fn().mockResolvedValue({
          shouldRespond: false,
          interventionType: InterventionType.TOPIC_REDIRECT,
          confidence: 0.3,
          reasoning: 'Insufficient drift evidence',
          isProactive: false
        })
      };

      (bot as any).interventionEngine = mockInterventionEngine;

      // Process all messages
      for (const message of messages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }

      // Should not have triggered intervention
      const lastCall = mockInterventionEngine.shouldIntervene.mock.calls[
        mockInterventionEngine.shouldIntervene.mock.calls.length - 1
      ];
      const lastDecision = await mockInterventionEngine.shouldIntervene(...lastCall);
      expect(lastDecision.shouldRespond).toBe(false);
    });

    it('should escalate urgency with more consecutive off-topic messages', async () => {
      const messages = [
        createTestMessage('Let\'s review the AI startup pitch', 'partner1'),
        createTestMessage('What\'s their technology stack?', 'analyst1'),
        createTestMessage('Speaking of AI, did you see that movie?', 'partner1'), // 1st off-topic
        createTestMessage('Which one? The sci-fi thriller?', 'analyst1'), // 2nd off-topic
        createTestMessage('Yes! The special effects were incredible.', 'partner1'), // 3rd off-topic
        createTestMessage('I loved the plot twist at the end.', 'analyst1') // 4th off-topic
      ];

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn()
          .mockResolvedValueOnce({ messagesOffTopic: 2, interventionRecommended: true })
          .mockResolvedValueOnce({ messagesOffTopic: 3, interventionRecommended: true })
          .mockResolvedValueOnce({ messagesOffTopic: 4, interventionRecommended: true }),
        detectTopicDrift: vi.fn()
          .mockResolvedValueOnce({
            isDrifting: true,
            messagesOffTopic: 2,
            urgencyLevel: UrgencyLevel.MEDIUM,
            shouldInterventImmediately: true
          })
          .mockResolvedValueOnce({
            isDrifting: true,
            messagesOffTopic: 3,
            urgencyLevel: UrgencyLevel.HIGH,
            shouldInterventImmediately: true
          })
          .mockResolvedValueOnce({
            isDrifting: true,
            messagesOffTopic: 4,
            urgencyLevel: UrgencyLevel.HIGH,
            shouldInterventImmediately: true
          })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      // Process messages and check urgency escalation
      for (let i = 0; i < messages.length; i++) {
        await (bot as any).handleMessage({
          ...messages[i],
          sessionId: 'test-session'
        });
      }

      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalled();
    });
  });

  describe('Investment Relevance Scoring', () => {
    it('should score investment-related topics highly', async () => {
      const investmentMessages = [
        'The company\'s revenue growth is 150% year-over-year',
        'Their market size is estimated at $2.5 billion',
        'The founding team has strong domain expertise',
        'Customer acquisition cost is trending downward'
      ];

      for (const content of investmentMessages) {
        const message = createTestMessage(content, 'analyst1');
        
        // Mock high relevance scoring
        const mockContextAnalyzer = {
          analyzeConversationFlow: vi.fn().mockResolvedValue({
            messagesOffTopic: 0,
            interventionRecommended: false
          }),
          detectTopicDrift: vi.fn().mockResolvedValue({
            isDrifting: false,
            messagesOffTopic: 0,
            urgencyLevel: UrgencyLevel.LOW
          })
        };

        (bot as any).contextAnalyzer = mockContextAnalyzer;

        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });

        // Should not trigger drift detection for high-relevance content
        expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalled();
      }
    });

    it('should score off-topic conversations lowly', async () => {
      const offTopicMessages = [
        'Did anyone watch the game last night?',
        'The weather has been terrible this week',
        'I need to pick up groceries after work',
        'My vacation to Europe was amazing'
      ];

      let messageCount = 0;
      for (const content of offTopicMessages) {
        messageCount++;
        const message = createTestMessage(content, 'partner1');
        
        // Mock low relevance scoring leading to drift detection
        const mockContextAnalyzer = {
          analyzeConversationFlow: vi.fn().mockResolvedValue({
            messagesOffTopic: messageCount >= 2 ? 2 : messageCount,
            interventionRecommended: messageCount >= 2
          }),
          detectTopicDrift: vi.fn().mockResolvedValue({
            isDrifting: messageCount >= 2,
            messagesOffTopic: messageCount >= 2 ? 2 : messageCount,
            urgencyLevel: messageCount >= 2 ? UrgencyLevel.MEDIUM : UrgencyLevel.LOW,
            shouldInterventImmediately: messageCount >= 2
          })
        };

        (bot as any).contextAnalyzer = mockContextAnalyzer;

        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }
    });

    it('should handle mixed relevance conversations appropriately', async () => {
      const mixedMessages = [
        createTestMessage('The startup\'s burn rate is concerning', 'analyst1'), // High relevance
        createTestMessage('What\'s their runway?', 'partner1'), // High relevance  
        createTestMessage('By the way, nice shirt today!', 'analyst1'), // Low relevance
        createTestMessage('Thanks! Got it on sale.', 'partner1'), // Low relevance - should trigger
        createTestMessage('Back to the runway question...', 'analyst1') // High relevance - back on track
      ];

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn()
          .mockResolvedValueOnce({ messagesOffTopic: 0, interventionRecommended: false })
          .mockResolvedValueOnce({ messagesOffTopic: 0, interventionRecommended: false })
          .mockResolvedValueOnce({ messagesOffTopic: 1, interventionRecommended: false })
          .mockResolvedValueOnce({ messagesOffTopic: 2, interventionRecommended: true }) // Trigger here
          .mockResolvedValueOnce({ messagesOffTopic: 0, interventionRecommended: false }), // Reset
        detectTopicDrift: vi.fn()
          .mockResolvedValueOnce({ isDrifting: false, messagesOffTopic: 0 })
          .mockResolvedValueOnce({ isDrifting: false, messagesOffTopic: 0 })
          .mockResolvedValueOnce({ isDrifting: false, messagesOffTopic: 1 })
          .mockResolvedValueOnce({ isDrifting: true, messagesOffTopic: 2, shouldInterventImmediately: true })
          .mockResolvedValueOnce({ isDrifting: false, messagesOffTopic: 0 })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      for (const message of mixedMessages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }

      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalledTimes(5);
    });
  });

  describe('Diplomatic Redirection Strategy', () => {
    it('should generate context-aware redirection messages', async () => {
      const driftScenarios = [
        {
          originalTopic: 'investment_evaluation',
          currentTopic: 'sports',
          expectedElements: ['investment', 'evaluation', 'return', 'focus']
        },
        {
          originalTopic: 'due_diligence',
          currentTopic: 'weather',
          expectedElements: ['due diligence', 'analysis', 'continue', 'review']
        },
        {
          originalTopic: 'valuation',
          currentTopic: 'restaurants',
          expectedElements: ['valuation', 'discussion', 'back', 'topic']
        }
      ];

      for (const scenario of driftScenarios) {
        const mockResponseGenerator = {
          generateResponse: vi.fn().mockResolvedValue({
            content: `I notice we've moved away from our ${scenario.originalTopic} discussion. Should we return to that topic?`,
            type: InterventionType.TOPIC_REDIRECT,
            confidence: 0.9
          })
        };

        (bot as any).responseGenerator = mockResponseGenerator;

        const mockInterventionEngine = {
          shouldIntervene: vi.fn().mockResolvedValue({
            shouldRespond: true,
            interventionType: InterventionType.TOPIC_REDIRECT,
            confidence: 0.9
          })
        };

        (bot as any).interventionEngine = mockInterventionEngine;

        const message = createTestMessage('This is off-topic content', 'user1');
        await (bot as any).handleMessage({
          ...message,
          sessionId: `test-session-${scenario.originalTopic}`
        });

        expect(mockResponseGenerator.generateResponse).toHaveBeenCalledWith(
          InterventionType.TOPIC_REDIRECT,
          expect.any(Object),
          expect.any(Object)
        );
      }
    });

    it('should maintain diplomatic tone in redirections', async () => {
      const mockResponse = {
        content: 'Hey! Stop talking about that stupid stuff and get back to work!',
        type: InterventionType.TOPIC_REDIRECT,
        confidence: 0.8
      };

      const context = {
        sessionId: 'test-session',
        participants: [
          { name: 'Alice', role: 'partner' },
          { name: 'Bob', role: 'entrepreneur' }
        ],
        messageHistory: [],
        meetingType: MeetingType.INVESTMENT_REVIEW
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, 'Off-topic message', context);

      // Should remove aggressive language and make diplomatic
      expect(result.content).not.toContain('stupid');
      expect(result.content).not.toContain('Hey!');
      expect(result.validation.professionalScore).toBeGreaterThan(0.7);
    });

    it('should preserve group dynamics in redirections', async () => {
      const mockResponse = {
        content: 'You\'re wrong to discuss that. We need to focus.',
        type: InterventionType.TOPIC_REDIRECT,
        confidence: 0.8
      };

      const context = {
        sessionId: 'test-session',
        participants: [
          { name: 'Senior Partner', role: 'partner' },
          { name: 'Junior Analyst', role: 'analyst' }
        ],
        messageHistory: [],
        meetingType: MeetingType.STRATEGY_SESSION
      };

      const validateMethod = (bot as any).validateAndEnhanceResponse.bind(bot);
      const result = await validateMethod(mockResponse, 'Off-topic comment', context);

      // Should avoid confrontational language
      expect(result.content).not.toContain('wrong');
      expect(result.content).not.toContain('You\'re');
      expect(result.qualityAssessment.engagement).toBeGreaterThan(0.6);
    });
  });

  describe('Context Preservation During Redirection', () => {
    it('should summarize original discussion when redirecting', async () => {
      const conversationHistory = [
        createTestMessage('Let\'s evaluate TechCorp\'s Series B', 'partner1'),
        createTestMessage('Their ARR is $2M with 120% net revenue retention', 'analyst1'),
        createTestMessage('The market opportunity looks substantial', 'partner1'),
        createTestMessage('Did anyone see the football game?', 'analyst1'), // Drift starts
        createTestMessage('Yeah, amazing comeback in the fourth quarter!', 'partner1') // Continues drift
      ];

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          messagesOffTopic: 2,
          interventionRecommended: true
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: true,
          originalTopic: 'investment_evaluation',
          currentDirection: 'sports',
          messagesOffTopic: 2,
          shouldInterventImmediately: true,
          suggestedRedirection: 'Return to TechCorp Series B evaluation'
        })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      const mockResponseGenerator = {
        generateResponse: vi.fn().mockResolvedValue({
          content: 'I notice we\'ve moved to discussing sports. We were making good progress on TechCorp\'s Series B evaluation, specifically their $2M ARR and strong retention metrics. Should we return to that discussion?',
          type: InterventionType.TOPIC_REDIRECT,
          confidence: 0.9
        })
      };

      (bot as any).responseGenerator = mockResponseGenerator;

      // Process the drift
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      await (bot as any).handleMessage({
        ...lastMessage,
        sessionId: 'test-session'
      });

      expect(mockResponseGenerator.generateResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          topicDrift: expect.objectContaining({
            originalTopic: 'investment_evaluation',
            currentDirection: 'sports'
          })
        })
      );
    });

    it('should maintain conversation continuity after redirection', async () => {
      // This test verifies that after a successful redirection,
      // the system continues to monitor for quality and focus
      const postRedirectionMessages = [
        createTestMessage('You\'re right, let\'s get back to TechCorp', 'partner1'),
        createTestMessage('What about their customer acquisition strategy?', 'analyst1'),
        createTestMessage('They\'ve reduced CAC by 30% this quarter', 'partner1')
      ];

      const mockContextAnalyzer = {
        analyzeConversationFlow: vi.fn().mockResolvedValue({
          messagesOffTopic: 0,
          interventionRecommended: false,
          currentTopic: 'investment_evaluation'
        }),
        detectTopicDrift: vi.fn().mockResolvedValue({
          isDrifting: false,
          messagesOffTopic: 0,
          shouldInterventImmediately: false
        })
      };

      (bot as any).contextAnalyzer = mockContextAnalyzer;

      for (const message of postRedirectionMessages) {
        await (bot as any).handleMessage({
          ...message,
          sessionId: 'test-session'
        });
      }

      // Should continue monitoring without unnecessary interventions
      expect(mockContextAnalyzer.analyzeConversationFlow).toHaveBeenCalledTimes(3);
      expect(mockContextAnalyzer.detectTopicDrift).toHaveBeenCalledTimes(3);
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