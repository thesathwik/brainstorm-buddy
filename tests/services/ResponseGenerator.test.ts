import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultResponseGenerator } from '../../src/services/ResponseGenerator';
import { GeminiApiClient, GeminiApiResponse } from '../../src/api/GeminiApiClient';
import { 
  InterventionType, 
  CommunicationStyle, 
  VCRole, 
  MeetingType,
  ExpertiseArea 
} from '../../src/models/Enums';
import { ConversationContext } from '../../src/models/ConversationContext';
import { UserPreferences } from '../../src/models/UserPreferences';

// Mock GeminiApiClient
const mockGeminiClient: GeminiApiClient = {
  analyzeText: vi.fn(),
  generateResponse: vi.fn(),
  isHealthy: vi.fn()
};

describe('DefaultResponseGenerator', () => {
  let responseGenerator: DefaultResponseGenerator;
  let mockContext: ConversationContext;

  beforeEach(() => {
    vi.clearAllMocks();
    responseGenerator = new DefaultResponseGenerator(mockGeminiClient);
    
    mockContext = {
      sessionId: 'test-session',
      participants: [
        {
          id: 'user1',
          name: 'John Partner',
          role: VCRole.PARTNER,
          preferences: {
            interventionFrequency: 'moderate' as any,
            preferredInformationTypes: [],
            communicationStyle: CommunicationStyle.CONVERSATIONAL,
            topicExpertise: [ExpertiseArea.FINTECH]
          },
          engagementLevel: 0.8
        }
      ],
      currentTopic: 'Series A Investment in TechCorp',
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(),
      meetingType: MeetingType.INVESTMENT_REVIEW
    };
  });

  describe('generateResponse', () => {
    it('should generate topic redirect response', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "I notice we've moved away from discussing the Series A investment. Should we return to evaluating TechCorp's market position?",
        confidence: 0.85,
        usage: { inputTokens: 100, outputTokens: 50 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const additionalData = {
        originalTopic: 'Series A Investment in TechCorp',
        specificPoint: 'market position evaluation'
      };

      const response = await responseGenerator.generateResponse(
        InterventionType.TOPIC_REDIRECT,
        mockContext,
        additionalData
      );

      expect(response.type).toBe(InterventionType.TOPIC_REDIRECT);
      expect(response.content).toBe(mockGeminiResponse.content);
      expect(response.confidence).toBe(0.85);
      expect(response.followUpSuggestions).toBeDefined();
      expect(response.followUpSuggestions!.length).toBeGreaterThan(0);
    });

    it('should generate information provide response', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "TechCorp operates in the fintech space with a current valuation of $50M. Recent market data shows 25% growth in their sector.",
        confidence: 0.9,
        usage: { inputTokens: 120, outputTokens: 60 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const additionalData = {
        marketData: {
          valuation: '$50M',
          sectorGrowth: '25%'
        }
      };

      const response = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        mockContext,
        additionalData
      );

      expect(response.type).toBe(InterventionType.INFORMATION_PROVIDE);
      expect(response.content).toContain('TechCorp');
      expect(response.confidence).toBe(0.9);
      expect(response.sources).toBeDefined();
    });

    it('should generate fact check response', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "I'd like to verify the claim about TechCorp's user growth. According to recent reports, their growth rate is 15% monthly, not 25% as mentioned.",
        confidence: 0.8,
        usage: { inputTokens: 110, outputTokens: 55 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const additionalData = {
        claim: "TechCorp has 25% monthly user growth",
        verification: "Actual growth rate is 15% monthly according to recent reports"
      };

      const response = await responseGenerator.generateResponse(
        InterventionType.FACT_CHECK,
        mockContext,
        additionalData
      );

      expect(response.type).toBe(InterventionType.FACT_CHECK);
      expect(response.content).toContain('verify');
      expect(response.confidence).toBe(0.8);
    });

    it('should handle Gemini API failures with fallback response', async () => {
      vi.mocked(mockGeminiClient.generateResponse).mockRejectedValue(new Error('API Error'));

      const response = await responseGenerator.generateResponse(
        InterventionType.TOPIC_REDIRECT,
        mockContext,
        { originalTopic: 'Investment Discussion', specificPoint: 'valuation' }
      );

      expect(response.type).toBe(InterventionType.TOPIC_REDIRECT);
      expect(response.confidence).toBeLessThan(0.9); // Fallback should have lower confidence
      expect(response.content).toBeDefined();
      expect(response.sources).toBeDefined();
      expect(response.sources![0].type).toBe('api');
    });

    it('should generate clarification request response', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "Could you clarify what you mean by 'aggressive growth strategy'? I want to make sure I understand the specific tactics being considered.",
        confidence: 0.75,
        usage: { inputTokens: 90, outputTokens: 45 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const response = await responseGenerator.generateResponse(
        InterventionType.CLARIFICATION_REQUEST,
        mockContext,
        { unclear_point: 'aggressive growth strategy' }
      );

      expect(response.type).toBe(InterventionType.CLARIFICATION_REQUEST);
      expect(response.content).toContain('clarify');
      expect(response.confidence).toBe(0.75);
    });

    it('should generate summary offer response', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "Would it be helpful if I summarized our discussion on TechCorp's investment terms and market position?",
        confidence: 0.8,
        usage: { inputTokens: 95, outputTokens: 40 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const response = await responseGenerator.generateResponse(
        InterventionType.SUMMARY_OFFER,
        mockContext,
        { discussion_area: 'investment terms and market position' }
      );

      expect(response.type).toBe(InterventionType.SUMMARY_OFFER);
      expect(response.content).toContain('summarized');
      expect(response.confidence).toBe(0.8);
    });
  });

  describe('personalizeResponse', () => {
    const baseResponse = "I think we should return to discussing the investment terms.";
    
    it('should adjust response for formal communication style', () => {
      const userPreferences: UserPreferences = {
        interventionFrequency: 'moderate' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: []
      };

      const conversationTone = {
        formality: 0.8,
        urgency: 0.3,
        enthusiasm: 0.5,
        technicality: 0.6
      };

      const personalizedResponse = responseGenerator.personalizeResponse(
        baseResponse,
        userPreferences,
        conversationTone
      );

      expect(personalizedResponse).toContain('I believe');
      expect(personalizedResponse).not.toContain("I think");
    });

    it('should adjust response for conversational communication style', () => {
      const userPreferences: UserPreferences = {
        interventionFrequency: 'active' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: []
      };

      const conversationTone = {
        formality: 0.2,
        urgency: 0.4,
        enthusiasm: 0.7,
        technicality: 0.3
      };

      const personalizedResponse = responseGenerator.personalizeResponse(
        "I would like to return to discussing the investment terms.",
        userPreferences,
        conversationTone
      );

      expect(personalizedResponse).toContain('want to');
    });

    it('should adjust response for brief communication style', () => {
      const userPreferences: UserPreferences = {
        interventionFrequency: 'minimal' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.BRIEF,
        topicExpertise: []
      };

      const conversationTone = {
        formality: 0.5,
        urgency: 0.6,
        enthusiasm: 0.4,
        technicality: 0.5
      };

      const verboseResponse = "I think that perhaps we should return to discussing the investment terms.";
      const personalizedResponse = responseGenerator.personalizeResponse(
        verboseResponse,
        userPreferences,
        conversationTone
      );

      expect(personalizedResponse.length).toBeLessThan(verboseResponse.length);
      expect(personalizedResponse).not.toContain('I think that');
      expect(personalizedResponse).not.toContain('perhaps');
    });

    it('should adjust response based on conversation tone urgency', () => {
      const userPreferences: UserPreferences = {
        interventionFrequency: 'moderate' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: []
      };

      const urgentTone = {
        formality: 0.5,
        urgency: 0.9,
        enthusiasm: 0.5,
        technicality: 0.5
      };

      const personalizedResponse = responseGenerator.personalizeResponse(
        baseResponse,
        userPreferences,
        urgentTone
      );

      expect(personalizedResponse).toContain('time-sensitive');
    });

    it('should adjust response based on conversation tone enthusiasm', () => {
      const userPreferences: UserPreferences = {
        interventionFrequency: 'active' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: []
      };

      const enthusiasticTone = {
        formality: 0.3,
        urgency: 0.4,
        enthusiasm: 0.9,
        technicality: 0.4
      };

      const personalizedResponse = responseGenerator.personalizeResponse(
        baseResponse,
        userPreferences,
        enthusiasticTone
      );

      expect(personalizedResponse).toMatch(/!$/);
    });
  });

  describe('response appropriateness', () => {
    it('should generate contextually appropriate responses for different meeting types', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "Based on the due diligence findings, I'd like to highlight some key financial metrics that may impact our investment decision.",
        confidence: 0.85,
        usage: { inputTokens: 100, outputTokens: 50 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const dueDiligenceContext = {
        ...mockContext,
        meetingType: MeetingType.DUE_DILIGENCE
      };

      const response = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        dueDiligenceContext
      );

      expect(response.content).toContain('due diligence');
      expect(response.content).toContain('financial metrics');
    });

    it('should maintain professional tone across all intervention types', async () => {
      const interventionTypes = [
        InterventionType.TOPIC_REDIRECT,
        InterventionType.INFORMATION_PROVIDE,
        InterventionType.FACT_CHECK,
        InterventionType.CLARIFICATION_REQUEST,
        InterventionType.SUMMARY_OFFER
      ];

      const mockGeminiResponse: GeminiApiResponse = {
        content: "Professional response content",
        confidence: 0.8,
        usage: { inputTokens: 100, outputTokens: 50 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      for (const type of interventionTypes) {
        const response = await responseGenerator.generateResponse(type, mockContext);
        
        expect(response.content).toBeDefined();
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.type).toBe(type);
        expect(response.confidence).toBeGreaterThan(0);
      }
    });
  });

  describe('tone consistency', () => {
    it('should maintain consistent tone for partner-level participants', () => {
      const partnerPreferences: UserPreferences = {
        interventionFrequency: 'moderate' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: [ExpertiseArea.FINTECH]
      };

      const formalTone = {
        formality: 0.9,
        urgency: 0.3,
        enthusiasm: 0.4,
        technicality: 0.8
      };

      const response = responseGenerator.personalizeResponse(
        "Let's check those numbers again.",
        partnerPreferences,
        formalTone
      );

      expect(response).toContain('let us');
      expect(response).not.toContain("let's");
    });

    it('should maintain consistent tone for analyst-level participants', () => {
      const analystPreferences: UserPreferences = {
        interventionFrequency: 'active' as any,
        preferredInformationTypes: [],
        communicationStyle: CommunicationStyle.DETAILED,
        topicExpertise: [ExpertiseArea.ENTERPRISE_SOFTWARE]
      };

      const detailedTone = {
        formality: 0.6,
        urgency: 0.5,
        enthusiasm: 0.6,
        technicality: 0.9
      };

      const response = responseGenerator.personalizeResponse(
        "The metrics look good.",
        analystPreferences,
        detailedTone
      );

      // For detailed style, response should remain as-is or be expanded
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThanOrEqual("The metrics look good.".length);
    });
  });

  describe('error handling', () => {
    it('should handle missing intervention type gracefully', async () => {
      const invalidType = 'INVALID_TYPE' as InterventionType;
      
      const response = await responseGenerator.generateResponse(invalidType, mockContext);
      
      expect(response).toBeDefined();
      expect(response.content).toContain('having trouble generating a response');
      expect(response.confidence).toBeLessThan(0.5);
    });

    it('should provide meaningful fallback when Gemini API is unavailable', async () => {
      vi.mocked(mockGeminiClient.generateResponse).mockRejectedValue(
        new Error('Network error')
      );

      const response = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        mockContext
      );

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.confidence).toBeLessThan(0.9);
      expect(response.sources).toBeDefined();
      expect(response.sources![0].description).toContain('Fallback');
    });
  });

  describe('follow-up suggestions', () => {
    it('should provide relevant follow-up suggestions for each intervention type', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "Test response",
        confidence: 0.8,
        usage: { inputTokens: 100, outputTokens: 50 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const response = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        mockContext
      );

      expect(response.followUpSuggestions).toBeDefined();
      expect(response.followUpSuggestions!.length).toBeGreaterThan(0);
      expect(response.followUpSuggestions![0]).toContain('dive deeper');
    });

    it('should provide different follow-up suggestions for different intervention types', async () => {
      const mockGeminiResponse: GeminiApiResponse = {
        content: "Test response",
        confidence: 0.8,
        usage: { inputTokens: 100, outputTokens: 50 }
      };

      vi.mocked(mockGeminiClient.generateResponse).mockResolvedValue(mockGeminiResponse);

      const topicRedirectResponse = await responseGenerator.generateResponse(
        InterventionType.TOPIC_REDIRECT,
        mockContext
      );

      const factCheckResponse = await responseGenerator.generateResponse(
        InterventionType.FACT_CHECK,
        mockContext
      );

      expect(topicRedirectResponse.followUpSuggestions).not.toEqual(
        factCheckResponse.followUpSuggestions
      );
    });
  });
});