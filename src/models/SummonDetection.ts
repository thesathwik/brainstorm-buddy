import { SummonType, ActivityLevel } from './Enums';

export interface SummonResult {
  isSummoned: boolean;
  summonType: SummonType;
  confidence: number;
  extractedRequest?: string;
  activityLevelChange?: ActivityLevel;
  triggerPhrase?: string;
  mentionedBotName?: string;
}

export interface SummonContext {
  hasExplicitQuestion: boolean;
  questionClarity: number; // 0-1 score
  requiresClarification: boolean;
  directResponsePossible: boolean;
  questionType: QuestionType;
  contextualCues: string[];
  extractedIntent: string;
}

export enum QuestionType {
  DIRECT_QUESTION = 'direct_question',
  INFORMATION_REQUEST = 'information_request',
  OPINION_REQUEST = 'opinion_request',
  HELP_REQUEST = 'help_request',
  UNCLEAR_REQUEST = 'unclear_request',
  GREETING = 'greeting'
}

export enum ResponseType {
  DIRECT_ANSWER = 'direct_answer',
  CLARIFICATION_NEEDED = 'clarification_needed',
  INFORMATION_REQUEST = 'information_request',
  ACKNOWLEDGMENT = 'acknowledgment'
}

export interface TriggerPhrase {
  phrase: string;
  type: SummonType;
  confidence: number;
  requiresExactMatch: boolean;
}

export interface BotMention {
  botNames: string[];
  aliases: string[];
  patterns: RegExp[];
}

export interface ActivityControlCommand {
  command: string;
  targetLevel: ActivityLevel;
  patterns: string[];
}

export interface SummonConfig {
  botMention: BotMention;
  triggerPhrases: TriggerPhrase[];
  activityControlCommands: ActivityControlCommand[];
  caseSensitive: boolean;
  requireDirectAddress: boolean;
}