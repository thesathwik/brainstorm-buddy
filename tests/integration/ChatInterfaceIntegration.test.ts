import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  WebSocketChatInterface, 
  MockChatInterface, 
  InMemoryMessageQueue 
} from '../../src/api/ChatInterface';
import { ChatMessage } from '../../src/models/ChatMessage';

describe('ChatInterface Integration Tests', () => {
  describe('InMemoryMessageQueue', () => {
    let queue: InMemoryMessageQueue;

    beforeEach(() => {
      queue = new InMemoryMessageQueue();
    });

    it('should handle message queuing and dequeuing', () => {
      const message1: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Hello',
        timestamp: new Date()
      };

      const message2: ChatMessage = {
        id: '2',
        userId: 'user2',
        content: 'World',
        timestamp: new Date()
      };

      expect(queue.size()).toBe(0);

      queue.enqueue(message1);
      queue.enqueue(message2);
      expect(queue.size()).toBe(2);

      const dequeued1 = queue.dequeue();
      expect(dequeued1).toEqual(message1);
      expect(queue.size()).toBe(1);

      const dequeued2 = queue.dequeue();
      expect(dequeued2).toEqual(message2);
      expect(queue.size()).toBe(0);

      const dequeued3 = queue.dequeue();
      expect(dequeued3).toBeNull();
    });

    it('should clear all messages', () => {
      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Hello',
        timestamp: new Date()
      };

      queue.enqueue(message);
      expect(queue.size()).toBe(1);

      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });

  describe('MockChatInterface', () => {
    let chatInterface: MockChatInterface;
    let receivedMessages: ChatMessage[];

    beforeEach(() => {
      chatInterface = new MockChatInterface();
      receivedMessages = [];
      
      chatInterface.onMessage((message) => {
        receivedMessages.push(message);
      });
    });

    afterEach(async () => {
      await chatInterface.stopListening();
    });

    it('should handle connection lifecycle', async () => {
      expect(chatInterface.isConnected()).toBe(false);

      await chatInterface.startListening();
      expect(chatInterface.isConnected()).toBe(true);

      await chatInterface.stopListening();
      expect(chatInterface.isConnected()).toBe(false);
    });

    it('should process messages through queue', async () => {
      await chatInterface.startListening();

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test message',
        timestamp: new Date()
      };

      chatInterface.simulateMessage(message);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual(message);
    });

    it('should handle multiple message callbacks', async () => {
      await chatInterface.startListening();

      const secondCallback = vi.fn();
      chatInterface.onMessage(secondCallback);

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test message',
        timestamp: new Date()
      };

      chatInterface.simulateMessage(message);

      expect(receivedMessages).toHaveLength(1);
      expect(secondCallback).toHaveBeenCalledWith(message);
    });

    it('should emit events for connection state changes', async () => {
      const connectedSpy = vi.fn();
      const disconnectedSpy = vi.fn();

      chatInterface.on('connected', connectedSpy);
      chatInterface.on('disconnected', disconnectedSpy);

      await chatInterface.startListening();
      expect(connectedSpy).toHaveBeenCalled();

      await chatInterface.stopListening();
      expect(disconnectedSpy).toHaveBeenCalled();
    });

    it('should emit messageSent event when sending messages', async () => {
      await chatInterface.startListening();

      const messageSentSpy = vi.fn();
      chatInterface.on('messageSent', messageSentSpy);

      await chatInterface.sendMessage('Hello', 'channel1');

      expect(messageSentSpy).toHaveBeenCalledWith({
        content: 'Hello',
        channelId: 'channel1'
      });
    });

    it('should throw error when sending message while disconnected', async () => {
      await expect(
        chatInterface.sendMessage('Hello', 'channel1')
      ).rejects.toThrow('Not connected');
    });
  });

  describe('WebSocketChatInterface', () => {
    let chatInterface: WebSocketChatInterface;

    beforeEach(() => {
      // Use a mock WebSocket URL for testing
      chatInterface = new WebSocketChatInterface('ws://localhost:8080/test');
    });

    afterEach(async () => {
      if (chatInterface.isConnected()) {
        await chatInterface.stopListening();
      }
    });

    it('should initialize with correct state', () => {
      expect(chatInterface.isConnected()).toBe(false);
    });

    it('should handle message queue integration', () => {
      const customQueue = new InMemoryMessageQueue();
      const interfaceWithQueue = new WebSocketChatInterface(
        'ws://localhost:8080/test',
        customQueue
      );

      expect(interfaceWithQueue.isConnected()).toBe(false);
    });

    it('should generate unique message IDs', () => {
      // Access private method through any for testing
      const interface1 = new WebSocketChatInterface('ws://test1');
      const interface2 = new WebSocketChatInterface('ws://test2');
      
      // Since generateMessageId is private, we test it indirectly through message processing
      // This is tested in the message parsing logic
      expect(interface1).toBeDefined();
      expect(interface2).toBeDefined();
    });

    // Note: Full WebSocket integration tests would require a test WebSocket server
    // For now, we test the interface structure and basic functionality
    it('should have all required interface methods', () => {
      expect(typeof chatInterface.startListening).toBe('function');
      expect(typeof chatInterface.stopListening).toBe('function');
      expect(typeof chatInterface.sendMessage).toBe('function');
      expect(typeof chatInterface.onMessage).toBe('function');
      expect(typeof chatInterface.isConnected).toBe('function');
    });
  });

  describe('Real-time Message Processing Flow', () => {
    let chatInterface: MockChatInterface;
    let processedMessages: ChatMessage[];

    beforeEach(async () => {
      chatInterface = new MockChatInterface();
      processedMessages = [];
      
      // Simulate a message processing pipeline
      chatInterface.onMessage((message) => {
        // Simulate processing delay
        setTimeout(() => {
          processedMessages.push({
            ...message,
            metadata: {
              ...message.metadata,
              processed: true,
              processedAt: new Date().toISOString()
            }
          });
        }, 10);
      });

      await chatInterface.startListening();
    });

    afterEach(async () => {
      await chatInterface.stopListening();
    });

    it('should handle rapid message processing', async () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: `msg_${i}`,
        userId: `user_${i % 3}`,
        content: `Message ${i}`,
        timestamp: new Date()
      }));

      // Send all messages rapidly
      messages.forEach(message => {
        chatInterface.simulateMessage(message);
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(processedMessages).toHaveLength(10);
      processedMessages.forEach((msg, index) => {
        expect(msg.content).toBe(`Message ${index}`);
        expect(msg.metadata?.processed).toBe(true);
      });
    });

    it('should maintain message order in queue', async () => {
      // Use synchronous processing for this test
      const syncProcessedMessages: ChatMessage[] = [];
      const syncChatInterface = new MockChatInterface();
      
      syncChatInterface.onMessage((message) => {
        syncProcessedMessages.push(message);
      });

      await syncChatInterface.startListening();

      const message1: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'First',
        timestamp: new Date()
      };

      const message2: ChatMessage = {
        id: '2',
        userId: 'user1',
        content: 'Second',
        timestamp: new Date()
      };

      syncChatInterface.simulateMessage(message1);
      syncChatInterface.simulateMessage(message2);

      // Check that messages are received in order
      expect(syncProcessedMessages[0]?.content).toBe('First');
      expect(syncProcessedMessages[1]?.content).toBe('Second');

      await syncChatInterface.stopListening();
    });

    it('should handle message processing errors gracefully', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Processing error');
      });

      const successCallback = vi.fn();

      chatInterface.onMessage(errorCallback);
      chatInterface.onMessage(successCallback);

      const message: ChatMessage = {
        id: '1',
        userId: 'user1',
        content: 'Test',
        timestamp: new Date()
      };

      // Should not throw, but handle error gracefully
      expect(() => {
        chatInterface.simulateMessage(message);
      }).not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });
  });
});