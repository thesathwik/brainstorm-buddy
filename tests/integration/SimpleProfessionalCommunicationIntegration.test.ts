import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommunicationFilter } from '../../src/services/CommunicationFilter';
import { DefaultContextAnalyzer } from '../../src/services/ContextAnalyzer';
import { DefaultGeminiApiClient } from '../../src/api/GeminiApiClient';
import { InterventionType, MeetingType } from '../../src/models/Enums';

describe('Simple Professional Communication Integration', () => {
  let communicationFilter: CommunicationFilter;
  let mockGeminiClient: any;
  let contextAnalyzer: DefaultContextAnalyzer;

  beforeEach(() => {
    communicationFilter = new CommunicationFilter();
    
    // Mock Gemini client for testing
    mockGeminiClient = {
      analyzeText: vi.fn().mockResolvedValue({
        content: '0.8',
        confidence: 0.9
      }),
      generateResponse: vi.fn().mockResolvedValue({
        content: 'Professional response content',
        confidence: 0.9
      }),
      isHealthy: vi.fn().mockResolvedValue(true)
    };
    
    contextAnalyzer = new DefaultContextAnalyzer(mockGeminiClient);
  });

  describe('Professional Communication Pipeline', () => {
    it('should successfully remove robotic phrases', () => {
      const roboticResponse = 'Based on your question about market analysis, I can provide the following information about the investment.';
      
      const cleaned = communicationFilter.removeRoboticPhrases(roboticResponse);
      
      expect(cleaned).not.toContain('Based on your question about');
      expect(cleaned).not.toContain('I can provide the following');
      // The result might be empty if all content was robotic, which is acceptable
      expect(typeof cleaned).toBe('string');
    });

    it('should enhance professional tone', () => {
      const casualResponse = 'Yeah, that\'s awesome! The company is gonna do great, I think.';
      
      const professional = communicationFilter.ensureProfessionalTone(casualResponse);
      
      expect(professional).not.toContain('Yeah');
      expect(professional).not.toContain('awesome');
      expect(professional).not.toContain('gonna');
      expect(professional).not.toContain('I think');
    });

    it('should validate business language quality', () => {
      const unprofessionalText = 'Um, yeah, this is like, totally cool and stuff.';
      
      const validation = communicationFilter.validateBusinessLanguage(unprofessionalText);
      
      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.professionalScore).toBeLessThan(0.7);
    });

    it('should adapt responses to meeting context', () => {
      const baseResponse = 'The company shows good performance.';
      
      const adapted = communicationFilter.adaptToMeetingContext(
        baseResponse,
        MeetingType.PORTFOLIO_UPDATE
      );
      
      expect(adapted).toContain('performance');
    });

    it('should evaluate communication quality comprehensively', () => {
      const professionalText = 'The investment opportunity demonstrates strong market fundamentals and sustainable competitive advantages.';
      
      const quality = communicationFilter.evaluateCommunicationQuality(professionalText);
      
      expect(quality.overallScore).toBeGreaterThan(0.7);
      expect(quality.professionalism).toBeGreaterThan(0.8);
      expect(quality.naturalness).toBeGreaterThan(0.7);
      expect(quality.clarity).toBeGreaterThan(0.7);
    });
  });

  describe('Enhanced Topic Drift Detection', () => {
    it('should detect consecutive off-topic messages', async () => {
      const messages = [
        {
          originalMessage: {
            id: '1',
            userId: 'user1',
            content: 'Did you see the game last night?',
            timestamp: new Date(),
            metadata: {}
          },
          extractedEntities: [],
          sentiment: { overall: 0.5 },
          topicClassification: ['off_topic'],
          urgencyLevel: 'low'
        },
        {
          originalMessage: {
            id: '2',
            userId: 'user2',
            content: 'Yeah, amazing touchdown!',
            timestamp: new Date(),
            metadata: {}
          },
          extractedEntities: [],
          sentiment: { overall: 0.7 },
          topicClassification: ['off_topic'],
          urgencyLevel: 'low'
        }
      ];

      // Mock the Gemini client to return low relevance scores
      mockGeminiClient.analyzeText.mockResolvedValue({
        content: '0.2', // Low investment relevance
        confidence: 0.8
      });

      const driftResult = await contextAnalyzer.detectTopicDrift(messages);
      
      expect(driftResult.isDrifting).toBe(true);
      expect(driftResult.messagesOffTopic).toBe(2);
    });

    it('should generate redirection strategy', async () => {
      const originalTopic = 'investment_evaluation';
      const currentTopic = 'sports';

      // Mock Gemini to return a redirection strategy
      mockGeminiClient.analyzeText.mockResolvedValue({
        content: JSON.stringify({
          approach: 'gentle_reminder',
          message: 'I notice we\'ve moved away from our investment discussion. Should we return to that topic?',
          contextSummary: 'Discussion about investment evaluation',
          diplomaticLevel: 0.8
        }),
        confidence: 0.9
      });

      const strategy = await contextAnalyzer.generateRedirectionStrategy(originalTopic, currentTopic);
      
      expect(strategy.approach).toBe('gentle_reminder');
      expect(strategy.message).toContain('investment');
      expect(strategy.diplomaticLevel).toBeGreaterThan(0.5);
    });
  });

  describe('Integration Workflow', () => {
    it('should process a complete professional communication workflow', async () => {
      // Step 1: Start with a robotic, unprofessional response
      let response = 'Based on your question about the investment, um, I think maybe it\'s like, totally awesome and stuff.';
      
      // Step 2: Remove robotic phrases
      response = communicationFilter.removeRoboticPhrases(response);
      expect(response).not.toContain('Based on your question about');
      
      // Step 3: Enhance professional tone
      response = communicationFilter.ensureProfessionalTone(response);
      expect(response).not.toContain('um');
      expect(response).not.toContain('totally awesome');
      
      // Step 4: Enhance natural flow
      response = communicationFilter.enhanceNaturalFlow(response);
      
      // Step 5: Validate final quality
      const validation = communicationFilter.validateBusinessLanguage(response);
      expect(validation.professionalScore).toBeGreaterThan(0.6);
      
      // Step 6: Evaluate overall quality
      const quality = communicationFilter.evaluateCommunicationQuality(response);
      expect(quality.overallScore).toBeGreaterThan(0.6);
    });

    it('should maintain quality standards across intervention types', () => {
      const interventionTypes = [
        InterventionType.TOPIC_REDIRECT,
        InterventionType.INFORMATION_PROVIDE,
        InterventionType.FACT_CHECK,
        InterventionType.CLARIFICATION_REQUEST,
        InterventionType.SUMMARY_OFFER
      ];

      for (const type of interventionTypes) {
        const mockResponse = 'Yeah, that\'s cool. I think maybe we should like, do something about it.';
        
        const enhanced = communicationFilter.ensureProfessionalTone(mockResponse);
        const validation = communicationFilter.validateBusinessLanguage(enhanced);
        
        expect(validation.professionalScore).toBeGreaterThan(0.7);
      }
    });

    it('should handle edge cases gracefully', () => {
      // Test empty response
      const emptyResult = communicationFilter.removeRoboticPhrases('');
      expect(emptyResult).toBe('');
      
      // Test very short response
      const shortResult = communicationFilter.ensureProfessionalTone('Yes.');
      expect(shortResult).toBe('Yes.');
      
      // Test response with only robotic phrases
      const roboticOnly = communicationFilter.removeRoboticPhrases('Based on your question about this topic, I hope this helps.');
      expect(roboticOnly).toBe('');
    });
  });

  describe('Quality Metrics and Monitoring', () => {
    it('should provide detailed quality assessment', () => {
      const testCases = [
        {
          text: 'The investment demonstrates strong fundamentals.',
          expectedScore: 0.8
        },
        {
          text: 'Um, yeah, like, this is totally cool stuff.',
          expectedScore: 0.4
        },
        {
          text: 'Based on your question about investments, I think maybe it\'s good.',
          expectedScore: 0.4
        }
      ];

      for (const testCase of testCases) {
        const quality = communicationFilter.evaluateCommunicationQuality(testCase.text);
        
        if (testCase.expectedScore > 0.7) {
          expect(quality.overallScore).toBeGreaterThan(0.7);
        } else if (testCase.expectedScore < 0.4) {
          expect(quality.overallScore).toBeLessThan(0.6);
        }
        
        expect(quality).toHaveProperty('naturalness');
        expect(quality).toHaveProperty('professionalism');
        expect(quality).toHaveProperty('clarity');
        expect(quality).toHaveProperty('engagement');
      }
    });

    it('should track improvement through the pipeline', () => {
      const originalText = 'Based on your question about stuff, um, I think maybe it\'s like, totally awesome.';
      
      // Measure original quality
      const originalQuality = communicationFilter.evaluateCommunicationQuality(originalText);
      
      // Process through pipeline
      let processed = communicationFilter.removeRoboticPhrases(originalText);
      processed = communicationFilter.ensureProfessionalTone(processed);
      processed = communicationFilter.enhanceNaturalFlow(processed);
      
      // Measure improved quality
      const improvedQuality = communicationFilter.evaluateCommunicationQuality(processed);
      
      // Should show improvement
      expect(improvedQuality.overallScore).toBeGreaterThan(originalQuality.overallScore);
      expect(improvedQuality.professionalism).toBeGreaterThan(originalQuality.professionalism);
      expect(improvedQuality.naturalness).toBeGreaterThan(originalQuality.naturalness);
    });
  });
});