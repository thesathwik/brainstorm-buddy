import { describe, it, expect } from 'vitest';
import { ChatMessage } from '../../src/models';

describe('ChatMessage', () => {
  it('should have required properties', () => {
    const message: ChatMessage = {
      id: 'test-id',
      userId: 'user-123',
      content: 'Hello world',
      timestamp: new Date()
    };

    expect(message.id).toBe('test-id');
    expect(message.userId).toBe('user-123');
    expect(message.content).toBe('Hello world');
    expect(message.timestamp).toBeInstanceOf(Date);
  });

  it('should support optional metadata', () => {
    const message: ChatMessage = {
      id: 'test-id',
      userId: 'user-123',
      content: 'Hello world',
      timestamp: new Date(),
      metadata: {
        platform: 'slack',
        threadId: 'thread-123'
      }
    };

    expect(message.metadata?.platform).toBe('slack');
    expect(message.metadata?.threadId).toBe('thread-123');
  });
});