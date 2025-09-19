export interface MessageMetadata {
  platform?: string;
  threadId?: string;
  replyToId?: string;
  attachments?: string[];
  mentions?: string[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}