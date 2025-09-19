import { describe, it, expect, beforeEach } from 'vitest';
import { LearningModule } from '../../src/services/LearningModule';
import {
  UserReaction,
  UserReactionType,
  ConversationOutcome,
  InterventionRecord
} from '../../src/models/LearningModels';
import { InterventionType } from '../../src/models/Enums';
import { BehaviorAdjustment } from '../../src/models/InterventionDecision';

describe('LearningModule Integration', () => {
  let learningModule: LearningModule;

  beforeEach(() => {
    learningModule = new LearningModule();
  });

  it('should provide behavior adaptation based on intervention history', () => {
    // Simulate a series of interventions with mixed outcomes
    const interventions: InterventionRecord[] = [];
    
    // Create some intervention records
    for (let i = 0; i < 5; i++) {
      const intervention: InterventionRecord = {
        id: `integration_test_${i}`,
        timestamp: new Date(),
        type: InterventionType.TOPIC_REDIRECT,
        trigger: `Test trigger ${i}`,
        response: `Test response ${i}`,
        conversationId: 'test_conv',
        userId: 'test_user'
      };
      
      interventions.push(intervention);
      
      // Simulate different user reactions
      const reaction: UserReaction = {
        type: i < 3 ? UserReactionType.POSITIVE : UserReactionType.NEGATIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.8
      };
      
      const outcome = i < 3 ? ConversationOutcome.PROVIDED_VALUE : ConversationOutcome.DISRUPTED_FLOW;
      
      // Record the intervention outcome
      learningModule.recordInterventionOutcome(intervention, reaction, outcome);
    }

    // Test that learning module can provide behavior adjustments
    const positiveReaction: UserReaction = {
      type: UserReactionType.POSITIVE,
      timestamp: new Date(),
      explicit: true,
      confidence: 0.9
    };

    const behaviorAdjustment = learningModule.adaptBehaviorFromFeedback(
      positiveReaction,
      interventions
    );

    expect(behaviorAdjustment).toBeDefined();
    expect(behaviorAdjustment.frequencyMultiplier).toBeGreaterThan(1.0);
    expect(behaviorAdjustment.interventionThreshold).toBeLessThan(0.7);
    expect(behaviorAdjustment.preferredTypes.length).toBeGreaterThan(0);

    // Test that thresholds are updated based on history
    const thresholds = learningModule.updateInterventionThresholds('test_user');
    expect(thresholds).toBeDefined();
    expect(thresholds.typePreferences.size).toBeGreaterThan(0);
  });

  it('should provide meaningful patterns for decision making', () => {
    // Create a pattern of successful interventions
    const successfulPattern = 'market discussion needs data';
    
    for (let i = 0; i < 4; i++) {
      const intervention: InterventionRecord = {
        id: `pattern_${i}`,
        timestamp: new Date(),
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: successfulPattern,
        response: 'Here is the relevant market data...',
        conversationId: `conv_${i}`,
        userId: 'pattern_user'
      };

      const reaction: UserReaction = {
        type: UserReactionType.POSITIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.9
      };

      learningModule.recordInterventionOutcome(
        intervention,
        reaction,
        ConversationOutcome.PROVIDED_VALUE
      );
    }

    // Get identified patterns
    const patterns = learningModule.identifySuccessPatterns();
    expect(patterns.length).toBeGreaterThan(0);

    const relevantPattern = patterns.find(p => 
      p.interventionTypes.includes(InterventionType.INFORMATION_PROVIDE)
    );
    
    expect(relevantPattern).toBeDefined();
    expect(relevantPattern!.successRate).toBeGreaterThan(0.8);
    expect(relevantPattern!.confidence).toBeGreaterThan(0.3);
  });

  it('should handle real-world learning scenarios', () => {
    const userId = 'real_world_user';
    
    // Simulate a realistic learning scenario over time
    const scenarios = [
      {
        type: InterventionType.TOPIC_REDIRECT,
        trigger: 'conversation about weekend plans',
        reaction: UserReactionType.POSITIVE,
        outcome: ConversationOutcome.IMPROVED_FOCUS
      },
      {
        type: InterventionType.INFORMATION_PROVIDE,
        trigger: 'discussion about startup valuation',
        reaction: UserReactionType.ACKNOWLEDGED,
        outcome: ConversationOutcome.PROVIDED_VALUE
      },
      {
        type: InterventionType.FACT_CHECK,
        trigger: 'claim about market size',
        reaction: UserReactionType.POSITIVE,
        outcome: ConversationOutcome.PROVIDED_VALUE
      },
      {
        type: InterventionType.CLARIFICATION_REQUEST,
        trigger: 'unclear investment terms',
        reaction: UserReactionType.IGNORED,
        outcome: ConversationOutcome.NO_IMPACT
      },
      {
        type: InterventionType.SUMMARY_OFFER,
        trigger: 'long discussion without conclusion',
        reaction: UserReactionType.NEGATIVE,
        outcome: ConversationOutcome.DISRUPTED_FLOW
      }
    ];

    // Record all scenarios
    scenarios.forEach((scenario, index) => {
      const intervention: InterventionRecord = {
        id: `scenario_${index}`,
        timestamp: new Date(Date.now() + index * 60000), // Spread over time
        type: scenario.type,
        trigger: scenario.trigger,
        response: `Response for ${scenario.type}`,
        conversationId: `scenario_conv_${index}`,
        userId
      };

      const reaction: UserReaction = {
        type: scenario.reaction,
        timestamp: new Date(),
        explicit: scenario.reaction !== UserReactionType.IGNORED,
        confidence: scenario.reaction === UserReactionType.IGNORED ? 0.6 : 0.8
      };

      learningModule.recordInterventionOutcome(intervention, reaction, scenario.outcome);
    });

    // Verify learning outcomes
    const userMetrics = learningModule.getUserMetrics(userId);
    expect(userMetrics).toBeDefined();
    expect(userMetrics!.totalInterventions).toBe(5);
    expect(userMetrics!.successRate).toBeGreaterThan(0);
    expect(userMetrics!.averageEffectiveness).toBeGreaterThan(0);

    // Test threshold adaptation
    const thresholds = learningModule.updateInterventionThresholds(userId);
    expect(thresholds.typePreferences.get(InterventionType.TOPIC_REDIRECT)).toBeGreaterThan(0.5);
    expect(thresholds.typePreferences.get(InterventionType.SUMMARY_OFFER)).toBeLessThan(0.7);

    // Test behavior adaptation for different feedback types
    const positiveAdjustment = learningModule.adaptBehaviorFromFeedback(
      { type: UserReactionType.POSITIVE, timestamp: new Date(), explicit: true, confidence: 0.9 },
      []
    );
    expect(positiveAdjustment.frequencyMultiplier).toBeGreaterThan(1.0);

    const negativeAdjustment = learningModule.adaptBehaviorFromFeedback(
      { type: UserReactionType.NEGATIVE, timestamp: new Date(), explicit: true, confidence: 0.9 },
      []
    );
    expect(negativeAdjustment.frequencyMultiplier).toBeLessThan(1.0);
  });

  it('should maintain consistency across multiple users', () => {
    const users = ['user_a', 'user_b', 'user_c'];
    
    // Create different learning patterns for each user
    users.forEach((userId, userIndex) => {
      for (let i = 0; i < 3; i++) {
        const intervention: InterventionRecord = {
          id: `multi_user_${userId}_${i}`,
          timestamp: new Date(),
          type: InterventionType.INFORMATION_PROVIDE,
          trigger: `User ${userId} scenario ${i}`,
          response: `Response for ${userId}`,
          conversationId: `conv_${userId}_${i}`,
          userId
        };

        // Different users have different success patterns
        const reactionType = userIndex === 0 ? UserReactionType.POSITIVE :
                           userIndex === 1 ? UserReactionType.NEUTRAL :
                           UserReactionType.NEGATIVE;

        const reaction: UserReaction = {
          type: reactionType,
          timestamp: new Date(),
          explicit: true,
          confidence: 0.8
        };

        const outcome = userIndex === 0 ? ConversationOutcome.PROVIDED_VALUE :
                       userIndex === 1 ? ConversationOutcome.NO_IMPACT :
                       ConversationOutcome.DISRUPTED_FLOW;

        learningModule.recordInterventionOutcome(intervention, reaction, outcome);
      }
    });

    // Verify each user has different metrics
    const metricsA = learningModule.getUserMetrics('user_a');
    const metricsB = learningModule.getUserMetrics('user_b');
    const metricsC = learningModule.getUserMetrics('user_c');

    expect(metricsA).toBeDefined();
    expect(metricsB).toBeDefined();
    expect(metricsC).toBeDefined();

    // User A should have highest success rate, User C should have lowest
    expect(metricsA!.successRate).toBeGreaterThan(metricsC!.successRate);
    // User B (neutral) should be between A and C
    expect(metricsB!.successRate).toBeGreaterThanOrEqual(metricsC!.successRate);

    // Thresholds should be adapted differently for each user
    const thresholdsA = learningModule.updateInterventionThresholds('user_a');
    const thresholdsC = learningModule.updateInterventionThresholds('user_c');

    expect(thresholdsA.interventionThreshold).toBeLessThan(thresholdsC.interventionThreshold);
  });
});