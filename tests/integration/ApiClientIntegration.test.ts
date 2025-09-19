import { describe, it, expect, vi } from 'vitest';
import { DefaultGeminiApiClient } from '../../src/api/GeminiApiClient';
import { DefaultMessageProcessor } from '../../src/services/MessageProcessor';
import { ChatMessage } from '../../src/models/ChatMessage';

// Mock the Google Generative AI module for integration tests
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn(() => ({
      getGenerativeModel: vi.fn(() => ({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => '{"positive": 0.8, "negative": 0.1, "neutral": 0.1, "overall": 0.7}',
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 25
            }
          }
        })
      }))
    }))
  };
});

describe('GeminiApiClient and MessageProcessor Integration', () => {
  it('should process a message end-to-end with API client', async () => {
    const apiClient = new DefaultGeminiApiClient('test-key');
    const processor = new DefaultMessageProcessor(apiClient);

    const testMessage: ChatMessage = {
      id: 'test-msg-1',
      userId: 'test-user',
      content: 'Apple Inc shows strong growth potential with $2.5B revenue',
      timestamp: new Date()
    };

    const result = await processor.processMessage(testMessage);

    expect(result).toBeDefined();
    expect(result.originalMessage).toBe(testMessage);
    expect(result.extractedEntities).toBeDefined();
    expect(result.sentiment).toBeDefined();
    expect(result.topicClassification).toBeDefined();
    expect(result.urgencyLevel).toBeDefined();
  });

  it('should handle conversation context creation', () => {
    const apiClient = new DefaultGeminiApiClient('test-key');
    const processor = new DefaultMessageProcessor(apiClient);

    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Let\'s discuss the investment in TechCorp',
        timestamp: new Date('2024-01-01T10:00:00Z')
      },
      {
        id: 'msg-2',
        userId: 'user-2',
        content: 'The market analysis looks promising',
        timestamp: new Date('2024-01-01T10:01:00Z')
      }
    ];

    const context = processor.maintainConversationHistory(messages);

    expect(context.sessionId).toMatch(/^session_/);
    expect(context.participants).toHaveLength(2);
    expect(context.currentTopic).toBe('Investment Discussion');
    expect(context.startTime).toEqual(messages[0].timestamp);
  });

  it('should detect conversation pauses correctly', async () => {
    const apiClient = new DefaultGeminiApiClient('test-key');
    const processor = new DefaultMessageProcessor(apiClient);

    // Initially no pauses
    expect(processor.detectConversationPauses()).toBe(false);

    // Process a recent message
    const recentMessage: ChatMessage = {
      id: 'recent-msg',
      userId: 'user-1',
      content: 'Recent message',
      timestamp: new Date()
    };

    await processor.processMessage(recentMessage);
    expect(processor.detectConversationPauses()).toBe(false);
  });
});