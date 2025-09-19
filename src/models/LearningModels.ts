import { InterventionType } from './Enums';

export interface UserReaction {
  type: UserReactionType;
  timestamp: Date;
  explicit: boolean; // true for direct feedback, false for inferred
  confidence: number; // 0-1 score for inferred reactions
  context?: string;
}

export enum UserReactionType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
  IGNORED = 'ignored',
  DISMISSED = 'dismissed',
  ACKNOWLEDGED = 'acknowledged'
}

export interface FeedbackRecord {
  id: string;
  userId: string;
  interventionId: string;
  reaction: UserReaction;
  conversationContext: string;
  timestamp: Date;
  effectiveness?: EffectivenessScore;
}

export interface EffectivenessScore {
  overall: number; // 0-1 score
  timing: number; // 0-1 score
  relevance: number; // 0-1 score
  tone: number; // 0-1 score
  outcome: ConversationOutcome;
}

export enum ConversationOutcome {
  IMPROVED_FOCUS = 'improved_focus',
  PROVIDED_VALUE = 'provided_value',
  DISRUPTED_FLOW = 'disrupted_flow',
  NO_IMPACT = 'no_impact',
  NEGATIVE_IMPACT = 'negative_impact'
}

export interface InterventionRecord {
  id: string;
  timestamp: Date;
  type: InterventionType;
  trigger: string;
  response: string;
  userReaction?: UserReaction;
  effectiveness?: EffectivenessScore;
  conversationId: string;
  userId: string;
}

export interface InterventionPattern {
  pattern: string;
  successRate: number;
  contexts: string[];
  interventionTypes: InterventionType[];
  userTypes: string[];
  confidence: number;
}

export interface ThresholdAdjustments {
  interventionThreshold: number;
  confidenceThreshold: number;
  timingThreshold: number;
  typePreferences: Map<InterventionType, number>;
}

export interface LearningMetrics {
  totalInterventions: number;
  successRate: number;
  averageEffectiveness: number;
  userSatisfaction: number;
  improvementTrend: number;
  lastUpdated: Date;
}