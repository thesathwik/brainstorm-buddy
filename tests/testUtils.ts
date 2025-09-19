import { ProcessedMessage } from '../src/models/ProcessedMessage';
import { ChatMessage } from '../src/models/ChatMessage';
import { ConversationContext } from '../src/models/ConversationContext';
import { MeetingType, VCRole, TopicCategory, UrgencyLevel } from '../src/models/Enums';

export const createTestMessage = (
  id: string,
  userId: string,
  content: string,
  timestamp: Date = new Date(),
  topicClassification: string = 'general_discussion',
  sentiment: number = 0.5
): ProcessedMessage => {
  const chatMessage: ChatMessage = {
    id,
    userId,
    content,
    timestamp,
    metadata: {
      platform: 'test',
      messageType: 'text'
    }
  };

  return {
    originalMessage: chatMessage,
    extractedEntities: [],
    sentiment: {
      score: sentiment,
      confidence: 0.8,
      label: sentiment > 0.1 ? 'positive' : sentiment < -0.1 ? 'negative' : 'neutral'
    },
    topicClassification: [topicClassification as TopicCategory],
    urgencyLevel: UrgencyLevel.NORMAL
  };
};

export const createTestContext = (messages: ProcessedMessage[] = []): ConversationContext => ({
  sessionId: 'test-session',
  participants: [
    {
      id: 'user1',
      name: 'Test User 1',
      role: VCRole.PARTNER,
      preferences: {
        interventionFrequency: 'moderate' as any,
        preferredInformationTypes: [],
        communicationStyle: 'conversational' as any,
        topicExpertise: []
      },
      engagementLevel: 0.8
    },
    {
      id: 'user2',
      name: 'Test User 2',
      role: VCRole.ANALYST,
      preferences: {
        interventionFrequency: 'moderate' as any,
        preferredInformationTypes: [],
        communicationStyle: 'formal' as any,
        topicExpertise: []
      },
      engagementLevel: 0.7
    }
  ],
  currentTopic: 'investment_evaluation',
  agenda: [
    {
      id: 'agenda1',
      title: 'Investment Review',
      description: 'Review investment proposal',
      estimatedDuration: 30,
      priority: 'high' as any,
      status: 'in_progress' as any
    }
  ],
  messageHistory: messages,
  interventionHistory: [],
  startTime: new Date(Date.now() - 300000), // 5 minutes ago
  meetingType: MeetingType.INVESTMENT_REVIEW
});