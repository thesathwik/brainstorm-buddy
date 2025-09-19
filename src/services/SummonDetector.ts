import { ChatMessage } from '../models/ChatMessage';
import { 
  SummonResult, 
  SummonConfig, 
  TriggerPhrase, 
  BotMention, 
  ActivityControlCommand 
} from '../models/SummonDetection';
import { SummonType, ActivityLevel } from '../models/Enums';

export interface SummonDetector {
  detectSummon(message: ChatMessage): SummonResult;
  updateConfig(config: Partial<SummonConfig>): void;
  addTriggerPhrase(phrase: TriggerPhrase): void;
  removeTriggerPhrase(phrase: string): void;
}

export class DefaultSummonDetector implements SummonDetector {
  private config: SummonConfig;

  constructor(config?: Partial<SummonConfig>) {
    this.config = {
      botMention: {
        botNames: ['bot', 'assistant', 'ai', 'brainstorm bot', 'proactive bot'],
        aliases: ['bb', 'pb', 'hey bot', 'bot help'],
        patterns: [
          /@bot\b/i,
          /@assistant\b/i,
          /\bbot[,:]?\s/i,
          /\bassistant[,:]?\s/i
        ]
      },
      triggerPhrases: [
        {
          phrase: 'help me',
          type: SummonType.HELP_REQUEST,
          confidence: 0.8,
          requiresExactMatch: false
        },
        {
          phrase: 'can you help',
          type: SummonType.HELP_REQUEST,
          confidence: 0.9,
          requiresExactMatch: false
        },
        {
          phrase: 'what do you think',
          type: SummonType.TRIGGER_PHRASE,
          confidence: 0.7,
          requiresExactMatch: false
        },
        {
          phrase: 'bot input',
          type: SummonType.TRIGGER_PHRASE,
          confidence: 0.9,
          requiresExactMatch: false
        },
        {
          phrase: 'need assistance',
          type: SummonType.HELP_REQUEST,
          confidence: 0.8,
          requiresExactMatch: false
        }
      ],
      activityControlCommands: [
        {
          command: 'be quiet',
          targetLevel: ActivityLevel.QUIET,
          patterns: ['be quiet', 'stay quiet', 'less active', 'tone it down']
        },
        {
          command: 'be silent',
          targetLevel: ActivityLevel.SILENT,
          patterns: ['be silent', 'stop talking', 'shut up', 'no more interruptions']
        },
        {
          command: 'be more active',
          targetLevel: ActivityLevel.ACTIVE,
          patterns: ['be more active', 'speak up', 'more input', 'be helpful']
        },
        {
          command: 'normal activity',
          targetLevel: ActivityLevel.NORMAL,
          patterns: ['normal mode', 'regular activity', 'default behavior', 'reset activity']
        }
      ],
      caseSensitive: false,
      requireDirectAddress: false,
      ...config
    };
  }

  detectSummon(message: ChatMessage): SummonResult {
    const content = this.config.caseSensitive ? message.content : message.content.toLowerCase();
    const originalContent = message.content; // Keep original for extraction
    
    // Check for activity control commands first (highest priority when combined with bot mentions)
    const activityControlResult = this.detectActivityControl(content, originalContent);
    if (activityControlResult.isSummoned) {
      return activityControlResult;
    }

    // Check for bot mentions
    const botMentionResult = this.detectBotMention(content, originalContent);
    if (botMentionResult.isSummoned) {
      return botMentionResult;
    }

    // Check for trigger phrases
    const triggerPhraseResult = this.detectTriggerPhrase(content, originalContent);
    if (triggerPhraseResult.isSummoned) {
      return triggerPhraseResult;
    }

    // No summon detected
    return {
      isSummoned: false,
      summonType: SummonType.BOT_MENTION,
      confidence: 0
    };
  }

  updateConfig(config: Partial<SummonConfig>): void {
    this.config = { ...this.config, ...config };
  }

  addTriggerPhrase(phrase: TriggerPhrase): void {
    this.config.triggerPhrases.push(phrase);
  }

  removeTriggerPhrase(phrase: string): void {
    this.config.triggerPhrases = this.config.triggerPhrases.filter(
      tp => tp.phrase !== phrase
    );
  }

  private detectBotMention(content: string, originalContent: string): SummonResult {
    const { botMention } = this.config;
    
    // Check regex patterns first (more precise)
    // Note: Skip regex patterns if case sensitive and they don't match case
    const contentForRegex = this.config.caseSensitive ? originalContent : content;
    for (const pattern of botMention.patterns) {
      // If case sensitive, create a new pattern without the 'i' flag
      let testPattern = pattern;
      if (this.config.caseSensitive && pattern.flags.includes('i')) {
        testPattern = new RegExp(pattern.source, pattern.flags.replace('i', ''));
      }
      
      const match = contentForRegex.match(testPattern);
      if (match) {
        // Clean up the matched text to remove punctuation
        const cleanedMatch = match[0].replace(/[,:\s]+$/, '').replace(/^[@\s]+/, '');
        return {
          isSummoned: true,
          summonType: SummonType.BOT_MENTION,
          confidence: 0.9,
          mentionedBotName: cleanedMatch,
          extractedRequest: this.extractRequestFromMention(originalContent, match[0])
        };
      }
    }
    
    // Check direct bot names with word boundaries
    for (const botName of botMention.botNames) {
      if (this.config.caseSensitive) {
        // Case sensitive: check exact match in original content
        const regex = new RegExp(`\\b${this.escapeRegex(botName)}\\b`, 'g');
        if (regex.test(originalContent)) {
          return {
            isSummoned: true,
            summonType: SummonType.BOT_MENTION,
            confidence: 0.9,
            mentionedBotName: botName,
            extractedRequest: this.extractRequestFromMention(originalContent, botName)
          };
        }
      } else {
        // Case insensitive: check lowercase match in lowercase content
        const nameToCheck = botName.toLowerCase();
        const regex = new RegExp(`\\b${this.escapeRegex(nameToCheck)}\\b`, 'gi');
        if (regex.test(content)) {
          return {
            isSummoned: true,
            summonType: SummonType.BOT_MENTION,
            confidence: 0.9,
            mentionedBotName: botName,
            extractedRequest: this.extractRequestFromMention(originalContent, botName)
          };
        }
      }
    }

    // Check aliases
    for (const alias of botMention.aliases) {
      const aliasToCheck = this.config.caseSensitive ? alias : alias.toLowerCase();
      if (content.includes(aliasToCheck)) {
        return {
          isSummoned: true,
          summonType: SummonType.BOT_MENTION,
          confidence: 0.8,
          mentionedBotName: alias,
          extractedRequest: this.extractRequestFromMention(originalContent, alias)
        };
      }
    }

    return {
      isSummoned: false,
      summonType: SummonType.BOT_MENTION,
      confidence: 0
    };
  }

  private detectTriggerPhrase(content: string, originalContent: string): SummonResult {
    for (const triggerPhrase of this.config.triggerPhrases) {
      const phraseToCheck = this.config.caseSensitive ? 
        triggerPhrase.phrase : 
        triggerPhrase.phrase.toLowerCase();
      
      let isMatch = false;
      
      if (triggerPhrase.requiresExactMatch) {
        isMatch = content === phraseToCheck;
      } else {
        isMatch = content.includes(phraseToCheck);
      }
      
      if (isMatch) {
        return {
          isSummoned: true,
          summonType: triggerPhrase.type,
          confidence: triggerPhrase.confidence,
          triggerPhrase: triggerPhrase.phrase,
          extractedRequest: this.extractRequestFromTrigger(originalContent, triggerPhrase.phrase)
        };
      }
    }

    return {
      isSummoned: false,
      summonType: SummonType.TRIGGER_PHRASE,
      confidence: 0
    };
  }

  private detectActivityControl(content: string, originalContent: string): SummonResult {
    for (const command of this.config.activityControlCommands) {
      for (const pattern of command.patterns) {
        const patternToCheck = this.config.caseSensitive ? pattern : pattern.toLowerCase();
        
        if (content.includes(patternToCheck)) {
          return {
            isSummoned: true,
            summonType: SummonType.ACTIVITY_CONTROL,
            confidence: 0.9,
            activityLevelChange: command.targetLevel,
            triggerPhrase: pattern,
            extractedRequest: `Change activity level to ${command.targetLevel}`
          };
        }
      }
    }

    return {
      isSummoned: false,
      summonType: SummonType.ACTIVITY_CONTROL,
      confidence: 0
    };
  }

  private extractRequestFromMention(content: string, mentionText: string): string {
    // Find the mention in the content (case insensitive search)
    const lowerContent = content.toLowerCase();
    const lowerMention = mentionText.toLowerCase();
    const mentionIndex = lowerContent.indexOf(lowerMention);
    
    if (mentionIndex === -1) return content.trim();
    
    const afterMention = content.substring(mentionIndex + mentionText.length).trim();
    
    // Remove common separators
    const cleanedRequest = afterMention.replace(/^[,:\-\s]+/, '').trim();
    
    return cleanedRequest || content.trim();
  }

  private extractRequestFromTrigger(content: string, triggerPhrase: string): string {
    // For trigger phrases, return the full content as the request
    return content.trim();
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}