import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultSummonDetector } from '../../src/services/SummonDetector';
import { ChatMessage } from '../../src/models/ChatMessage';
import { SummonType, ActivityLevel } from '../../src/models/Enums';

describe('SummonDetector', () => {
  let summonDetector: DefaultSummonDetector;
  let testMessage: ChatMessage;

  beforeEach(() => {
    summonDetector = new DefaultSummonDetector();
    testMessage = {
      id: 'test-msg-1',
      userId: 'user-1',
      content: '',
      timestamp: new Date(),
      metadata: {}
    };
  });

  describe('Bot Mention Detection', () => {
    it('should detect direct bot mention', () => {
      testMessage.content = 'Hey bot, can you help me with this analysis?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.mentionedBotName).toBe('bot');
      expect(result.extractedRequest).toBe('can you help me with this analysis?');
    });

    it('should detect bot mention with @bot pattern', () => {
      testMessage.content = '@bot what do you think about this valuation?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should detect assistant mention', () => {
      testMessage.content = 'Assistant, please provide market data for this sector';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
      expect(result.mentionedBotName).toBe('assistant');
    });

    it('should detect bot aliases', () => {
      testMessage.content = 'bb help me understand this metric';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
      expect(result.mentionedBotName).toBe('bb');
    });

    it('should not detect false positives', () => {
      testMessage.content = 'This robot is interesting but not relevant';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(false);
    });
  });

  describe('Trigger Phrase Detection', () => {
    it('should detect help request trigger', () => {
      testMessage.content = 'Help me understand this market trend?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.HELP_REQUEST);
      expect(result.triggerPhrase).toBe('help me');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect "what do you think" trigger', () => {
      testMessage.content = 'What do you think about this investment opportunity?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.TRIGGER_PHRASE);
      expect(result.triggerPhrase).toBe('what do you think');
    });

    it('should detect "need assistance" trigger', () => {
      testMessage.content = 'I need assistance with this financial model';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.HELP_REQUEST);
      expect(result.triggerPhrase).toBe('need assistance');
    });

    it('should detect trigger phrases when no bot mention is present', () => {
      // Test with a custom trigger phrase that doesn't conflict with bot mentions
      summonDetector.addTriggerPhrase({
        phrase: 'system input needed',
        type: SummonType.TRIGGER_PHRASE,
        confidence: 0.9,
        requiresExactMatch: false
      });
      
      testMessage.content = 'We need system input needed for this analysis';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.TRIGGER_PHRASE);
      expect(result.triggerPhrase).toBe('system input needed');
    });
  });

  describe('Activity Control Detection', () => {
    it('should detect "be quiet" command', () => {
      testMessage.content = 'Please be quiet for now';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(result.activityLevelChange).toBe(ActivityLevel.QUIET);
      expect(result.triggerPhrase).toBe('be quiet');
    });

    it('should detect "be silent" command', () => {
      testMessage.content = 'Please be silent until we ask for input';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(result.activityLevelChange).toBe(ActivityLevel.SILENT);
    });

    it('should detect "be more active" command', () => {
      testMessage.content = 'Please be more active in this discussion';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(result.activityLevelChange).toBe(ActivityLevel.ACTIVE);
    });

    it('should detect "normal activity" command', () => {
      testMessage.content = 'Reset to normal mode please';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(result.activityLevelChange).toBe(ActivityLevel.NORMAL);
    });

    it('should detect alternative activity control phrases', () => {
      testMessage.content = 'Tone it down a bit';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      expect(result.activityLevelChange).toBe(ActivityLevel.QUIET);
    });
  });

  describe('Priority Handling', () => {
    it('should prioritize bot mentions over trigger phrases', () => {
      testMessage.content = 'Bot, what do you think about this?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
      expect(result.mentionedBotName).toBe('bot');
    });

    it('should prioritize activity control over bot mentions', () => {
      testMessage.content = 'Bot, be quiet and help me later';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.ACTIVITY_CONTROL);
      // Activity control now has highest priority
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle case insensitive detection by default', () => {
      testMessage.content = 'BOT, HELP ME WITH THIS';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
    });

    it('should respect case sensitive configuration', () => {
      const caseSensitiveDetector = new DefaultSummonDetector({
        caseSensitive: true,
        botMention: {
          botNames: ['bot', 'assistant'],
          aliases: [],
          patterns: []
        },
        triggerPhrases: [], // Remove trigger phrases
        activityControlCommands: [] // Remove activity control
      });
      
      testMessage.content = 'BOT help me';
      
      const result = caseSensitiveDetector.detectSummon(testMessage);
      
      // Debug: log what was detected
      if (result.isSummoned) {
        console.log('Detected:', result.summonType, result.mentionedBotName || result.triggerPhrase);
      }
      
      expect(result.isSummoned).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should allow adding custom trigger phrases', () => {
      summonDetector.addTriggerPhrase({
        phrase: 'custom trigger',
        type: SummonType.HELP_REQUEST,
        confidence: 0.9,
        requiresExactMatch: false
      });
      
      testMessage.content = 'This is a custom trigger for testing';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.HELP_REQUEST);
      expect(result.triggerPhrase).toBe('custom trigger');
    });

    it('should allow removing trigger phrases', () => {
      summonDetector.removeTriggerPhrase('help me');
      
      testMessage.content = 'Help me with this analysis';
      
      const result = summonDetector.detectSummon(testMessage);
      
      // Should not detect the removed phrase, but might detect "can you help"
      if (result.isSummoned) {
        expect(result.triggerPhrase).not.toBe('help me');
      }
    });

    it('should allow updating configuration', () => {
      summonDetector.updateConfig({
        botMention: {
          botNames: ['custom-bot'],
          aliases: ['cb'],
          patterns: [/custom-bot/i]
        }
      });
      
      testMessage.content = 'custom-bot please help';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.mentionedBotName).toBe('custom-bot');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      testMessage.content = '';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(false);
    });

    it('should handle very long messages', () => {
      testMessage.content = 'This is a very long message that goes on and on about various topics and eventually mentions the bot somewhere in the middle of all this text to see if it can still detect the mention properly';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
    });

    it('should handle messages with special characters', () => {
      testMessage.content = '@bot: can you help with this $100M valuation?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.isSummoned).toBe(true);
      expect(result.summonType).toBe(SummonType.BOT_MENTION);
    });

    it('should extract requests properly with punctuation', () => {
      testMessage.content = 'Bot, can you help with this analysis?';
      
      const result = summonDetector.detectSummon(testMessage);
      
      expect(result.extractedRequest).toBe('can you help with this analysis?');
    });
  });
});