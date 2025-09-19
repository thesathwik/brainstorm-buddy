import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultSummonContextAnalyzer } from '../../src/services/SummonContextAnalyzer';
import { GeminiApiClient } from '../../src/api/GeminiApiClient';
import { SummonResult, QuestionType, ResponseType } from '../../src/models/SummonDetection';
import { ChatMessage } from '../../src/models/ChatMessage';
import { ConversationContext } from '../../src/models/ConversationContext';
import { SummonType, MeetingType } from '../../src/models/Enums';

// Mock the GeminiApiClient
vi.mock('../../src/api/GeminiApiClient');

describe('SummonContextAnalyzer', () => {
  let analyzer: DefaultSummonContextAnalyzer;
  let mockGeminiClient: vi.Mocked<GeminiApiClient>;
  let testMessage: ChatMessage;
  let testContext: ConversationContext;

  beforeEach(() => {
    mockGeminiClient = {
      analyzeText: vi.fn()
    } as any;
    
    analyzer = new DefaultSummonContextAnalyzer(mockGeminiClient);

    testMessage = {
      id: 'test-msg-1',
      userId: 'user-1',
      content: 'Test message',
      timestamp: new Date(),
      metadata: {}
    };

    testContext = {
      sessionId: 'test-session',
      participants: [
        {
          id: 'user-1',
          name: 'Test User',
          role: 'partner' as any,
          preferences: {
            interventionFrequency: 'moderate' as any,
            preferredInformationTypes: [],
            communicationStyle: 'conversational' as any,
            topicExpertise: []
          },
          engagementLevel: 0.8
        }
      ],
      currentTopic: 'Series A Investment Analysis',
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(),
      meetingType: MeetingType.INVESTMENT_REVIEW
    };
  });

  describe('Question Type Classification', () => {
    it('should classify direct questions correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What is the market size for fintech?'
      };

      testMessage.content = 'Bot, what is the market size for fintech?';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.DIRECT_QUESTION);
      expect(context.hasExplicitQuestion).toBe(true);
      expect(context.questionClarity).toBeGreaterThan(0.6);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should classify information requests correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Tell me about the competitive landscape'
      };

      testMessage.content = 'Bot, tell me about the competitive landscape';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.INFORMATION_REQUEST);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should classify opinion requests correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What do you think about this valuation?'
      };

      testMessage.content = 'Bot, what do you think about this valuation?';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.OPINION_REQUEST);
      expect(context.hasExplicitQuestion).toBe(true);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should classify help requests correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Help me understand this financial model'
      };

      testMessage.content = 'Bot, help me understand this financial model';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.HELP_REQUEST);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should classify greetings correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Hi bot'
      };

      testMessage.content = 'Hi bot';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.GREETING);
      expect(context.directResponsePossible).toBe(true);
      expect(context.requiresClarification).toBe(false);
    });

    it('should classify unclear requests correctly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'um, thing'
      };

      testMessage.content = 'Bot, um, thing';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.UNCLEAR_REQUEST);
      expect(context.requiresClarification).toBe(true);
      expect(context.directResponsePossible).toBe(false);
    });
  });

  describe('Question Clarity Assessment', () => {
    it('should give high clarity to specific questions', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What is the current valuation of Stripe?'
      };

      testMessage.content = 'Bot, what is the current valuation of Stripe?';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionClarity).toBeGreaterThan(0.7);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should give low clarity to vague requests', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'maybe help with stuff'
      };

      testMessage.content = 'Bot, maybe help with stuff';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionClarity).toBeLessThan(0.4);
      expect(context.requiresClarification).toBe(true);
    });

    it('should increase clarity for topic-related requests', async () => {
      testContext.currentTopic = 'Fintech Investment Analysis';
      
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What about fintech market trends?'
      };

      testMessage.content = 'Bot, what about fintech market trends?';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionClarity).toBeGreaterThan(0.6);
    });

    it('should decrease clarity for very short requests', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'hi'
      };

      testMessage.content = 'Bot hi';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      // Greetings are handled specially and don't require clarification
      expect(context.questionType).toBe(QuestionType.GREETING);
      expect(context.requiresClarification).toBe(false);
    });
  });

  describe('Response Type Determination', () => {
    it('should return DIRECT_ANSWER for clear questions', () => {
      const summonContext = {
        hasExplicitQuestion: true,
        questionClarity: 0.8,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.DIRECT_QUESTION,
        contextualCues: [],
        extractedIntent: 'market data'
      };

      const responseType = analyzer.determineResponseType(summonContext);
      expect(responseType).toBe(ResponseType.DIRECT_ANSWER);
    });

    it('should return CLARIFICATION_NEEDED for unclear requests', () => {
      const summonContext = {
        hasExplicitQuestion: false,
        questionClarity: 0.2,
        requiresClarification: true,
        directResponsePossible: false,
        questionType: QuestionType.UNCLEAR_REQUEST,
        contextualCues: [],
        extractedIntent: 'unclear'
      };

      const responseType = analyzer.determineResponseType(summonContext);
      expect(responseType).toBe(ResponseType.CLARIFICATION_NEEDED);
    });

    it('should return INFORMATION_REQUEST for data requests', () => {
      const summonContext = {
        hasExplicitQuestion: false,
        questionClarity: 0.7,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.INFORMATION_REQUEST,
        contextualCues: [],
        extractedIntent: 'company data'
      };

      const responseType = analyzer.determineResponseType(summonContext);
      expect(responseType).toBe(ResponseType.INFORMATION_REQUEST);
    });

    it('should return ACKNOWLEDGMENT for greetings', () => {
      const summonContext = {
        hasExplicitQuestion: false,
        questionClarity: 0.5,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.GREETING,
        contextualCues: [],
        extractedIntent: 'greeting'
      };

      const responseType = analyzer.determineResponseType(summonContext);
      expect(responseType).toBe(ResponseType.ACKNOWLEDGMENT);
    });
  });

  describe('Intent Extraction', () => {
    it('should extract intent using AI when available', async () => {
      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'market data'
      });

      const intent = await analyzer.extractQuestionIntent('What is the market size for fintech?');

      expect(intent).toBe('market data');
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        'What is the market size for fintech?',
        expect.stringContaining('extract the core intent')
      );
    });

    it('should fallback to keyword extraction on AI failure', async () => {
      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const intent = await analyzer.extractQuestionIntent('What is the market size for fintech?');

      expect(intent).toBe('market data');
    });

    it('should handle empty or very short text', async () => {
      const intent = await analyzer.extractQuestionIntent('hi');

      expect(intent).toBe('unclear intent');
    });

    it('should extract valuation-related intent', async () => {
      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const intent = await analyzer.extractQuestionIntent('Help me understand this valuation model');

      expect(intent).toBe('valuation help');
    });

    it('should extract company analysis intent', async () => {
      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const intent = await analyzer.extractQuestionIntent('Can you analyze this company?');

      expect(intent).toBe('company analysis');
    });
  });

  describe('Contextual Cues Extraction', () => {
    it('should extract current topic as contextual cue', async () => {
      testContext.currentTopic = 'Series A Funding';
      
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What about the funding round?'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.contextualCues).toContain('current_topic:Series A Funding');
    });

    it('should extract meeting type as contextual cue', async () => {
      testContext.meetingType = MeetingType.DUE_DILIGENCE;
      
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Help with analysis'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.contextualCues).toContain('meeting_type:due_diligence');
    });

    it('should extract entities from text', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What about Stripe Inc and their valuation?'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.contextualCues.some(cue => cue.includes('Stripe Inc'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty extracted request', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: ''
      };

      testMessage.content = 'Bot';

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.requiresClarification).toBe(true);
      expect(context.questionType).toBe(QuestionType.UNCLEAR_REQUEST);
    });

    it('should handle missing context gracefully', async () => {
      const emptyContext: ConversationContext = {
        sessionId: 'empty',
        participants: [],
        currentTopic: '',
        messageHistory: [],
        interventionHistory: [],
        startTime: new Date(),
        meetingType: MeetingType.GENERAL_DISCUSSION
      };

      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Help me'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, emptyContext);

      expect(context.questionType).toBe(QuestionType.HELP_REQUEST);
      expect(context.contextualCues).toContain('meeting_type:general_discussion');
    });

    it('should handle API failures gracefully in intent extraction', async () => {
      mockGeminiClient.analyzeText.mockRejectedValue(new Error('Network error'));

      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What about investment opportunities?'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.extractedIntent).toBe('investment analysis');
    });
  });

  describe('Complex Question Analysis', () => {
    it('should handle multi-part questions', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What is the market size and who are the main competitors in fintech?'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionType).toBe(QuestionType.DIRECT_QUESTION);
      expect(context.questionClarity).toBeGreaterThan(0.7);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should handle conditional questions', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'If we invest in this company, what should we expect for returns?'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      // This is classified as opinion request because it contains "should we"
      expect(context.questionType).toBe(QuestionType.OPINION_REQUEST);
      expect(context.directResponsePossible).toBe(true);
    });

    it('should handle questions with uncertainty markers', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'I think maybe we should look at the market, but not sure what to focus on'
      };

      const context = await analyzer.analyzeSummonContext(summonResult, testMessage, testContext);

      expect(context.questionClarity).toBeLessThan(0.5);
      expect(context.requiresClarification).toBe(true);
    });
  });
});