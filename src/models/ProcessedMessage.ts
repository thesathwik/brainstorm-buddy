import { ChatMessage } from './ChatMessage';
import { UrgencyLevel } from './Enums';

export interface Entity {
  type: string;
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  overall: number; // -1 to 1 scale
}

export interface TopicCategory {
  category: string;
  confidence: number;
  keywords: string[];
}

export interface ProcessedMessage {
  originalMessage: ChatMessage;
  extractedEntities: Entity[];
  sentiment: SentimentScore;
  topicClassification: TopicCategory[];
  urgencyLevel: UrgencyLevel;
}