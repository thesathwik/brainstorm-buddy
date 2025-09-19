import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultMessageProcessor } from '../../src/services/MessageProcessor';
import { GeminiApiClient } from '../../src/api/GeminiApiClient';
import { ChatMessage } from '../../src/models/ChatMessage';
import { UrgencyLevel } from '../../src/models/Enums';

// Mock the GeminiApiClient
const mockGeminiClient: GeminiApiClient = {
  analyzeText: vi.fn(),
  generateResponse: vi.fn(),
  isHealthy: vi.fn()
};

describe('DefaultMessageProcessor', () => {
  let processor: DefaultMessageProcessor;
  let mockAnalyzeText: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeText = mockGeminiClient.analyzeText as any;
    processor = new DefaultMessageProcessor(mockGeminiClient);
  });

  describe('processMessage', () => {
    const sampleMessage: ChatMessage = {
      id: 'msg-1',
      userId: 'user-1',
      content: 'We should invest in Apple Inc. The company shows 15% growth.',
      timestamp: new Date('2024-01-01T10:00:00Z')
    };

    it('should process message with Gemini API successfully', async () => {
      // Mock Gemini responses
      mockAnalyzeText
        .mockResolvedValueOnce({ // entities
          content: '[{"type": "company", "value": "Apple Inc", "confidence": 0.9}]',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({ // sentiment
          content: '{"positive": 0.7, "negative": 0.1, "neutral": 0.2, "overall": 0.6}',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        })
        .mockResolvedValueOnce({ // topics
          content: '[{"category": "investment_analysis", "confidence": 0.8, "keywords": ["invest", "growth"]}]',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 5 }
        });

      const result = await processor.processMessage(sampleMessage);

      expect(result.originalMessage).toBe(sampleMessage);
      expect(result.extractedEntities).toHaveLength(1);
      expect(result.extractedEntities[0].type).toBe('company');
      expect(result.extractedEntities[0].value).toBe('Apple Inc');
      expect(result.sentiment.positive).toBe(0.7);
      expect(result.topicClassification[0].category).toBe('investment_analysis');
      expect(result.urgencyLevel).toBe(UrgencyLevel.LOW);
    });

    it('should fallback to basic processing when Gemini API fails', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error'));

      const result = await processor.processMessage(sampleMessage);

      expect(result.originalMessage).toBe(sampleMessage);
      expect(result.extractedEntities).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.topicClassification).toBeDefined();
      expect(result.urgencyLevel).toBeDefined();
    });

    it('should extract basic entities when API fails', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error'));

      const messageWithEntities: ChatMessage = {
        ...sampleMessage,
        content: 'Apple Inc shows $1.2B revenue and 15% growth'
      };

      const result = await processor.processMessage(messageWithEntities);

      expect(result.extractedEntities.length).toBeGreaterThan(0);
      expect(result.extractedEntities.some(e => e.type === 'company')).toBe(true);
      expect(result.extractedEntities.some(e => e.type === 'financial')).toBe(true);
    });

    it('should determine urgency level correctly', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const urgentMessage: ChatMessage = {
        ...sampleMessage,
        content: 'URGENT: We need to make this investment decision immediately!'
      };

      const result = await processor.processMessage(urgentMessage);
      expect(result.urgencyLevel).toBe(UrgencyLevel.HIGH);
    });

    it('should handle malformed Gemini responses gracefully', async () => {
      mockAnalyzeText
        .mockResolvedValueOnce({ content: 'invalid json', confidence: 0.5, usage: {} })
        .mockResolvedValueOnce({ content: 'invalid json', confidence: 0.5, usage: {} })
        .mockResolvedValueOnce({ content: 'invalid json', confidence: 0.5, usage: {} });

      const result = await processor.processMessage(sampleMessage);

      expect(result).toBeDefined();
      expect(result.extractedEntities).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.topicClassification).toBeDefined();
    });
  });

  describe('maintainConversationHistory', () => {
    it('should create conversation context from messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          userId: 'user-1',
          content: 'Hello',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          id: 'msg-2',
          userId: 'user-2',
          content: 'Hi there',
          timestamp: new Date('2024-01-01T10:01:00Z')
        }
      ];

      const context = processor.maintainConversationHistory(messages);

      expect(context.sessionId).toMatch(/^session_/);
      expect(context.participants).toHaveLength(2);
      expect(context.participants[0].id).toBe('user-1');
      expect(context.participants[1].id).toBe('user-2');
      expect(context.startTime).toEqual(messages[0].timestamp);
      expect(context.currentTopic).toBeDefined();
    });

    it('should handle empty message array', () => {
      const context = processor.maintainConversationHistory([]);

      expect(context.participants).toHaveLength(0);
      expect(context.currentTopic).toBe('No topic identified');
    });

    it('should infer topics from message content', () => {
      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          userId: 'user-1',
          content: 'Let\'s discuss the investment opportunity',
          timestamp: new Date()
        }
      ];

      const context = processor.maintainConversationHistory(messages);
      expect(context.currentTopic).toBe('Investment Discussion');
    });
  });

  describe('detectConversationPauses', () => {
    it('should return false when no messages have been processed', () => {
      const result = processor.detectConversationPauses();
      expect(result).toBe(false);
    });

    it('should return false for recent messages', async () => {
      const recentMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Recent message',
        timestamp: new Date()
      };

      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback
      await processor.processMessage(recentMessage);

      const result = processor.detectConversationPauses();
      expect(result).toBe(false);
    });

    it('should return true for old messages', async () => {
      const oldMessage: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Old message',
        timestamp: new Date(Date.now() - 15000) // 15 seconds ago
      };

      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback
      await processor.processMessage(oldMessage);

      const result = processor.detectConversationPauses();
      expect(result).toBe(true);
    });
  });

  describe('basic entity extraction', () => {
    it('should extract company names', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Apple Inc and Microsoft Corp are great companies',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      const companyEntities = result.extractedEntities.filter(e => e.type === 'company');
      
      expect(companyEntities.length).toBeGreaterThan(0);
      expect(companyEntities.some(e => e.value.includes('Apple Inc'))).toBe(true);
    });

    it('should extract financial terms', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'The valuation is $500M with 25% growth',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      const financialEntities = result.extractedEntities.filter(e => e.type === 'financial');
      
      expect(financialEntities.length).toBeGreaterThan(0);
    });
  });

  describe('basic sentiment analysis', () => {
    it('should detect positive sentiment', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'This is excellent news with great growth potential',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.sentiment.overall).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'This is bad news with poor performance and high risk',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.sentiment.overall).toBeLessThan(0);
    });

    it('should handle neutral sentiment', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'The meeting is scheduled for tomorrow',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.sentiment.neutral).toBeGreaterThan(0.5);
    });
  });

  describe('basic topic classification', () => {
    it('should classify investment topics', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Let\'s discuss the investment valuation and funding round',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.topicClassification.some(t => t.category === 'investment_analysis')).toBe(true);
    });

    it('should classify market topics', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'The market trends show strong competition in this sector',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.topicClassification.some(t => t.category === 'market_research')).toBe(true);
    });

    it('should classify off-topic messages', async () => {
      mockAnalyzeText.mockRejectedValue(new Error('API Error')); // Force fallback

      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'What did you have for lunch today?',
        timestamp: new Date()
      };

      const result = await processor.processMessage(message);
      expect(result.topicClassification.some(t => t.category === 'off_topic')).toBe(true);
    });
  });
});