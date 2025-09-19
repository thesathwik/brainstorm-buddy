import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  DefaultInterventionDecisionEngine,
  ConversationState,
  UserFeedback
} from '../../src/services/InterventionDecisionEngine';
import { 
  ConversationContext,
  InterventionRecord,
  UserPreferences,
  Participant
} from '../../src/models';
import { 
  InterventionType,
  Priority,
  InterventionFrequency,
  InformationType,
  CommunicationStyle,
  ExpertiseArea,
  VCRole,
  MeetingType
} from '../../src/models/Enums';
import { FlowAnalysis } from '../../src/services/ContextAnalyzer';

describe('DefaultInterventionDecisionEngine', () => {
  let engine: DefaultInterventionDecisionEngine;
  let mockContext: ConversationContext;
  let mockAnalysis: FlowAnalysis;
  let mockUserPreferences: UserPreferences;
  let mockConversationState: ConversationState;

  beforeEach(() => {
    engine = new DefaultInterventionDecisionEngine();

    // Create mock participant
    const mockParticipant: Participant = {
      id: 'user1',
      name: 'John Doe',
      role: VCRole.PARTNER,
      preferences: {
        interventionFrequency: InterventionFrequency.MODERATE,
        preferredInformationTypes: [InformationType.MARKET_DATA],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: [ExpertiseArea.FINTECH]
      },
      engagementLevel: 0.8
    };

    // Create mock context
    mockContext = {
      sessionId: 'test-session',
      participants: [mockParticipant],
      currentTopic: 'investment_evaluation',
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      meetingType: MeetingType.INVESTMENT_REVIEW
    };

    // Create mock analysis
    mockAnalysis = {
      currentTopic: 'investment_evaluation',
      topicStability: 0.8,
      participantEngagement: {
        averageResponseTime: 30000,
        messageFrequency: 2.5,
        participationBalance: 0.8
      },
      conversationMomentum: {
        direction: 'stable',
        strength: 0.6
      }
    };

    // Create mock user preferences
    mockUserPreferences = {
      interventionFrequency: InterventionFrequency.MODERATE,
      preferredInformationTypes: [InformationType.MARKET_DATA, InformationType.COMPANY_INFO],
      communicationStyle: CommunicationStyle.CONVERSATIONAL,
      topicExpertise: [ExpertiseArea.FINTECH, ExpertiseArea.ENTERPRISE_SOFTWARE]
    };

    // Create mock conversation state
    mockConversationState = {
      isActive: true,
      lastMessageTime: new Date(),
      pauseDuration: 2000,
      currentSpeaker: 'user1'
    };
  });

  describe('shouldIntervene', () => {
    it('should not intervene when topic is stable and no issues detected', () => {
      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(false);
      expect(decision.confidence).toBe(0);
      expect(decision.reasoning).toContain('No intervention scenarios identified');
    });

    it('should suggest topic redirect when topic stability is low', () => {
      mockAnalysis.topicStability = 0.3; // Low stability indicates drift
      
      // Add some messages to meet minimum threshold
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'Let\'s talk about the weather', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'Yes, it\'s quite nice today', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'Did you see the game last night?', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(true);
      expect(decision.interventionType).toBe(InterventionType.TOPIC_REDIRECT);
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.reasoning).toContain('Topic instability');
    });

    it('should suggest information provide when information keywords are detected', () => {
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'What is the market size for this company?', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'I need to see the revenue numbers', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'Do we have data on their competition?', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(true);
      expect(decision.interventionType).toBe(InterventionType.INFORMATION_PROVIDE);
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.reasoning).toContain('Information needs detected');
    });

    it('should suggest fact check when claims are made', () => {
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'According to studies, this market is growing at 50% annually', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'I heard they have 80% market share', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'Statistics show their revenue is $100M', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(true);
      expect(decision.interventionType).toBe(InterventionType.FACT_CHECK);
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.reasoning).toContain('factual claims');
    });

    it('should suggest clarification when confusion is detected', () => {
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'I\'m confused about their business model', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'Can you clarify what you mean?', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'I don\'t understand the revenue model', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      mockAnalysis.participantEngagement.participationBalance = 0.3; // Low balance indicates confusion

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(true);
      expect(decision.interventionType).toBe(InterventionType.CLARIFICATION_REQUEST);
      expect(decision.confidence).toBeGreaterThan(0.4);
      expect(decision.reasoning).toContain('confusion');
    });

    it('should suggest summary for long conversations', () => {
      // Create a long conversation
      mockContext.messageHistory = Array.from({ length: 25 }, (_, i) => ({
        originalMessage: { 
          id: `msg-${i}`, 
          userId: `user${i % 2 + 1}`, 
          content: `Message ${i} about investment topics`, 
          timestamp: new Date(Date.now() - (25 - i) * 60000) 
        },
        extractedEntities: [],
        sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 },
        topicClassification: [{ category: 'investment_evaluation', confidence: 0.8 }],
        urgencyLevel: 'low' as any
      }));

      mockContext.startTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(true);
      expect(decision.interventionType).toBe(InterventionType.SUMMARY_OFFER);
      expect(decision.confidence).toBeGreaterThan(0.5);
      expect(decision.reasoning).toContain('Long conversation');
    });

    it('should not intervene if intervention limit is exceeded', () => {
      // Add many recent interventions
      const recentInterventions: InterventionRecord[] = Array.from({ length: 15 }, (_, i) => ({
        id: `intervention-${i}`,
        timestamp: new Date(Date.now() - i * 60000), // Last 15 minutes
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: 'test',
        response: 'test response'
      }));

      mockContext.interventionHistory = recentInterventions;
      mockAnalysis.topicStability = 0.2; // Should trigger intervention normally

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(false);
      expect(decision.reasoning).toContain('Intervention limit exceeded');
    });

    it('should not intervene if too soon since last intervention', () => {
      // Add recent intervention
      mockContext.interventionHistory = [{
        id: 'recent-intervention',
        timestamp: new Date(Date.now() - 30000), // 30 seconds ago
        type: InterventionType.TOPIC_REDIRECT,
        trigger: 'test',
        response: 'test response'
      }];

      mockAnalysis.topicStability = 0.2; // Should trigger intervention normally

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(false);
      expect(decision.reasoning).toContain('Too soon since last intervention');
    });

    it('should respect user intervention frequency preferences', () => {
      mockUserPreferences.interventionFrequency = InterventionFrequency.MINIMAL;
      
      // Add some interventions that would exceed minimal threshold
      mockContext.interventionHistory = Array.from({ length: 5 }, (_, i) => ({
        id: `intervention-${i}`,
        timestamp: new Date(Date.now() - i * 10 * 60000), // Last 50 minutes
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: 'test',
        response: 'test response'
      }));

      mockAnalysis.topicStability = 0.2; // Should trigger intervention normally

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(false);
      expect(decision.reasoning).toContain('Intervention limit exceeded');
    });
  });

  describe('calculateInterventionTiming', () => {
    it('should return immediate timing for no intervention decision', () => {
      const noInterventionDecision = {
        shouldRespond: false,
        interventionType: InterventionType.CLARIFICATION_REQUEST,
        confidence: 0,
        reasoning: 'No intervention needed',
        priority: Priority.LOW
      };

      const timing = engine.calculateInterventionTiming(noInterventionDecision, mockConversationState);
      
      expect(timing.delaySeconds).toBe(0);
      expect(timing.waitForPause).toBe(false);
      expect(timing.interruptThreshold).toBe(0);
      expect(timing.reasoning).toContain('No intervention needed');
    });

    it('should calculate shorter delay for urgent interventions', () => {
      const urgentDecision = {
        shouldRespond: true,
        interventionType: InterventionType.FACT_CHECK,
        confidence: 0.9,
        reasoning: 'Urgent fact check needed',
        priority: Priority.URGENT
      };

      const timing = engine.calculateInterventionTiming(urgentDecision, mockConversationState);
      
      expect(timing.delaySeconds).toBeLessThan(3);
      expect(timing.waitForPause).toBe(false);
      expect(timing.interruptThreshold).toBeGreaterThan(0.8);
    });

    it('should calculate longer delay for low priority interventions', () => {
      const lowPriorityDecision = {
        shouldRespond: true,
        interventionType: InterventionType.SUMMARY_OFFER,
        confidence: 0.6,
        reasoning: 'Summary might be helpful',
        priority: Priority.LOW
      };

      const timing = engine.calculateInterventionTiming(lowPriorityDecision, mockConversationState);
      
      expect(timing.delaySeconds).toBeGreaterThan(8);
      expect(timing.waitForPause).toBe(true);
      expect(timing.interruptThreshold).toBeLessThan(0.5);
    });

    it('should adjust timing based on conversation activity', () => {
      const activeConversationState = {
        isActive: true,
        lastMessageTime: new Date(),
        pauseDuration: 1000, // Very short pause
        currentSpeaker: 'user1'
      };

      const mediumDecision = {
        shouldRespond: true,
        interventionType: InterventionType.INFORMATION_PROVIDE,
        confidence: 0.7,
        reasoning: 'Information needed',
        priority: Priority.MEDIUM
      };

      const timing = engine.calculateInterventionTiming(mediumDecision, activeConversationState);
      
      // Should increase delay for active conversation
      expect(timing.delaySeconds).toBeGreaterThan(4);
      expect(timing.waitForPause).toBe(true);
    });

    it('should set appropriate interrupt thresholds based on priority and confidence', () => {
      const highConfidenceDecision = {
        shouldRespond: true,
        interventionType: InterventionType.TOPIC_REDIRECT,
        confidence: 0.95,
        reasoning: 'High confidence redirect',
        priority: Priority.HIGH
      };

      const timing = engine.calculateInterventionTiming(highConfidenceDecision, mockConversationState);
      
      expect(timing.interruptThreshold).toBeGreaterThan(0.6);
      expect(timing.interruptThreshold).toBeLessThanOrEqual(1.0);
    });
  });

  describe('adaptBehaviorFromFeedback', () => {
    it('should lower intervention threshold for positive feedback', () => {
      const positiveFeedback: UserFeedback = {
        interventionId: 'test-intervention',
        rating: 5,
        comment: 'Very helpful!',
        timestamp: new Date()
      };

      const interventionHistory: InterventionRecord[] = [{
        id: 'test-intervention',
        timestamp: new Date(),
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: 'user request',
        response: 'Here is the information you requested'
      }];

      const adjustment = engine.adaptBehaviorFromFeedback(positiveFeedback, interventionHistory);
      
      expect(adjustment.interventionThreshold).toBeLessThan(0.5);
      expect(adjustment.frequencyMultiplier).toBeGreaterThan(1.0);
      expect(adjustment.reasoning).toContain('feedback rating 5/5');
    });

    it('should raise intervention threshold for negative feedback', () => {
      const negativeFeedback: UserFeedback = {
        interventionId: 'test-intervention',
        rating: 1,
        comment: 'Not helpful at all',
        timestamp: new Date()
      };

      const interventionHistory: InterventionRecord[] = [{
        id: 'test-intervention',
        timestamp: new Date(),
        type: InterventionType.TOPIC_REDIRECT,
        trigger: 'topic drift',
        response: 'Let\'s get back on topic'
      }];

      const adjustment = engine.adaptBehaviorFromFeedback(negativeFeedback, interventionHistory);
      
      expect(adjustment.interventionThreshold).toBeGreaterThan(0.5);
      expect(adjustment.frequencyMultiplier).toBeLessThan(1.0);
      expect(adjustment.reasoning).toContain('feedback rating 1/5');
    });

    it('should maintain neutral adjustments for moderate feedback', () => {
      const neutralFeedback: UserFeedback = {
        interventionId: 'test-intervention',
        rating: 3,
        comment: 'Okay, I guess',
        timestamp: new Date()
      };

      const interventionHistory: InterventionRecord[] = [{
        id: 'test-intervention',
        timestamp: new Date(),
        type: InterventionType.CLARIFICATION_REQUEST,
        trigger: 'confusion detected',
        response: 'Can I help clarify something?'
      }];

      const adjustment = engine.adaptBehaviorFromFeedback(neutralFeedback, interventionHistory);
      
      expect(adjustment.frequencyMultiplier).toBe(1.0);
      expect(adjustment.reasoning).toContain('feedback rating 3/5');
    });

    it('should return default adjustment when intervention not found', () => {
      const feedback: UserFeedback = {
        interventionId: 'non-existent-intervention',
        rating: 4,
        timestamp: new Date()
      };

      const interventionHistory: InterventionRecord[] = [{
        id: 'different-intervention',
        timestamp: new Date(),
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: 'test',
        response: 'test response'
      }];

      const adjustment = engine.adaptBehaviorFromFeedback(feedback, interventionHistory);
      
      expect(adjustment.reasoning).toContain('Intervention not found');
      expect(adjustment.frequencyMultiplier).toBe(1.0);
      expect(adjustment.preferredTypes).toEqual(Object.values(InterventionType));
    });

    it('should calculate preferred intervention types based on feedback history', () => {
      const feedback: UserFeedback = {
        interventionId: 'test-intervention',
        rating: 5,
        timestamp: new Date()
      };

      const interventionHistory: InterventionRecord[] = [
        {
          id: 'test-intervention',
          timestamp: new Date(),
          type: InterventionType.INFORMATION_PROVIDE,
          trigger: 'test',
          response: 'test response',
          userReaction: { type: 'positive', timestamp: new Date() }
        },
        {
          id: 'another-intervention',
          timestamp: new Date(),
          type: InterventionType.TOPIC_REDIRECT,
          trigger: 'test',
          response: 'test response',
          userReaction: { type: 'negative', timestamp: new Date() }
        }
      ];

      const adjustment = engine.adaptBehaviorFromFeedback(feedback, interventionHistory);
      
      expect(adjustment.preferredTypes).toContain(InterventionType.INFORMATION_PROVIDE);
      expect(adjustment.preferredTypes).not.toContain(InterventionType.TOPIC_REDIRECT);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty message history gracefully', () => {
      mockContext.messageHistory = [];
      
      const decision = engine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      expect(decision.shouldRespond).toBe(false);
    });

    it('should handle missing user preferences gracefully', () => {
      const emptyPreferences: UserPreferences = {
        interventionFrequency: InterventionFrequency.MODERATE,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: []
      };

      mockAnalysis.topicStability = 0.3; // Should trigger intervention
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'test message', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'another message', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'third message', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      const decision = engine.shouldIntervene(mockContext, mockAnalysis, emptyPreferences);
      
      // Should still be able to make decisions
      expect(typeof decision.shouldRespond).toBe('boolean');
      expect(typeof decision.confidence).toBe('number');
    });

    it('should handle custom thresholds in constructor', () => {
      const customEngine = new DefaultInterventionDecisionEngine({
        topicDriftThreshold: 0.3,
        confidenceThreshold: 0.8
      });

      mockAnalysis.topicStability = 0.5; // Would normally trigger with default thresholds
      mockContext.messageHistory = [
        { originalMessage: { id: '1', userId: 'user1', content: 'test', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '2', userId: 'user2', content: 'test', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any },
        { originalMessage: { id: '3', userId: 'user1', content: 'test', timestamp: new Date() }, extractedEntities: [], sentiment: { overall: 0.5, positive: 0.5, negative: 0.5, neutral: 0.5 }, topicClassification: [], urgencyLevel: 'low' as any }
      ];

      const decision = customEngine.shouldIntervene(mockContext, mockAnalysis, mockUserPreferences);
      
      // With higher confidence threshold, should be more conservative
      expect(decision.shouldRespond).toBe(false);
    });
  });
});