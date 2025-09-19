import { InterventionType, Priority } from './Enums';

export interface InterventionDecision {
  shouldRespond: boolean;
  interventionType: InterventionType;
  confidence: number; // 0-1 score
  reasoning: string;
  priority: Priority;
}

export interface TimingStrategy {
  delaySeconds: number;
  waitForPause: boolean;
  interruptThreshold: number;
  reasoning: string;
}

export interface BehaviorAdjustment {
  interventionThreshold: number;
  frequencyMultiplier: number;
  preferredTypes: InterventionType[];
  reasoning: string;
}