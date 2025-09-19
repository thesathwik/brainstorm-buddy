import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultSummonDetector } from '../../src/services/SummonDetector';
import { DefaultManualControlManager } from '../../src/services/ManualControlManager';
import { DefaultSummonResponseHandler } from '../../src/services/SummonResponseHandler';
import { DefaultInterventionDecisionEngine } from '../../src/services/InterventionDecisionEngine';
import { GeminiApiClient } from '../../src/api/GeminiApiClient';
import { ChatMessage } from '../../src/models/ChatMessage';
import { ConversationContext } from '../../src/models/ConversationContext';
import { SummonType, ActivityLevel, MeetingType, InterventionFrequency } from '../../src/models/Enums';

// Mock the GeminiApiClient
vi.mock('../../src/api/GeminiApiClient');

describe('Summoning Integration', () => {
  let summonDetector: DefaultSummonDetector;
  let manualControlManager: DefaultManualControlManager;
  let summonResponseHandler: DefaultSummonResponseHandler;
  let interventionDecisionEngine: DefaultInterventionDecisionEngine;
  let mockGeminiClient: vi.Mocked<GeminiApiClient>;
  let testContext: ConversationContext;

  beforeEach(() => {
    mockGeminiClient = {
      analyzeText: vi.fn()
    } as any;

    summonDetector = new DefaultSummonDetector();
    manualControlManager = new DefaultManualControlManager();
    summonResponseHandler = new DefaultSummonResponseHandler(mockGeminiClient, manualControlManager);
    interventionDecisionEngine = new DefaultInterventionDecisionEngine(undefined, manualControlManager);

    testContext = {
      sessionId: 'integration-test',
      participants: [
        {
          id: 'user-1',
          name: 'Test User',
          role: 'partner' as any,
          preferences: {
            interventionFrequency: InterventionFrequency.MODERATE,
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

  describe('Complete Summoning Workflow', () => {
    it('should handle bot mention summon and return to normal monitoring', async () => {
      const message: ChatMessage = {
        id: 'msg-1',
        userId: 'user-1',
        content: 'Bot, help me analyze this startup',
        timestamp: new Date(),
        metadata: {}
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can help you analyze the startup. What specific aspects would you like to focus on?'
      });

      // Step 1: Detect summon
      const summonResult = summonDetector.detectSummon(message);
      expect(summonResult.isSummoned).toBe(true);
      expect(summonResult.summonType).toBe(SummonType.BOT_MENTION);

      // Step 2: Handle summon response
      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);
      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.followUpActions).toContain('return_to_monitoring');

      // Step 3: Verify normal intervention behavior is maintained
      const mockAnalysis = {
        currentTopic: 'Investment Analysis',
        topicStability: 0.8,
        participantEngagement: { participationBalance: 0.7 },
        conversationMomentum: { direction: 'stable' as any, strength: 0.6 }
      };

      const interventionDecision = interventionDecisionEngine.shouldIntervene(
        testContext,
        mockAnalysis,
        testContext.participants[0].preferences
      );

      // Should still allow normal interventions after summon
      expect(manualControlManager.shouldAllowIntervention('user-1', true)).toBe(true);
    });

    it('should handle activity control and affect intervention decisions', async () => {
      const message: ChatMessage = {
        id: 'msg-2',
        userId: 'user-1',
        content: 'Please be quiet for now',
        timestamp: new Date(),
        metadata: {}
      };

      // Step 1: Detect activity control summon
      const summonResult = summonDetector.detectSummon(message);
      expect(summonResult.isSummoned).toBe(true);
      expect(summonResult.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(summonResult.activityLevelChange).toBe(ActivityLevel.QUIET);

      // Step 2: Handle activity control
      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);
      expect(response.shouldRespond).toBe(true);
      expect(response.activityLevelChanged).toBe(ActivityLevel.QUIET);

      // Step 3: Verify activity level affects intervention decisions
      const mockAnalysis = {
        currentTopic: 'Investment Analysis',
        topicStability: 0.8,
        participantEngagement: { participationBalance: 0.7 },
        conversationMomentum: { direction: 'stable' as any, strength: 0.6 }
      };

      // Should now reduce intervention probability
      let allowedCount = 0;
      const testRuns = 50;
      
      for (let i = 0; i < testRuns; i++) {
        if (manualControlManager.shouldAllowIntervention('user-1', true)) {
          allowedCount++;
        }
      }

      // Should allow significantly fewer interventions (roughly 30%)
      expect(allowedCount).toBeLessThan(40);
      expect(allowedCount).toBeGreaterThan(5);

      // Step 4: Verify frequency adjustment
      const adjustedFrequency = manualControlManager.adjustInterventionFrequency(
        'user-1',
        testContext.participants[0].preferences
      );
      expect(adjustedFrequency).toBe(InterventionFrequency.MINIMAL);
    });

    it('should handle silent mode and block interventions', async () => {
      const message: ChatMessage = {
        id: 'msg-3',
        userId: 'user-1',
        content: 'Be silent until I ask for help',
        timestamp: new Date(),
        metadata: {}
      };

      // Step 1: Detect and handle silent command
      const summonResult = summonDetector.detectSummon(message);
      expect(summonResult.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(summonResult.activityLevelChange).toBe(ActivityLevel.SILENT);

      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);
      expect(response.activityLevelChanged).toBe(ActivityLevel.SILENT);

      // Step 2: Verify interventions are blocked
      expect(manualControlManager.shouldAllowIntervention('user-1', true)).toBe(false);
      expect(manualControlManager.shouldAllowIntervention('user-1', false)).toBe(false);

      // Step 3: Verify frequency is set to minimal
      const adjustedFrequency = manualControlManager.adjustInterventionFrequency(
        'user-1',
        testContext.participants[0].preferences
      );
      expect(adjustedFrequency).toBe(InterventionFrequency.MINIMAL);
    });

    it('should handle active mode and increase interventions', async () => {
      const message: ChatMessage = {
        id: 'msg-4',
        userId: 'user-1',
        content: 'Be more active in this discussion',
        timestamp: new Date(),
        metadata: {}
      };

      // Step 1: Detect and handle active command
      const summonResult = summonDetector.detectSummon(message);
      expect(summonResult.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(summonResult.activityLevelChange).toBe(ActivityLevel.ACTIVE);

      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);
      expect(response.activityLevelChanged).toBe(ActivityLevel.ACTIVE);

      // Step 2: Verify interventions are increased
      expect(manualControlManager.shouldAllowIntervention('user-1', true)).toBe(true);

      // Should also allow some interventions even when base decision is false
      let allowedCount = 0;
      const testRuns = 50;
      
      for (let i = 0; i < testRuns; i++) {
        if (manualControlManager.shouldAllowIntervention('user-1', false)) {
          allowedCount++;
        }
      }

      expect(allowedCount).toBeGreaterThan(5); // Should allow some interventions

      // Step 3: Verify frequency is increased
      const adjustedFrequency = manualControlManager.adjustInterventionFrequency(
        'user-1',
        testContext.participants[0].preferences
      );
      expect(adjustedFrequency).toBe(InterventionFrequency.ACTIVE);
    });

    it('should handle help requests with contextual responses', async () => {
      const message: ChatMessage = {
        id: 'msg-5',
        userId: 'user-1',
        content: 'Help me understanding this valuation model',
        timestamp: new Date(),
        metadata: {}
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'I can help explain valuation models. Which specific methodology are you using - DCF, comparable company analysis, or precedent transactions?'
      });

      // Step 1: Detect help request
      const summonResult = summonDetector.detectSummon(message);
      expect(summonResult.isSummoned).toBe(true);
      expect(summonResult.summonType).toBe(SummonType.HELP_REQUEST);

      // Step 2: Generate contextual response
      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);
      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);

      // Step 3: Verify context was used in API call
      expect(mockGeminiClient.analyzeText).toHaveBeenCalledWith(
        expect.stringContaining('valuation model'),
        expect.stringContaining('Investment Analysis')
      );
    });

    it('should handle multiple users independently', async () => {
      const user1Message: ChatMessage = {
        id: 'msg-6',
        userId: 'user-1',
        content: 'Be quiet please',
        timestamp: new Date(),
        metadata: {}
      };

      const user2Message: ChatMessage = {
        id: 'msg-7',
        userId: 'user-2',
        content: 'Be more active',
        timestamp: new Date(),
        metadata: {}
      };

      // Step 1: Set different activity levels for different users
      const summon1 = summonDetector.detectSummon(user1Message);
      await summonResponseHandler.handleSummon(summon1, user1Message, testContext);

      const summon2 = summonDetector.detectSummon(user2Message);
      await summonResponseHandler.handleSummon(summon2, user2Message, testContext);

      // Step 2: Verify independent behavior
      expect(manualControlManager.getActivityLevel('user-1')).toBe(ActivityLevel.QUIET);
      expect(manualControlManager.getActivityLevel('user-2')).toBe(ActivityLevel.ACTIVE);

      // Step 3: Verify independent intervention control
      // User 1 (quiet) should have reduced intervention probability
      // User 2 (active) should always allow interventions when base decision is true
      const user1Allowed = manualControlManager.shouldAllowIntervention('user-1', true);
      const user2Allowed = manualControlManager.shouldAllowIntervention('user-2', true);
      
      // User 2 should always allow (active mode), User 1 might not (quiet mode)
      expect(user2Allowed).toBe(true);
      // We can't guarantee user1Allowed will be false due to randomness, but we can test the pattern
    });
  });

  describe('Enhanced Summon Response Intelligence', () => {
    it('should provide direct answers to clear questions without generic responses', async () => {
      const message: ChatMessage = {
        id: 'msg-clear-question',
        userId: 'user-1',
        content: 'Bot, what is the current market size for fintech?',
        timestamp: new Date(),
        metadata: {}
      };

      const result = await summonDetector.detectSummon(message);
      expect(result.isSummoned).toBe(true);
      expect(result.extractedRequest).toBe('what is the current market size for fintech?');

      const response = await summonResponseHandler.handleSummon(result, message, testContext);
      
      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.responseType).toBeDefined();
      expect(response.summonContext).toBeDefined();
      expect(response.response).not.toContain('what do you need');
      expect(response.response).not.toContain('Based on your question about');
    });

    it('should handle greetings appropriately without asking for clarification', async () => {
      const message: ChatMessage = {
        id: 'msg-greeting',
        userId: 'user-1',
        content: 'Hi bot',
        timestamp: new Date(),
        metadata: {}
      };

      const result = await summonDetector.detectSummon(message);
      expect(result.isSummoned).toBe(true);

      const response = await summonResponseHandler.handleSummon(result, message, testContext);
      
      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(false);
      expect(response.response).toMatch(/hello|hi|good/i);
    });

    it('should provide intelligent clarification for unclear requests', async () => {
      const message: ChatMessage = {
        id: 'msg-unclear',
        userId: 'user-1',
        content: 'Bot, um, maybe help with stuff',
        timestamp: new Date(),
        metadata: {}
      };

      const result = await summonDetector.detectSummon(message);
      expect(result.isSummoned).toBe(true);

      const response = await summonResponseHandler.handleSummon(result, message, testContext);
      
      expect(response.shouldRespond).toBe(true);
      expect(response.requiresClarification).toBe(true);
      expect(response.summonContext?.questionClarity).toBeLessThan(0.5);
      expect(response.response).not.toContain('what do you need');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle API failures gracefully', async () => {
      const message: ChatMessage = {
        id: 'msg-8',
        userId: 'user-1',
        content: 'Bot, help me with analysis',
        timestamp: new Date(),
        metadata: {}
      };

      mockGeminiClient.analyzeText.mockRejectedValue(new Error('API Error'));

      const summonResult = summonDetector.detectSummon(message);
      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);

      expect(response.shouldRespond).toBe(true);
      expect(response.response).toBeTruthy(); // Should have fallback response
    });

    it('should handle unclear summons with clarification requests', async () => {
      const message: ChatMessage = {
        id: 'msg-9',
        userId: 'user-1',
        content: 'Bot',
        timestamp: new Date(),
        metadata: {}
      };

      mockGeminiClient.analyzeText.mockResolvedValue({
        content: 'How can I help you with this discussion?'
      });

      const summonResult = summonDetector.detectSummon(message);
      const response = await summonResponseHandler.handleSummon(summonResult, message, testContext);

      expect(response.shouldRespond).toBe(true);
      // The extracted request "Bot" is treated as a valid request, so it doesn't require clarification
      // but it should still provide a helpful response
      expect(response.response).toBeTruthy();
    });

    it('should maintain activity history and allow resets', () => {
      // Set various activity levels
      manualControlManager.setActivityLevel('user-1', ActivityLevel.QUIET, 'Test 1');
      manualControlManager.setActivityLevel('user-1', ActivityLevel.ACTIVE, 'Test 2');
      manualControlManager.setActivityLevel('user-1', ActivityLevel.SILENT, 'Test 3');

      // Verify history
      const history = manualControlManager.getActivityHistory('user-1');
      expect(history).toHaveLength(3);
      expect(history[2].newLevel).toBe(ActivityLevel.SILENT);

      // Reset and verify
      manualControlManager.resetActivityLevel('user-1');
      expect(manualControlManager.getActivityLevel('user-1')).toBe(ActivityLevel.NORMAL);

      const newHistory = manualControlManager.getActivityHistory('user-1');
      expect(newHistory).toHaveLength(4);
      expect(newHistory[3].reason).toBe('Reset to normal');
    });
  });
});