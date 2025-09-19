import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  InMemoryMessageQueue, 
  MockChatInterface, 
  WebSocketChatInterface 
} from '../../src/api/ChatInterface';
import { ChatMessage } from '../../src/models/ChatMessage';

describe('ChatInterface Unit Tests', () => {
  describe('InMemoryMessageQueue', () => {
    let queue: InMemoryMessageQueue;

    beforeEach(() => {
      queue = new InMemoryMessageQueue();
    });

    it('should start empty', () => {
      expect(queue.size()).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });

    it('should handle FIFO ordering', () => {
      const messages: ChatMessage[] = [
        { id: '1', userId: 'user1', content: 'First', timestamp: new Date() },
        { id: '2', userId: 'user2', content: 'Second', timestamp: new Date() },
        { id: '3', userId: 'user3', content: 'Third', timestamp: new Date() }
      ];

      messages.forEach(msg => queue.enqueue(msg));
      expect(queue.size()).toBe(3);

      const dequeued = [];
      let msg;
      while ((msg = queue.dequeue()) !== null) {
        dequeued.push(msg);
      }

      expect(dequeued).toEqual(messages);
      expect(queue.size()).toBe(0);
    });

    it('should clear all messages at once', () => {
      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test',
        timestamp: new Date()
      };

      queue.enqueue(message);
      queue.enqueue(message);
      queue.enqueue(message);
      
      expect(queue.size()).toBe(3);
      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe('MockChatInterface', () => {
    let chatInterface: MockChatInterface;

    beforeEach(() => {
      chatInterface = new MockChatInterface();
    });

    afterEach(async () => {
      if (chatInterface.isConnected()) {
        await chatInterface.stopListening();
      }
    });

    it('should initialize in disconnected state', () => {
      expect(chatInterface.isConnected()).toBe(false);
    });

    it('should connect and disconnect properly', async () => {
      await chatInterface.startListening();
      expect(chatInterface.isConnected()).toBe(true);

      await chatInterface.stopListening();
      expect(chatInterface.isConnected()).toBe(false);
    });

    it('should register multiple message callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      chatInterface.onMessage(callback1);
      chatInterface.onMessage(callback2);

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test',
        timestamp: new Date()
      };

      chatInterface.simulateMessage(message);

      expect(callback1).toHaveBeenCalledWith(message);
      expect(callback2).toHaveBeenCalledWith(message);
    });

    it('should use custom message queue if provided', () => {
      const customQueue = new InMemoryMessageQueue();
      const interfaceWithQueue = new MockChatInterface(customQueue);

      expect(interfaceWithQueue.getQueueSize()).toBe(0);

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test',
        timestamp: new Date()
      };

      customQueue.enqueue(message);
      expect(interfaceWithQueue.getQueueSize()).toBe(1);
    });

    it('should emit connection events', async () => {
      const connectedSpy = vi.fn();
      const disconnectedSpy = vi.fn();

      chatInterface.on('connected', connectedSpy);
      chatInterface.on('disconnected', disconnectedSpy);

      await chatInterface.startListening();
      expect(connectedSpy).toHaveBeenCalledTimes(1);

      await chatInterface.stopListening();
      expect(disconnectedSpy).toHaveBeenCalledTimes(1);
    });

    it('should clear queue on stop', async () => {
      const customQueue = new InMemoryMessageQueue();
      const interfaceWithQueue = new MockChatInterface(customQueue);
      
      await interfaceWithQueue.startListening();

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test',
        timestamp: new Date()
      };

      // Add message directly to queue to test clearing
      customQueue.enqueue(message);
      expect(interfaceWithQueue.getQueueSize()).toBe(1);

      await interfaceWithQueue.stopListening();
      expect(interfaceWithQueue.getQueueSize()).toBe(0);
    });
  });

  describe('WebSocketChatInterface', () => {
    let chatInterface: WebSocketChatInterface;

    beforeEach(() => {
      chatInterface = new WebSocketChatInterface('ws://localhost:8080/test');
    });

    afterEach(async () => {
      if (chatInterface.isConnected()) {
        await chatInterface.stopListening();
      }
    });

    it('should initialize in disconnected state', () => {
      expect(chatInterface.isConnected()).toBe(false);
    });

    it('should accept custom message queue', () => {
      const customQueue = new InMemoryMessageQueue();
      const interfaceWithQueue = new WebSocketChatInterface(
        'ws://localhost:8080/test',
        customQueue
      );

      expect(interfaceWithQueue).toBeDefined();
      expect(interfaceWithQueue.isConnected()).toBe(false);
    });

    it('should have event emitter capabilities', () => {
      const eventSpy = vi.fn();
      chatInterface.on('test-event', eventSpy);
      chatInterface.emit('test-event', 'test-data');

      expect(eventSpy).toHaveBeenCalledWith('test-data');
    });

    it('should register message callbacks', () => {
      const callback = vi.fn();
      chatInterface.onMessage(callback);

      // We can't easily test the callback without a real WebSocket connection
      // but we can verify the method doesn't throw
      expect(() => chatInterface.onMessage(callback)).not.toThrow();
    });

    // Note: Testing actual WebSocket functionality would require a test server
    // These tests focus on the interface structure and basic functionality
  });

  describe('Message Processing Edge Cases', () => {
    let chatInterface: MockChatInterface;

    beforeEach(async () => {
      chatInterface = new MockChatInterface();
      await chatInterface.startListening();
    });

    afterEach(async () => {
      await chatInterface.stopListening();
    });

    it('should handle messages with minimal data', () => {
      const callback = vi.fn();
      chatInterface.onMessage(callback);

      const minimalMessage: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: '',
        timestamp: new Date()
      };

      chatInterface.simulateMessage(minimalMessage);
      expect(callback).toHaveBeenCalledWith(minimalMessage);
    });

    it('should handle messages with metadata', () => {
      const callback = vi.fn();
      chatInterface.onMessage(callback);

      const messageWithMetadata: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test message',
        timestamp: new Date(),
        metadata: {
          platform: 'slack',
          threadId: 'thread123',
          mentions: ['@user2', '@user3']
        }
      };

      chatInterface.simulateMessage(messageWithMetadata);
      expect(callback).toHaveBeenCalledWith(messageWithMetadata);
    });

    it('should handle rapid successive messages', () => {
      const receivedMessages: ChatMessage[] = [];
      chatInterface.onMessage((msg) => receivedMessages.push(msg));

      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg_${i}`,
        userId: `user_${i % 5}`,
        content: `Message ${i}`,
        timestamp: new Date()
      }));

      messages.forEach(msg => chatInterface.simulateMessage(msg));

      expect(receivedMessages).toHaveLength(100);
      expect(receivedMessages[0].content).toBe('Message 0');
      expect(receivedMessages[99].content).toBe('Message 99');
    });
  });
});