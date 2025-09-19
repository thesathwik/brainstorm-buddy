import { ChatMessage } from '../models';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface MessageQueue {
  enqueue(message: ChatMessage): void;
  dequeue(): ChatMessage | null;
  size(): number;
  clear(): void;
}

export interface ChatInterface {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  sendMessage(content: string, channelId: string): Promise<void>;
  onMessage(callback: (message: ChatMessage) => void): void;
  isConnected(): boolean;
}

export class InMemoryMessageQueue implements MessageQueue {
  private queue: ChatMessage[] = [];

  enqueue(message: ChatMessage): void {
    this.queue.push(message);
  }

  dequeue(): ChatMessage | null {
    return this.queue.shift() || null;
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }
}

export class WebSocketChatInterface extends EventEmitter implements ChatInterface {
  private ws: WebSocket | null = null;
  private messageQueue: MessageQueue;
  private messageCallbacks: ((message: ChatMessage) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isReconnecting = false;

  constructor(
    private wsUrl: string,
    messageQueue?: MessageQueue
  ) {
    super();
    this.messageQueue = messageQueue || new InMemoryMessageQueue();
  }

  async startListening(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          console.log('WebSocket connection established');
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const messageData = JSON.parse(data.toString());
            const chatMessage: ChatMessage = {
              id: messageData.id || this.generateMessageId(),
              userId: messageData.userId || messageData.user_id || 'unknown',
              content: messageData.content || messageData.text || '',
              timestamp: messageData.timestamp ? new Date(messageData.timestamp) : new Date(),
              metadata: messageData.metadata || {}
            };

            this.messageQueue.enqueue(chatMessage);
            this.processQueuedMessages();
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          this.emit('disconnected');
          if (!this.isReconnecting) {
            this.attemptReconnect();
          }
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async stopListening(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.messageQueue.clear();
      resolve();
    });
  }

  async sendMessage(content: string, channelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const message = {
        type: 'message',
        content,
        channelId,
        timestamp: new Date().toISOString()
      };

      this.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  onMessage(callback: (message: ChatMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private processQueuedMessages(): void {
    while (this.messageQueue.size() > 0) {
      const message = this.messageQueue.dequeue();
      if (message) {
        this.messageCallbacks.forEach(callback => {
          try {
            callback(message);
          } catch (error) {
            console.error('Error in message callback:', error);
          }
        });
      }
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        await this.startListening();
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.attemptReconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Mock implementation for testing and development
export class MockChatInterface extends EventEmitter implements ChatInterface {
  private connected = false;
  private messageCallbacks: ((message: ChatMessage) => void)[] = [];
  private messageQueue: MessageQueue;

  constructor(messageQueue?: MessageQueue) {
    super();
    this.messageQueue = messageQueue || new InMemoryMessageQueue();
  }

  async startListening(): Promise<void> {
    this.connected = true;
    this.emit('connected');
  }

  async stopListening(): Promise<void> {
    this.connected = false;
    this.messageQueue.clear();
    this.emit('disconnected');
  }

  async sendMessage(content: string, channelId: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    // In mock, we just emit that a message was sent
    this.emit('messageSent', { content, channelId });
  }

  onMessage(callback: (message: ChatMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Test helper methods
  simulateMessage(message: ChatMessage): void {
    this.messageQueue.enqueue(message);
    this.messageCallbacks.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in message callback:', error);
        // Don't rethrow - handle gracefully
      }
    });
  }

  getQueueSize(): number {
    return this.messageQueue.size();
  }
}