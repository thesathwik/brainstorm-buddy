import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  GracefulDegradationService,
  DegradationLevel,
  ConflictType,
  RecommendedAction,
  ConflictResolution
} from '../../src/services/GracefulDegradationService';
import { InterventionType } from '../../src/models/Enums';
import { ConversationContext } from '../../src/models/ConversationContext';
import { createTestContext, createTestMessage } from '../testUtils';

describe('GracefulDegradationService', () => {
  let degradationService: GracefulDegradationService;
  let mockContext: ConversationContext;

  beforeEach(() => {
    degradationService = new GracefulDegradationService();
    mockContext = createTestContext([
      createTestMessage('1', 'user1', 'Test message about investment')
    ]);
  });

  describe('analyzeInformationConflicts', () => {
    it('should detect contradictory information', () => {
      const contradictoryInfo = [
        { valuation: 10000000, source: 'source1' },
        { valuation: 50000000, source: 'source2' }
      ];

      const conflict = degradationService.analyzeInformationConflicts(contradictoryInfo, mockContext);

      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.CONTRADICTORY_INFORMATION);
      expect(conflict!.confidence).toBeGreaterThan(0.5);
    });

    it('should detect ambiguous context', () => {
      const ambiguousInfo = [
        { description: 'Maybe this company is profitable' },
        { description: 'The market might be growing' }
      ];

      const conflict = degradationService.analyzeInformationConflicts(ambiguousInfo, mockContext);

      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.AMBIGUOUS_CONTEXT);
    });

    it('should detect insufficient data', () => {
      const insufficientInfo: any[] = [];

      const conflict = degradationService.analyzeInformationConflicts(insufficientInfo, mockContext);

      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.INSUFFICIENT_DATA);
    });

    it('should detect multiple interpretations', () => {
      const multipleInterpretations = [
        { description: 'This could be either a growth or value play' },
        { description: 'The outcome depends on market conditions' }
      ];

      const conflict = degradationService.analyzeInformationConflicts(multipleInterpretations, mockContext);

      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.MULTIPLE_INTERPRETATIONS);
    });

    it('should return null when no conflicts detected', () => {
      const consistentInfo = [
        { valuation: 10000000, source: 'source1' },
        { revenue: 5000000, source: 'source1' }
      ];

      const conflict = degradationService.analyzeInformationConflicts(consistentInfo, mockContext);

      expect(conflict).toBeNull();
    });
  });

  describe('generateGracefulResponse', () => {
    it('should generate clarification request response', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.AMBIGUOUS_CONTEXT,
        confidence: 0.8,
        recommendedAction: RecommendedAction.REQUEST_CLARIFICATION,
        alternatives: [],
        explanation: 'Ambiguous language detected'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.INFORMATION_PROVIDE,
        mockContext
      );

      expect(response.content).toContain('clarification');
      expect(response.type).toBe(InterventionType.INFORMATION_PROVIDE);
      expect(response.confidence).toBeGreaterThan(0.5);
      expect(response.followUpSuggestions).toBeDefined();
    });

    it('should generate alternatives presentation response', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.CONTRADICTORY_INFORMATION,
        confidence: 0.9,
        recommendedAction: RecommendedAction.PRESENT_ALTERNATIVES,
        alternatives: [
          {
            description: 'Option A',
            confidence: 0.7,
            sources: ['source1'],
            reasoning: 'Based on recent data'
          },
          {
            description: 'Option B',
            confidence: 0.6,
            sources: ['source2'],
            reasoning: 'Based on historical trends'
          }
        ],
        explanation: 'Conflicting valuation data'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.FACT_CHECK,
        mockContext
      );

      expect(response.content).toContain('conflicting information');
      expect(response.content).toContain('Option A');
      expect(response.content).toContain('Option B');
      expect(response.content).toContain('70%'); // Confidence percentage
    });

    it('should generate human deferral response', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.MULTIPLE_INTERPRETATIONS,
        confidence: 0.5,
        recommendedAction: RecommendedAction.DEFER_TO_HUMAN,
        alternatives: [],
        explanation: 'Complex scenario requiring human judgment'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.CLARIFICATION_REQUEST,
        mockContext
      );

      expect(response.content).toContain('human judgment');
      expect(response.content).toContain('domain expertise');
    });

    it('should generate conservative response', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.UNCERTAIN_FACTS,
        confidence: 0.6,
        recommendedAction: RecommendedAction.USE_CONSERVATIVE_APPROACH,
        alternatives: [],
        explanation: 'Uncertain information detected'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.INFORMATION_PROVIDE,
        mockContext
      );

      expect(response.content).toContain('careful');
      expect(response.content).toContain('uncertainty');
      expect(response.content).toContain('verify');
    });

    it('should generate uncertainty acknowledgment response', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.INSUFFICIENT_DATA,
        confidence: 0.7,
        recommendedAction: RecommendedAction.ACKNOWLEDGE_UNCERTAINTY,
        alternatives: [],
        explanation: 'Limited data available'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.SUMMARY_OFFER,
        mockContext
      );

      expect(response.content).toContain('transparent');
      expect(response.content).toContain('uncertainty');
      expect(response.content).toContain('preliminary');
    });
  });

  describe('degradation levels', () => {
    it('should start with no degradation', () => {
      const status = degradationService.getDegradationStatus();
      
      expect(status.level).toBe(DegradationLevel.NONE);
      expect(status.strategy.capabilities).toContain('ai_analysis');
      expect(status.strategy.capabilities).toContain('proactive_interventions');
    });

    it('should set degradation level correctly', () => {
      degradationService.setDegradationLevel(DegradationLevel.MODERATE);
      
      const status = degradationService.getDegradationStatus();
      
      expect(status.level).toBe(DegradationLevel.MODERATE);
      expect(status.strategy.capabilities).toContain('basic_analysis');
      expect(status.strategy.capabilities).not.toContain('proactive_interventions');
    });

    it('should check capability availability correctly', () => {
      // Full capabilities at NONE level
      expect(degradationService.isCapabilityAvailable('ai_analysis')).toBe(true);
      expect(degradationService.isCapabilityAvailable('proactive_interventions')).toBe(true);

      // Limited capabilities at MODERATE level
      degradationService.setDegradationLevel(DegradationLevel.MODERATE);
      expect(degradationService.isCapabilityAvailable('ai_analysis')).toBe(false);
      expect(degradationService.isCapabilityAvailable('basic_analysis')).toBe(true);
      expect(degradationService.isCapabilityAvailable('proactive_interventions')).toBe(false);

      // Minimal capabilities at SEVERE level
      degradationService.setDegradationLevel(DegradationLevel.SEVERE);
      expect(degradationService.isCapabilityAvailable('basic_analysis')).toBe(false);
      expect(degradationService.isCapabilityAvailable('acknowledgment_responses')).toBe(true);
    });
  });

  describe('degradation strategies', () => {
    it('should provide appropriate strategy for each degradation level', () => {
      const levels = [
        DegradationLevel.NONE,
        DegradationLevel.MINIMAL,
        DegradationLevel.MODERATE,
        DegradationLevel.SEVERE,
        DegradationLevel.OFFLINE
      ];

      levels.forEach(level => {
        degradationService.setDegradationLevel(level);
        const status = degradationService.getDegradationStatus();
        
        expect(status.strategy.level).toBe(level);
        expect(status.strategy.description).toBeDefined();
        expect(status.strategy.capabilities).toBeDefined();
        expect(status.strategy.limitations).toBeDefined();
        expect(status.strategy.fallbackBehaviors).toBeDefined();
      });
    });

    it('should have appropriate capabilities for each level', () => {
      // NONE level should have full capabilities
      degradationService.setDegradationLevel(DegradationLevel.NONE);
      let status = degradationService.getDegradationStatus();
      expect(status.strategy.capabilities).toContain('ai_analysis');
      expect(status.strategy.capabilities).toContain('proactive_interventions');
      expect(status.strategy.limitations).toHaveLength(0);

      // SEVERE level should have minimal capabilities
      degradationService.setDegradationLevel(DegradationLevel.SEVERE);
      status = degradationService.getDegradationStatus();
      expect(status.strategy.capabilities).not.toContain('ai_analysis');
      expect(status.strategy.capabilities).not.toContain('proactive_interventions');
      expect(status.strategy.limitations.length).toBeGreaterThan(0);
    });

    it('should provide fallback behaviors for degraded levels', () => {
      degradationService.setDegradationLevel(DegradationLevel.MODERATE);
      const status = degradationService.getDegradationStatus();
      
      expect(status.strategy.fallbackBehaviors.length).toBeGreaterThan(0);
      
      const proactiveFallback = status.strategy.fallbackBehaviors.find(
        fb => fb.trigger === 'proactive_intervention'
      );
      expect(proactiveFallback).toBeDefined();
      expect(proactiveFallback!.action).toBe('wait_for_summon');
    });
  });

  describe('conflict history and learning', () => {
    it('should record conflicts for learning', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.CONTRADICTORY_INFORMATION,
        confidence: 0.8,
        recommendedAction: RecommendedAction.PRESENT_ALTERNATIVES,
        alternatives: [],
        explanation: 'Test conflict'
      };

      degradationService.generateGracefulResponse(
        conflict,
        InterventionType.FACT_CHECK,
        mockContext
      );

      const status = degradationService.getDegradationStatus();
      expect(status.recentConflicts).toContain(conflict);
    });

    it('should limit conflict history size', () => {
      // Generate many conflicts
      for (let i = 0; i < 150; i++) {
        const conflict: ConflictResolution = {
          type: ConflictType.AMBIGUOUS_CONTEXT,
          confidence: 0.7,
          recommendedAction: RecommendedAction.REQUEST_CLARIFICATION,
          alternatives: [],
          explanation: `Test conflict ${i}`
        };

        degradationService.generateGracefulResponse(
          conflict,
          InterventionType.CLARIFICATION_REQUEST,
          mockContext
        );
      }

      const status = degradationService.getDegradationStatus();
      expect(status.recentConflicts.length).toBeLessThanOrEqual(10); // Only recent conflicts
    });

    it('should provide system recommendations based on conflict patterns', () => {
      // Generate contradictory information conflicts
      for (let i = 0; i < 5; i++) {
        const conflict: ConflictResolution = {
          type: ConflictType.CONTRADICTORY_INFORMATION,
          confidence: 0.8,
          recommendedAction: RecommendedAction.PRESENT_ALTERNATIVES,
          alternatives: [],
          explanation: 'Contradictory data'
        };

        degradationService.generateGracefulResponse(
          conflict,
          InterventionType.FACT_CHECK,
          mockContext
        );
      }

      const status = degradationService.getDegradationStatus();
      expect(status.recommendations.some(rec => 
        rec.includes('contradictory information')
      )).toBe(true);
    });
  });

  describe('follow-up suggestions', () => {
    it('should provide relevant follow-up suggestions for clarification requests', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.AMBIGUOUS_CONTEXT,
        confidence: 0.8,
        recommendedAction: RecommendedAction.REQUEST_CLARIFICATION,
        alternatives: [],
        explanation: 'Ambiguous context'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.CLARIFICATION_REQUEST,
        mockContext
      );

      expect(response.followUpSuggestions).toBeDefined();
      expect(response.followUpSuggestions!.length).toBeGreaterThan(0);
      expect(response.followUpSuggestions!.some(suggestion => 
        suggestion.includes('clarify')
      )).toBe(true);
    });

    it('should provide relevant follow-up suggestions for alternatives presentation', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.CONTRADICTORY_INFORMATION,
        confidence: 0.9,
        recommendedAction: RecommendedAction.PRESENT_ALTERNATIVES,
        alternatives: [
          {
            description: 'Option A',
            confidence: 0.7,
            sources: ['source1'],
            reasoning: 'Based on data'
          }
        ],
        explanation: 'Conflicting data'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.FACT_CHECK,
        mockContext
      );

      expect(response.followUpSuggestions).toBeDefined();
      expect(response.followUpSuggestions!.some(suggestion => 
        suggestion.includes('details') || suggestion.includes('research')
      )).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty information arrays', () => {
      const conflict = degradationService.analyzeInformationConflicts([], mockContext);
      
      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.INSUFFICIENT_DATA);
    });

    it('should handle null/undefined information', () => {
      const nullInfo = [null, undefined, {}];
      
      const conflict = degradationService.analyzeInformationConflicts(nullInfo, mockContext);
      
      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.INSUFFICIENT_DATA);
    });

    it('should handle minimal conversation context', () => {
      const minimalContext = createTestContext([]);
      const info = [{ test: 'data' }];
      
      const conflict = degradationService.analyzeInformationConflicts(info, minimalContext);
      
      expect(conflict).toBeDefined();
      expect(conflict!.type).toBe(ConflictType.AMBIGUOUS_CONTEXT);
    });

    it('should generate fallback response for unknown recommended actions', () => {
      const conflict: ConflictResolution = {
        type: ConflictType.UNCERTAIN_FACTS,
        confidence: 0.5,
        recommendedAction: 'UNKNOWN_ACTION' as RecommendedAction,
        alternatives: [],
        explanation: 'Unknown scenario'
      };

      const response = degradationService.generateGracefulResponse(
        conflict,
        InterventionType.INFORMATION_PROVIDE,
        mockContext
      );

      expect(response.content).toContain('difficulty');
      expect(response.confidence).toBeLessThan(0.5);
    });
  });
});