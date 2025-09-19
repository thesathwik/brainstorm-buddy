import { describe, it, expect, beforeEach } from 'vitest';
import { LearningModule } from '../../src/services/LearningModule';
import {
  UserReaction,
  UserReactionType,
  ConversationOutcome,
  InterventionRecord,
  FeedbackRecord,
  EffectivenessScore
} from '../../src/models/LearningModels';
import { InterventionType } from '../../src/models/Enums';

describe('LearningModule', () => {
  let learningModule: LearningModule;
  let mockIntervention: InterventionRecord;
  let mockUserReaction: UserReaction;

  beforeEach(() => {
    learningModule = new LearningModule();
    
    mockIntervention = {
      id: 'intervention_123',
      timestamp: new Date(),
      type: InterventionType.TOPIC_REDIRECT,
      trigger: 'conversation went off topic about sports',
      response: 'Let\'s get back to discussing the investment opportunity',
      conversationId: 'conv_456',
      userId: 'user_789'
    };

    mockUserReaction = {
      type: UserReactionType.POSITIVE,
      timestamp: new Date(),
      explicit: true,
      confidence: 0.9,
      context: 'User thanked the bot for keeping discussion focused'
    };
  });

  describe('recordInterventionOutcome', () => {
    it('should record intervention outcome and update metrics', () => {
      learningModule.recordInterventionOutcome(
        mockIntervention,
        mockUserReaction,
        ConversationOutcome.IMPROVED_FOCUS
      );

      const userMetrics = learningModule.getUserMetrics('user_789');
      expect(userMetrics).toBeDefined();
      expect(userMetrics!.totalInterventions).toBe(1);
      expect(userMetrics!.successRate).toBeGreaterThan(0.5);
    });

    it('should calculate effectiveness score correctly for positive outcome', () => {
      learningModule.recordInterventionOutcome(
        mockIntervention,
        mockUserReaction,
        ConversationOutcome.PROVIDED_VALUE
      );

      expect(mockIntervention.effectiveness).toBeDefined();
      expect(mockIntervention.effectiveness!.overall).toBeGreaterThan(0.5);
      expect(mockIntervention.effectiveness!.relevance).toBeGreaterThan(0.5);
    });

    it('should calculate effectiveness score correctly for negative outcome', () => {
      const negativeReaction: UserReaction = {
        type: UserReactionType.NEGATIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.8
      };

      learningModule.recordInterventionOutcome(
        mockIntervention,
        negativeReaction,
        ConversationOutcome.DISRUPTED_FLOW
      );

      expect(mockIntervention.effectiveness).toBeDefined();
      expect(mockIntervention.effectiveness!.overall).toBeLessThan(0.5);
      expect(mockIntervention.effectiveness!.timing).toBeLessThan(0.5);
    });

    it('should store feedback record correctly', () => {
      learningModule.recordInterventionOutcome(
        mockIntervention,
        mockUserReaction,
        ConversationOutcome.IMPROVED_FOCUS
      );

      // Since we can't directly access private fields, we test through behavior
      const thresholds = learningModule.updateInterventionThresholds('user_789');
      expect(thresholds).toBeDefined();
      expect(thresholds.interventionThreshold).toBeLessThanOrEqual(0.7);
    });
  });

  describe('updateInterventionThresholds', () => {
    it('should return default thresholds for new users', () => {
      const thresholds = learningModule.updateInterventionThresholds('new_user');
      
      expect(thresholds.interventionThreshold).toBe(0.7);
      expect(thresholds.confidenceThreshold).toBe(0.6);
      expect(thresholds.timingThreshold).toBe(0.5);
      expect(thresholds.typePreferences.size).toBeGreaterThan(0);
    });

    it('should lower thresholds for users with high success rate', () => {
      // Record multiple successful interventions
      for (let i = 0; i < 5; i++) {
        const intervention = {
          ...mockIntervention,
          id: `intervention_${i}`,
          timestamp: new Date()
        };
        
        learningModule.recordInterventionOutcome(
          intervention,
          mockUserReaction,
          ConversationOutcome.PROVIDED_VALUE
        );
      }

      const thresholds = learningModule.updateInterventionThresholds('user_789');
      expect(thresholds.interventionThreshold).toBeLessThan(0.7);
    });

    it('should raise thresholds for users with low success rate', () => {
      const negativeReaction: UserReaction = {
        type: UserReactionType.NEGATIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.8
      };

      // Record multiple unsuccessful interventions
      for (let i = 0; i < 5; i++) {
        const intervention = {
          ...mockIntervention,
          id: `intervention_${i}`,
          timestamp: new Date()
        };
        
        learningModule.recordInterventionOutcome(
          intervention,
          negativeReaction,
          ConversationOutcome.DISRUPTED_FLOW
        );
      }

      const thresholds = learningModule.updateInterventionThresholds('user_789');
      expect(thresholds.interventionThreshold).toBeGreaterThan(0.7);
    });

    it('should calculate type preferences based on historical effectiveness', () => {
      // Record successful fact-check intervention
      const factCheckIntervention = {
        ...mockIntervention,
        type: InterventionType.FACT_CHECK,
        id: 'fact_check_1'
      };

      learningModule.recordInterventionOutcome(
        factCheckIntervention,
        mockUserReaction,
        ConversationOutcome.PROVIDED_VALUE
      );

      const thresholds = learningModule.updateInterventionThresholds('user_789');
      const factCheckPreference = thresholds.typePreferences.get(InterventionType.FACT_CHECK);
      expect(factCheckPreference).toBeGreaterThan(0.5);
    });
  });

  describe('identifySuccessPatterns', () => {
    it('should identify patterns from successful interventions', () => {
      // Record multiple similar successful interventions
      for (let i = 0; i < 4; i++) {
        const intervention = {
          ...mockIntervention,
          id: `pattern_intervention_${i}`,
          trigger: 'conversation went off topic',
          timestamp: new Date()
        };
        
        learningModule.recordInterventionOutcome(
          intervention,
          mockUserReaction,
          ConversationOutcome.IMPROVED_FOCUS
        );
      }

      const patterns = learningModule.identifySuccessPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      
      const topPattern = patterns[0];
      expect(topPattern.successRate).toBeGreaterThan(0.6);
      expect(topPattern.interventionTypes).toContain(InterventionType.TOPIC_REDIRECT);
    });

    it('should not identify patterns with insufficient data', () => {
      // Record only 2 interventions (below minimum of 3)
      for (let i = 0; i < 2; i++) {
        const intervention = {
          ...mockIntervention,
          id: `insufficient_${i}`,
          timestamp: new Date()
        };
        
        learningModule.recordInterventionOutcome(
          intervention,
          mockUserReaction,
          ConversationOutcome.IMPROVED_FOCUS
        );
      }

      const patterns = learningModule.identifySuccessPatterns();
      expect(patterns.length).toBe(0);
    });

    it('should sort patterns by success rate and confidence', () => {
      // Create two different patterns with different success rates
      
      // Pattern 1: High success rate
      for (let i = 0; i < 4; i++) {
        const intervention = {
          ...mockIntervention,
          id: `high_success_${i}`,
          trigger: 'high success pattern',
          timestamp: new Date()
        };
        
        learningModule.recordInterventionOutcome(
          intervention,
          mockUserReaction,
          ConversationOutcome.PROVIDED_VALUE
        );
      }

      // Pattern 2: Lower success rate
      const mixedReaction: UserReaction = {
        type: UserReactionType.NEUTRAL,
        timestamp: new Date(),
        explicit: false,
        confidence: 0.5
      };

      for (let i = 0; i < 4; i++) {
        const intervention = {
          ...mockIntervention,
          id: `lower_success_${i}`,
          trigger: 'lower success pattern',
          timestamp: new Date()
        };
        
        const reaction = i < 2 ? mockUserReaction : mixedReaction;
        const outcome = i < 2 ? ConversationOutcome.PROVIDED_VALUE : ConversationOutcome.NO_IMPACT;
        
        learningModule.recordInterventionOutcome(intervention, reaction, outcome);
      }

      const patterns = learningModule.identifySuccessPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(1);
      
      // First pattern should have higher success rate
      if (patterns.length > 1) {
        expect(patterns[0].successRate).toBeGreaterThanOrEqual(patterns[1].successRate);
      }
    });
  });

  describe('adaptBehaviorFromFeedback', () => {
    it('should increase frequency for positive feedback', () => {
      const interventionHistory: InterventionRecord[] = [mockIntervention];
      
      const adjustment = learningModule.adaptBehaviorFromFeedback(
        mockUserReaction,
        interventionHistory
      );

      expect(adjustment.frequencyMultiplier).toBeGreaterThan(1.0);
      expect(adjustment.interventionThreshold).toBeLessThan(0.7);
    });

    it('should decrease frequency for negative feedback', () => {
      const negativeReaction: UserReaction = {
        type: UserReactionType.NEGATIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.9
      };

      const interventionHistory: InterventionRecord[] = [mockIntervention];
      
      const adjustment = learningModule.adaptBehaviorFromFeedback(
        negativeReaction,
        interventionHistory
      );

      expect(adjustment.frequencyMultiplier).toBeLessThan(1.0);
      expect(adjustment.interventionThreshold).toBeGreaterThan(0.7);
    });

    it('should provide safe fallback for negative feedback', () => {
      const negativeReaction: UserReaction = {
        type: UserReactionType.NEGATIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 0.9
      };

      const interventionHistory: InterventionRecord[] = [mockIntervention];
      
      const adjustment = learningModule.adaptBehaviorFromFeedback(
        negativeReaction,
        interventionHistory
      );

      expect(adjustment.preferredTypes).toContain(InterventionType.CLARIFICATION_REQUEST);
    });

    it('should handle ignored feedback appropriately', () => {
      const ignoredReaction: UserReaction = {
        type: UserReactionType.IGNORED,
        timestamp: new Date(),
        explicit: false,
        confidence: 0.7
      };

      const interventionHistory: InterventionRecord[] = [mockIntervention];
      
      const adjustment = learningModule.adaptBehaviorFromFeedback(
        ignoredReaction,
        interventionHistory
      );

      expect(adjustment.frequencyMultiplier).toBeLessThan(1.0);
      expect(adjustment.interventionThreshold).toBeGreaterThan(0.7);
      expect(adjustment.preferredTypes.length).toBeGreaterThan(0);
    });
  });

  describe('getUserMetrics', () => {
    it('should return null for users with no history', () => {
      const metrics = learningModule.getUserMetrics('unknown_user');
      expect(metrics).toBeNull();
    });

    it('should return metrics after recording interventions', () => {
      learningModule.recordInterventionOutcome(
        mockIntervention,
        mockUserReaction,
        ConversationOutcome.PROVIDED_VALUE
      );

      const metrics = learningModule.getUserMetrics('user_789');
      expect(metrics).toBeDefined();
      expect(metrics!.totalInterventions).toBe(1);
      expect(metrics!.successRate).toBeGreaterThan(0);
      expect(metrics!.averageEffectiveness).toBeGreaterThan(0);
      expect(metrics!.lastUpdated).toBeInstanceOf(Date);
    });

    it('should calculate improvement trend correctly', () => {
      // Record 15 interventions with improving effectiveness
      for (let i = 0; i < 15; i++) {
        const intervention = {
          ...mockIntervention,
          id: `trend_${i}`,
          timestamp: new Date(Date.now() + i * 1000) // Spread over time
        };

        // Make later interventions more successful
        const reactionType = i < 10 ? UserReactionType.NEUTRAL : UserReactionType.POSITIVE;
        const outcome = i < 10 ? ConversationOutcome.NO_IMPACT : ConversationOutcome.PROVIDED_VALUE;
        
        const reaction: UserReaction = {
          type: reactionType,
          timestamp: new Date(),
          explicit: true,
          confidence: 0.8
        };

        learningModule.recordInterventionOutcome(intervention, reaction, outcome);
      }

      const metrics = learningModule.getUserMetrics('user_789');
      expect(metrics).toBeDefined();
      expect(metrics!.improvementTrend).toBeGreaterThan(0);
    });
  });

  describe('getGlobalPatterns', () => {
    it('should return empty array initially', () => {
      const patterns = learningModule.getGlobalPatterns();
      expect(patterns).toEqual([]);
    });

    it('should return patterns after recording interventions', () => {
      learningModule.recordInterventionOutcome(
        mockIntervention,
        mockUserReaction,
        ConversationOutcome.PROVIDED_VALUE
      );

      const patterns = learningModule.getGlobalPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('effectiveness calculation', () => {
    it('should handle different reaction types correctly', () => {
      const testCases = [
        { reaction: UserReactionType.POSITIVE, expectedRange: [0.6, 1.0] },
        { reaction: UserReactionType.ACKNOWLEDGED, expectedRange: [0.5, 0.8] },
        { reaction: UserReactionType.NEUTRAL, expectedRange: [0.4, 0.6] },
        { reaction: UserReactionType.IGNORED, expectedRange: [0.3, 0.5] },
        { reaction: UserReactionType.NEGATIVE, expectedRange: [0.0, 0.4] }
      ];

      testCases.forEach(({ reaction, expectedRange }) => {
        const testIntervention = {
          ...mockIntervention,
          id: `test_${reaction}`
        };

        const testReaction: UserReaction = {
          type: reaction,
          timestamp: new Date(),
          explicit: true,
          confidence: 0.8
        };

        learningModule.recordInterventionOutcome(
          testIntervention,
          testReaction,
          ConversationOutcome.NO_IMPACT
        );

        expect(testIntervention.effectiveness).toBeDefined();
        expect(testIntervention.effectiveness!.overall).toBeGreaterThanOrEqual(expectedRange[0]);
        expect(testIntervention.effectiveness!.overall).toBeLessThanOrEqual(expectedRange[1]);
      });
    });

    it('should handle different conversation outcomes correctly', () => {
      const testCases = [
        { outcome: ConversationOutcome.IMPROVED_FOCUS, shouldIncrease: true },
        { outcome: ConversationOutcome.PROVIDED_VALUE, shouldIncrease: true },
        { outcome: ConversationOutcome.NO_IMPACT, shouldIncrease: false },
        { outcome: ConversationOutcome.DISRUPTED_FLOW, shouldIncrease: false },
        { outcome: ConversationOutcome.NEGATIVE_IMPACT, shouldIncrease: false }
      ];

      testCases.forEach(({ outcome, shouldIncrease }) => {
        const testIntervention = {
          ...mockIntervention,
          id: `outcome_test_${outcome}`
        };

        // Use neutral reaction to better test outcome impact
        const neutralReaction: UserReaction = {
          type: UserReactionType.NEUTRAL,
          timestamp: new Date(),
          explicit: false,
          confidence: 0.5
        };

        learningModule.recordInterventionOutcome(
          testIntervention,
          neutralReaction,
          outcome
        );

        expect(testIntervention.effectiveness).toBeDefined();
        
        if (shouldIncrease) {
          expect(testIntervention.effectiveness!.overall).toBeGreaterThan(0.5);
        } else {
          expect(testIntervention.effectiveness!.overall).toBeLessThanOrEqual(0.5);
        }
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty intervention history gracefully', () => {
      const adjustment = learningModule.adaptBehaviorFromFeedback(
        mockUserReaction,
        []
      );

      expect(adjustment).toBeDefined();
      expect(adjustment.frequencyMultiplier).toBeGreaterThan(0);
    });

    it('should handle interventions without effectiveness scores', () => {
      const interventionWithoutEffectiveness = {
        ...mockIntervention,
        effectiveness: undefined
      };

      // This should not throw an error
      expect(() => {
        learningModule.adaptBehaviorFromFeedback(
          mockUserReaction,
          [interventionWithoutEffectiveness]
        );
      }).not.toThrow();
    });

    it('should maintain effectiveness scores within valid range', () => {
      // Test extreme cases that might push scores outside 0-1 range
      const extremePositiveReaction: UserReaction = {
        type: UserReactionType.POSITIVE,
        timestamp: new Date(),
        explicit: true,
        confidence: 1.0
      };

      learningModule.recordInterventionOutcome(
        mockIntervention,
        extremePositiveReaction,
        ConversationOutcome.PROVIDED_VALUE
      );

      expect(mockIntervention.effectiveness).toBeDefined();
      expect(mockIntervention.effectiveness!.overall).toBeLessThanOrEqual(1.0);
      expect(mockIntervention.effectiveness!.overall).toBeGreaterThanOrEqual(0.0);
      expect(mockIntervention.effectiveness!.timing).toBeLessThanOrEqual(1.0);
      expect(mockIntervention.effectiveness!.timing).toBeGreaterThanOrEqual(0.0);
      expect(mockIntervention.effectiveness!.relevance).toBeLessThanOrEqual(1.0);
      expect(mockIntervention.effectiveness!.relevance).toBeGreaterThanOrEqual(0.0);
      expect(mockIntervention.effectiveness!.tone).toBeLessThanOrEqual(1.0);
      expect(mockIntervention.effectiveness!.tone).toBeGreaterThanOrEqual(0.0);
    });
  });
});