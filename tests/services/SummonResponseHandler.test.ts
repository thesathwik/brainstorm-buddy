import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultSummonResponseHandler } from '../../src/services/SummonResponseHandler';
import { DefaultManualControlManager } from '../../src/services/ManualControlManager';
import { DefaultSummonContextAnalyzer } from '../../src/services/SummonContextAnalyzer';
import { GeminiApiClient } from '../../src/api/GeminiApiClient';
import { SummonResult, ResponseType, QuestionType } from '../../src/models/SummonDetection';
import { ChatMessage } from '../../src/models/ChatMessage';
import { ConversationContext } from '../../src/models/ConversationContext';
import { SummonType, ActivityLevel, MeetingType } from '../../src/models/Enums';

// Mock the GeminiApiClient and SummonContextAnalyzer
vi.mock('../../src/api/GeminiApiClient');
vi.mock('../../src/services/SummonContextAnalyzer');

describe('SummonResponseHandler', () => {
  let responseHandler: DefaultSummonResponseHandler;
  let mockGeminiClient: vi.Mocked<GeminiApiClient>;
  let mockManualControlManager: DefaultManualControlManager;
  let mockContextAnalyzer: vi.Mocked<DefaultSummonContextAnalyzer>;
  let testMessage: ChatMessage;
  let testContext: ConversationContext;

  beforeEach(() => {
    mockGeminiClient = {
      analyzeText: vi.fn()
    } as any;
    
    mockManualControlManager = new DefaultManualControlManager();
    
    mockContextAnalyzer = {
      analyzeSummonContext: vi.fn(),
      determineResponseType: vi.fn(),
      extractQuestionIntent: vi.fn()
    } as any;
    
    responseHandler = new DefaultSummonResponseHandler(
      mockGeminiClient,
      mockManualControlManager,
      mockContextAnalyzer
    );

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
      currentTopic: 'Investment Analysis',
      messageHistory: [],
      interventionHistory: [],
      startTime: new Date(),
      meetingType: MeetingType.INVESTMENT_REVIEW
    };
  });

  describe('Activity Control Handling', () => {
    it('should handle "be quiet" activity control', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.ACTIVITY_CONTROL,
        confidence: 0.9,
        activityLevelChange: ActivityLevel.QUIET,
        triggerPhrase: 'be quiet'
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.activityLevelChanged).toBe(ActivityLevel.QUIET);
      expect(response.response).toContain('less active');
      expect(response.requiresClarification).toBe(false);
      expect(response.followUpActions).toContain('return_to_monitoring');
      
      // Verify activity level was actually changed
      const currentLevel = mockManualControlManager.getActivityLevel(testMessage.userId);
      expect(currentLevel).toBe(ActivityLevel.QUIET);
    });

    it('should handle "be silent" activity control', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.ACTIVITY_CONTROL,
        confidence: 0.9,
        activityLevelChange: ActivityLevel.SILENT,
        triggerPhrase: 'be silent'
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.activityLevelChanged).toBe(ActivityLevel.SILENT);
      expect(response.response).toContain('silent');
      expect(response.response.toLowerCase()).toContain('mention me directly');
    });

    it('should handle "be more active" activity control', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.ACTIVITY_CONTROL,
        confidence: 0.9,
        activityLevelChange: ActivityLevel.ACTIVE,
        triggerPhrase: 'be more active'
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.activityLevelChanged).toBe(ActivityLevel.ACTIVE);
      expect(response.response).toContain('more proactive');
    });

    it('should handle "normal activity" control', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.ACTIVITY_CONTROL,
        confidence: 0.9,
        activityLevelChange: ActivityLevel.NORMAL,
        triggerPhrase: 'normal mode'
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.activityLevelChanged).toBe(ActivityLevel.NORMAL);
      expect(response.response).toContain('normal activity level');
    });

    it('should not respond to activity control without level change', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.ACTIVITY_CONTROL,
        confidence: 0.9
        // No activityLevelChange
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(false);
    });
  });

  describe('Bot Mention Handling', () => {
    it('should request clarification for unclear bot mentions', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        mentionedBotName: 'bot',
        extractedRequest: '' // Empty request
      };

      // Mock context analyzer to return unclear request
      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.2,
        requiresClarification: true,
        directResponsePossible: false,
        questionType: QuestionType.UNCLEAR_REQUEST,
        contextualCues: [],
        extractedIntent: 'unclear'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.CLARIFICATION_NEEDED);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'What specific information can I help you with?'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(true);
      expect(response.responseType).toBe(ResponseType.CLARIFICATION_NEEDED);
      expect(response.response).toContain('What specifically can I assist with');
    });

    it('should respond to clear bot mention requests', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        mentionedBotName: 'bot',
        extractedRequest: 'help me analyze this market data'
      };

      // Mock context analyzer to return clear request
      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: true,
        questionClarity: 0.8,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.HELP_REQUEST,
        contextualCues: ['current_topic:Investment Analysis'],
        extractedIntent: 'market analysis'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.DIRECT_ANSWER);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can help you analyze market data. What specific metrics are you looking at?'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.responseType).toBe(ResponseType.DIRECT_ANSWER);
      expect(response.followUpActions).toContain('return_to_monitoring');
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        'help me analyze this market data',
        expect.stringContaining('VC brainstorming sessions')
      );
    });

    it('should handle greetings appropriately', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        mentionedBotName: 'bot',
        extractedRequest: 'hi' // Greeting
      };

      // Mock context analyzer to recognize greeting
      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.5,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.GREETING,
        contextualCues: [],
        extractedIntent: 'greeting'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.ACKNOWLEDGMENT);

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.responseType).toBe(ResponseType.ACKNOWLEDGMENT);
      expect(response.response).toMatch(/hello|hi|good/i);
    });
  });

  describe('Help Request Handling', () => {
    it('should respond to help requests with contextual assistance', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.HELP_REQUEST,
        confidence: 0.8,
        triggerPhrase: 'help me',
        extractedRequest: 'I need help understanding this valuation model'
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can help explain valuation models. Which specific aspect would you like me to focus on?'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.followUpActions).toContain('return_to_monitoring');
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        'I need help understanding this valuation model',
        expect.stringContaining('asking for help')
      );
    });

    it('should provide default help response on API failure', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.HELP_REQUEST,
        confidence: 0.8,
        triggerPhrase: 'need assistance',
        extractedRequest: 'Help with financial analysis'
      };

      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.response).toContain('Market research');
      expect(response.response).toContain('Company information');
      expect(response.response).toContain('Investment evaluation');
    });
  });

  describe('Trigger Phrase Handling', () => {
    it('should respond to "what do you think" trigger', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.TRIGGER_PHRASE,
        confidence: 0.7,
        triggerPhrase: 'what do you think',
        extractedRequest: 'What do you think about this investment opportunity?'
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'Based on the information discussed, this investment shows strong potential in the fintech sector.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.followUpActions).toContain('return_to_monitoring');
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        'What do you think about this investment opportunity?',
        expect.stringContaining('trigger phrase "what do you think"')
      );
    });

    it('should handle trigger phrase API failures gracefully', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.TRIGGER_PHRASE,
        confidence: 0.7,
        triggerPhrase: 'bot input',
        extractedRequest: 'We need some bot input on this decision'
      };

      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.response).toBe("I'm ready to help. What would you like me to focus on?");
    });
  });

  describe('Clarification Request Generation', () => {
    it('should generate contextual clarification requests', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'unclear request'
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'Could you clarify what specific aspect of the investment analysis you need help with?'
      });

      const clarification = await responseHandler.generateClarificationRequest(summonResult, testContext);

      expect(clarification).toContain('clarify');
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        '',
        expect.stringContaining('clarification request')
      );
    });

    it('should provide default clarification on API failure', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.HELP_REQUEST,
        confidence: 0.8
      };

      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const clarification = await responseHandler.generateClarificationRequest(summonResult, testContext);

      expect(clarification).toBe('How can I help you with this discussion?');
    });
  });

  describe('Unknown Summon Types', () => {
    it('should not respond to unknown summon types', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: 'unknown_type' as SummonType,
        confidence: 0.9
      };

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(false);
      expect(response.response).toBe('');
      expect(response.requiresClarification).toBe(false);
    });
  });

  describe('Enhanced Summon Response Intelligence', () => {
    it('should provide direct answers to clear questions without asking "what do you need"', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What is the current market size for fintech?'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: true,
        questionClarity: 0.9,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.DIRECT_QUESTION,
        contextualCues: ['entity:fintech'],
        extractedIntent: 'market data'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.DIRECT_ANSWER);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'The global fintech market is valued at approximately $245 billion as of 2023.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.responseType).toBe(ResponseType.DIRECT_ANSWER);
      expect(response.response).not.toContain('what do you need');
      expect(response.response).not.toContain('Based on your question about');
      expect(response.response).toContain('fintech market');
    });

    it('should handle information requests intelligently', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Get me data on Stripe\'s latest funding round'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.8,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.INFORMATION_REQUEST,
        contextualCues: ['entity:Stripe'],
        extractedIntent: 'funding data'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.INFORMATION_REQUEST);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can research Stripe\'s latest funding information. Their Series H round in 2021 raised $600M at a $95B valuation.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.responseType).toBe(ResponseType.INFORMATION_REQUEST);
      expect(response.response).toContain('Stripe');
      expect(response.response).toContain('funding');
    });

    it('should provide intelligent clarification for partially clear requests', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'help with the analysis'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.4,
        requiresClarification: true,
        directResponsePossible: false,
        questionType: QuestionType.HELP_REQUEST,
        contextualCues: ['current_topic:Investment Analysis'],
        extractedIntent: 'analysis help'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.CLARIFICATION_NEEDED);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'Which aspect of the investment analysis would you like help with - financial modeling, market research, or risk assessment?'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(true);
      expect(response.responseType).toBe(ResponseType.CLARIFICATION_NEEDED);
      expect(response.response).toContain('Which aspect');
      expect(response.response).not.toContain('what do you need');
    });

    it('should handle opinion requests directly', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'What do you think about this valuation?'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: true,
        questionClarity: 0.8,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.OPINION_REQUEST,
        contextualCues: ['current_topic:Investment Analysis'],
        extractedIntent: 'valuation opinion'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.DIRECT_ANSWER);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'The valuation appears reasonable given the 40% YoY growth and strong market position, though the revenue multiple is slightly above industry average.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.responseType).toBe(ResponseType.DIRECT_ANSWER);
      expect(response.response).toContain('valuation');
      expect(response.response).not.toContain('what do you think about');
    });

    it('should avoid robotic phrases in responses', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'Tell me about market trends'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.7,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.INFORMATION_REQUEST,
        contextualCues: [],
        extractedIntent: 'market trends'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.INFORMATION_REQUEST);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'Current market trends show increased investment in AI and fintech sectors, with valuations stabilizing after 2022 corrections.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.response).not.toContain('Based on your question about');
      expect(response.response).not.toContain('According to your request');
      expect(response.response).not.toContain('In response to your question');
      expect(response.response).not.toMatch(/what do you need\?$/i);
    });

    it('should include summon context in response for debugging', async () => {
      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'help me'
      };

      const mockSummonContext = {
        hasExplicitQuestion: false,
        questionClarity: 0.6,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.HELP_REQUEST,
        contextualCues: [],
        extractedIntent: 'general help'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue(mockSummonContext);
      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.DIRECT_ANSWER);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can assist with various aspects of your investment analysis.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(response.summonContext).toEqual(mockSummonContext);
    });
  });

  describe('Context Integration', () => {
    it('should include meeting context in responses', async () => {
      testContext.currentTopic = 'Series A Funding Round';
      testContext.meetingType = MeetingType.DUE_DILIGENCE;

      const summonResult: SummonResult = {
        isSummoned: true,
        summonType: SummonType.BOT_MENTION,
        confidence: 0.9,
        extractedRequest: 'help with due diligence'
      };

      mockContextAnalyzer.analyzeSummonContext.mockResolvedValue({
        hasExplicitQuestion: false,
        questionClarity: 0.7,
        requiresClarification: false,
        directResponsePossible: true,
        questionType: QuestionType.HELP_REQUEST,
        contextualCues: ['current_topic:Series A Funding Round', 'meeting_type:due_diligence'],
        extractedIntent: 'due diligence help'
      });

      mockContextAnalyzer.determineResponseType.mockReturnValue(ResponseType.DIRECT_ANSWER);

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'For Series A due diligence, I recommend focusing on financial metrics and market validation.'
      });

      await responseHandler.handleSummon(summonResult, testMessage, testContext);

      expect(mockContextAnalyzer.analyzeSummonContext).toHaveBeenCalledWith(
        summonResult,
        testMessage,
        testContext
      );
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        'help with due diligence',
        expect.stringContaining('Series A Funding Round')
      );
    });

    it('should handle empty context gracefully', async () => {
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
        summonType: SummonType.HELP_REQUEST,
        confidence: 0.8,
        extractedRequest: 'general help'
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can help with various aspects of your discussion.'
      });

      const response = await responseHandler.handleSummon(summonResult, testMessage, emptyContext);

      expect(response.shouldRespond).toBe(true);
      expect(mockGeminiClient.analyzeText).toHaveBeenCalled();
    });
  });
});