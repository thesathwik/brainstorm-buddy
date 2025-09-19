import { 
  ConversationContext, 
  InterventionDecision, 
  TimingStrategy, 
  BehaviorAdjustment,
  UserPreferences,
  InterventionRecord
} from '../models';
import { 
  InterventionType, 
  Priority, 
  InterventionFrequency,
  InformationType 
} from '../models/Enums';
import { FlowAnalysis, TopicDriftResult, InformationGap } from './ContextAnalyzer';
import { ManualControlManager } from './ManualControlManager';

export interface ConversationState {
  isActive: boolean;
  lastMessageTime: Date;
  pauseDuration: number;
  currentSpeaker?: string;
}

export interface UserFeedback {
  interventionId: string;
  rating: number;
  comment?: string;
  timestamp: Date;
}

export interface FeedbackRecord {
  feedback: UserFeedback;
  context: ConversationContext;
  decision: InterventionDecision;
}

export interface InterventionThresholds {
  topicDriftThreshold: number;
  informationGapThreshold: number;
  engagementThreshold: number;
  momentumThreshold: number;
  confidenceThreshold: number;
}

export interface InterventionDecisionEngine {
  shouldIntervene(
    context: ConversationContext,
    analysis: FlowAnalysis,
    userPreferences: UserPreferences
  ): InterventionDecision;
  
  calculateInterventionTiming(
    decision: InterventionDecision,
    conversationState: ConversationState
  ): TimingStrategy;
  
  adaptBehaviorFromFeedback(
    feedback: UserFeedback,
    interventionHistory: InterventionRecord[]
  ): BehaviorAdjustment;
}

export class DefaultInterventionDecisionEngine implements InterventionDecisionEngine {
  private thresholds: InterventionThresholds;
  private readonly maxInterventionsPerHour = 10;
  private readonly minTimeBetweenInterventions = 2 * 60 * 1000; // 2 minutes in milliseconds
  private manualControlManager?: ManualControlManager;

  constructor(
    customThresholds?: Partial<InterventionThresholds>,
    manualControlManager?: ManualControlManager
  ) {
    this.thresholds = {
      topicDriftThreshold: 0.6,
      informationGapThreshold: 0.7,
      engagementThreshold: 0.3,
      momentumThreshold: 0.2,
      confidenceThreshold: 0.5,
      ...customThresholds
    };
    this.manualControlManager = manualControlManager;
  }

  shouldIntervene(
    context: ConversationContext,
    analysis: FlowAnalysis,
    userPreferences: UserPreferences
  ): InterventionDecision {
    // Check if we've exceeded intervention limits
    if (this.hasExceededInterventionLimits(context, userPreferences)) {
      return this.createNoInterventionDecision('Intervention limit exceeded');
    }

    // Check if enough time has passed since last intervention
    if (!this.hasEnoughTimePassed(context)) {
      return this.createNoInterventionDecision('Too soon since last intervention');
    }

    // Evaluate different intervention scenarios
    const interventionScores = this.evaluateInterventionScenarios(context, analysis, userPreferences);
    
    // Check if we have any intervention scenarios
    if (interventionScores.length === 0) {
      return this.createNoInterventionDecision('No intervention scenarios identified');
    }
    
    // Find the highest scoring intervention
    const bestIntervention = interventionScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    // Check if the best intervention meets our confidence threshold
    if (bestIntervention.score < this.thresholds.confidenceThreshold) {
      return this.createNoInterventionDecision('No intervention meets confidence threshold');
    }

    // Create the base decision
    const baseDecision: InterventionDecision = {
      shouldRespond: true,
      interventionType: bestIntervention.type,
      confidence: bestIntervention.score,
      reasoning: bestIntervention.reasoning,
      priority: this.calculatePriority(bestIntervention.score, bestIntervention.type)
    };

    // Apply manual control override if available
    if (this.manualControlManager) {
      // Get the primary user (first participant) for activity level check
      const primaryUserId = context.participants.length > 0 ? context.participants[0].id : 'default';
      
      const shouldAllowIntervention = this.manualControlManager.shouldAllowIntervention(
        primaryUserId,
        baseDecision.shouldRespond
      );

      if (!shouldAllowIntervention) {
        return this.createNoInterventionDecision('Manual control override: activity level restriction');
      }
    }

    return baseDecision;
  }

  calculateInterventionTiming(
    decision: InterventionDecision,
    conversationState: ConversationState
  ): TimingStrategy {
    if (!decision.shouldRespond) {
      return {
        delaySeconds: 0,
        waitForPause: false,
        interruptThreshold: 0,
        reasoning: 'No intervention needed'
      };
    }

    // Calculate base delay based on intervention type and priority
    let baseDelay = this.getBaseDelayForType(decision.interventionType);
    
    // Adjust delay based on priority
    const priorityMultiplier = this.getPriorityMultiplier(decision.priority);
    baseDelay *= priorityMultiplier;

    // Determine if we should wait for a natural pause
    const waitForPause = this.shouldWaitForPause(decision, conversationState);
    
    // Calculate interrupt threshold based on urgency
    const interruptThreshold = this.calculateInterruptThreshold(decision, conversationState);

    // Adjust timing based on conversation state
    if (conversationState.isActive && conversationState.pauseDuration < 5000) {
      // Conversation is active, increase delay slightly
      baseDelay *= 1.5;
    }

    return {
      delaySeconds: Math.max(1, Math.round(baseDelay)),
      waitForPause,
      interruptThreshold,
      reasoning: `${decision.interventionType} with ${decision.priority} priority, confidence: ${decision.confidence}`
    };
  }

  adaptBehaviorFromFeedback(
    feedback: UserFeedback,
    interventionHistory: InterventionRecord[]
  ): BehaviorAdjustment {
    // Find the intervention that received feedback
    const intervention = interventionHistory.find(i => i.id === feedback.interventionId);
    if (!intervention) {
      return {
        interventionThreshold: this.thresholds.confidenceThreshold,
        frequencyMultiplier: 1.0,
        preferredTypes: Object.values(InterventionType),
        reasoning: 'Intervention not found in history'
      };
    }

    // Calculate adjustment based on feedback rating (1-5 scale)
    const feedbackScore = feedback.rating / 5.0; // Normalize to 0-1
    const adjustmentStrength = 0.1; // How much to adjust based on single feedback

    // Adjust intervention threshold
    let thresholdAdjustment = 0;
    if (feedbackScore < 0.4) {
      // Negative feedback - raise threshold (be more conservative)
      thresholdAdjustment = adjustmentStrength;
    } else if (feedbackScore > 0.8) {
      // Positive feedback - lower threshold (be more proactive)
      thresholdAdjustment = -adjustmentStrength;
    }

    const newThreshold = Math.max(0.1, Math.min(0.9, 
      this.thresholds.confidenceThreshold + thresholdAdjustment
    ));

    // Adjust frequency multiplier
    let frequencyMultiplier = 1.0;
    if (feedbackScore < 0.3) {
      frequencyMultiplier = 0.7; // Reduce frequency for poor feedback
    } else if (feedbackScore > 0.9) {
      frequencyMultiplier = 1.3; // Increase frequency for excellent feedback
    }

    // Determine preferred intervention types based on feedback patterns
    const preferredTypes = this.calculatePreferredTypes(interventionHistory, feedback);

    return {
      interventionThreshold: newThreshold,
      frequencyMultiplier,
      preferredTypes,
      reasoning: `Adjusted based on feedback rating ${feedback.rating}/5 for ${intervention.type}`
    };
  }

  private evaluateInterventionScenarios(
    context: ConversationContext,
    analysis: FlowAnalysis,
    userPreferences: UserPreferences
  ): Array<{ type: InterventionType; score: number; reasoning: string }> {
    const scenarios = [];

    // Topic Redirect Scenario
    const topicRedirectScore = this.evaluateTopicRedirect(context, analysis);
    if (topicRedirectScore.score > 0) {
      scenarios.push({
        type: InterventionType.TOPIC_REDIRECT,
        score: topicRedirectScore.score,
        reasoning: topicRedirectScore.reasoning
      });
    }

    // Information Provide Scenario
    const informationScore = this.evaluateInformationProvide(context, analysis, userPreferences);
    if (informationScore.score > 0) {
      scenarios.push({
        type: InterventionType.INFORMATION_PROVIDE,
        score: informationScore.score,
        reasoning: informationScore.reasoning
      });
    }

    // Fact Check Scenario
    const factCheckScore = this.evaluateFactCheck(context, analysis);
    if (factCheckScore.score > 0) {
      scenarios.push({
        type: InterventionType.FACT_CHECK,
        score: factCheckScore.score,
        reasoning: factCheckScore.reasoning
      });
    }

    // Clarification Request Scenario
    const clarificationScore = this.evaluateClarificationRequest(context, analysis);
    if (clarificationScore.score > 0) {
      scenarios.push({
        type: InterventionType.CLARIFICATION_REQUEST,
        score: clarificationScore.score,
        reasoning: clarificationScore.reasoning
      });
    }

    // Summary Offer Scenario
    const summaryScore = this.evaluateSummaryOffer(context, analysis);
    if (summaryScore.score > 0) {
      scenarios.push({
        type: InterventionType.SUMMARY_OFFER,
        score: summaryScore.score,
        reasoning: summaryScore.reasoning
      });
    }

    return scenarios;
  }

  private evaluateTopicRedirect(
    context: ConversationContext,
    analysis: FlowAnalysis
  ): { score: number; reasoning: string } {
    // Check topic stability - low stability indicates drift
    const driftScore = 1 - analysis.topicStability;
    
    // Check if conversation momentum is decreasing (might indicate confusion)
    const momentumPenalty = analysis.conversationMomentum.direction === 'decreasing' ? 0.3 : 0;
    
    // Check recent message count - don't redirect too early
    const recentMessages = context.messageHistory.slice(-5);
    if (recentMessages.length < 3) {
      return { score: 0, reasoning: 'Not enough messages to assess drift' };
    }

    // Calculate base score
    let score = driftScore + momentumPenalty;

    // Boost score if we haven't had a topic redirect recently
    const recentRedirects = context.interventionHistory
      .filter(i => i.type === InterventionType.TOPIC_REDIRECT)
      .filter(i => Date.now() - i.timestamp.getTime() < 10 * 60 * 1000); // Last 10 minutes

    if (recentRedirects.length === 0) {
      score *= 1.2;
    } else {
      score *= 0.5; // Reduce if we've redirected recently
    }

    // Apply threshold
    if (score < this.thresholds.topicDriftThreshold) {
      return { score: 0, reasoning: 'Topic drift below threshold' };
    }

    return {
      score: Math.min(1, score),
      reasoning: `Topic instability detected (${(driftScore * 100).toFixed(1)}%), momentum: ${analysis.conversationMomentum.direction}`
    };
  }

  private evaluateInformationProvide(
    context: ConversationContext,
    analysis: FlowAnalysis,
    userPreferences: UserPreferences
  ): { score: number; reasoning: string } {
    // Look for information gaps in recent messages
    const recentMessages = context.messageHistory.slice(-3);
    
    // Simple heuristics for information needs (in a real implementation, this would use ContextAnalyzer)
    let informationNeedScore = 0;
    let reasoning = '';

    // Check for company mentions, financial terms, market references
    const informationKeywords = [
      'company', 'valuation', 'revenue', 'market size', 'competition',
      'growth rate', 'metrics', 'data', 'numbers', 'statistics'
    ];

    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which'];
    const uncertaintyWords = ['maybe', 'perhaps', 'i think', 'probably', 'not sure'];

    for (const message of recentMessages) {
      const content = message.originalMessage.content.toLowerCase();
      
      // Check for information keywords
      const hasInfoKeywords = informationKeywords.some(keyword => content.includes(keyword));
      if (hasInfoKeywords) {
        informationNeedScore += 0.3;
      }

      // Check for questions
      const hasQuestions = questionWords.some(word => content.includes(word)) && content.includes('?');
      if (hasQuestions) {
        informationNeedScore += 0.4;
      }

      // Check for uncertainty expressions
      const hasUncertainty = uncertaintyWords.some(word => content.includes(word));
      if (hasUncertainty) {
        informationNeedScore += 0.2;
      }
    }

    // Check user preferences for information types
    const prefersInformation = userPreferences.preferredInformationTypes.length > 0;
    if (prefersInformation) {
      informationNeedScore *= 1.2;
    }

    // Check if we've provided information recently
    const recentInfoProvisions = context.interventionHistory
      .filter(i => i.type === InterventionType.INFORMATION_PROVIDE)
      .filter(i => Date.now() - i.timestamp.getTime() < 5 * 60 * 1000); // Last 5 minutes

    if (recentInfoProvisions.length > 0) {
      informationNeedScore *= 0.6;
    }

    if (informationNeedScore < this.thresholds.informationGapThreshold) {
      return { score: 0, reasoning: 'No significant information gaps detected' };
    }

    return {
      score: Math.min(1, informationNeedScore),
      reasoning: `Information needs detected in recent messages, user prefers: ${userPreferences.preferredInformationTypes.join(', ')}`
    };
  }

  private evaluateFactCheck(
    context: ConversationContext,
    analysis: FlowAnalysis
  ): { score: number; reasoning: string } {
    const recentMessages = context.messageHistory.slice(-3);
    
    // Look for claims that might need fact-checking
    const claimIndicators = [
      'according to', 'studies show', 'data shows', 'research indicates',
      'statistics', 'percent', '%', 'million', 'billion', 'growth of',
      'market is', 'industry', 'competitors'
    ];

    const uncertaintyIndicators = [
      'i heard', 'i think', 'probably', 'maybe', 'not sure',
      'someone told me', 'i believe'
    ];

    let factCheckScore = 0;

    for (const message of recentMessages) {
      const content = message.originalMessage.content.toLowerCase();
      
      // Check for factual claims
      const hasClaims = claimIndicators.some(indicator => content.includes(indicator));
      if (hasClaims) {
        factCheckScore += 0.4;
      }

      // Check for uncertain statements about facts
      const hasUncertainty = uncertaintyIndicators.some(indicator => content.includes(indicator));
      if (hasUncertainty) {
        factCheckScore += 0.3;
      }

      // Check for conflicting information (simple heuristic)
      if (content.includes('but') || content.includes('however') || content.includes('actually')) {
        factCheckScore += 0.2;
      }
    }

    // Don't fact-check too frequently
    const recentFactChecks = context.interventionHistory
      .filter(i => i.type === InterventionType.FACT_CHECK)
      .filter(i => Date.now() - i.timestamp.getTime() < 15 * 60 * 1000); // Last 15 minutes

    if (recentFactChecks.length > 0) {
      factCheckScore *= 0.4;
    }

    if (factCheckScore < 0.5) {
      return { score: 0, reasoning: 'No significant fact-checking opportunities detected' };
    }

    return {
      score: Math.min(1, factCheckScore),
      reasoning: 'Potential factual claims or uncertainties detected that could benefit from verification'
    };
  }

  private evaluateClarificationRequest(
    context: ConversationContext,
    analysis: FlowAnalysis
  ): { score: number; reasoning: string } {
    // Look for confusion or ambiguity in the conversation
    let clarificationScore = 0;

    // Check engagement metrics - low engagement might indicate confusion
    if (analysis.participantEngagement.participationBalance < 0.5) {
      clarificationScore += 0.3;
    }

    // Check for confusion indicators in recent messages
    const recentMessages = context.messageHistory.slice(-3);
    const confusionIndicators = [
      'confused', 'unclear', 'what do you mean', 'can you clarify',
      'i don\'t understand', 'not following', 'lost me', 'explain'
    ];

    for (const message of recentMessages) {
      const content = message.originalMessage.content.toLowerCase();
      const hasConfusion = confusionIndicators.some(indicator => content.includes(indicator));
      if (hasConfusion) {
        clarificationScore += 0.5;
      }
    }

    // Check conversation momentum - if it's decreasing, might need clarification
    if (analysis.conversationMomentum.direction === 'decreasing' && 
        analysis.conversationMomentum.strength > 0.3) {
      clarificationScore += 0.2;
    }

    if (clarificationScore < 0.4) {
      return { score: 0, reasoning: 'No significant need for clarification detected' };
    }

    return {
      score: Math.min(1, clarificationScore),
      reasoning: 'Potential confusion or need for clarification detected in conversation flow'
    };
  }

  private evaluateSummaryOffer(
    context: ConversationContext,
    analysis: FlowAnalysis
  ): { score: number; reasoning: string } {
    // Offer summaries when conversation has been long or complex
    const messageCount = context.messageHistory.length;
    const conversationDuration = Date.now() - context.startTime.getTime();
    const durationMinutes = conversationDuration / (60 * 1000);

    let summaryScore = 0;

    // Score based on conversation length
    if (messageCount > 20) {
      summaryScore += 0.3;
    }
    if (messageCount > 50) {
      summaryScore += 0.2;
    }

    // Score based on duration
    if (durationMinutes > 15) {
      summaryScore += 0.2;
    }
    if (durationMinutes > 30) {
      summaryScore += 0.2;
    }

    // Score based on topic changes
    const topicChanges = context.messageHistory.filter(msg => 
      msg.topicClassification.some(topic => topic.confidence > 0.7)
    ).length;

    if (topicChanges > 3) {
      summaryScore += 0.3;
    }

    // Don't offer summaries too frequently
    const recentSummaries = context.interventionHistory
      .filter(i => i.type === InterventionType.SUMMARY_OFFER)
      .filter(i => Date.now() - i.timestamp.getTime() < 20 * 60 * 1000); // Last 20 minutes

    if (recentSummaries.length > 0) {
      summaryScore *= 0.3;
    }

    if (summaryScore < 0.5) {
      return { score: 0, reasoning: 'Conversation not complex enough to warrant summary' };
    }

    return {
      score: Math.min(1, summaryScore),
      reasoning: `Long conversation (${messageCount} messages, ${durationMinutes.toFixed(1)} minutes) may benefit from summary`
    };
  }

  private hasExceededInterventionLimits(
    context: ConversationContext,
    userPreferences: UserPreferences
  ): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentInterventions = context.interventionHistory.filter(
      i => i.timestamp >= oneHourAgo
    );

    // Adjust limit based on user preferences
    let limit = this.maxInterventionsPerHour;
    switch (userPreferences.interventionFrequency) {
      case InterventionFrequency.MINIMAL:
        limit = Math.floor(limit * 0.3);
        break;
      case InterventionFrequency.MODERATE:
        limit = Math.floor(limit * 0.6);
        break;
      case InterventionFrequency.ACTIVE:
        limit = limit;
        break;
      case InterventionFrequency.VERY_ACTIVE:
        limit = Math.floor(limit * 1.5);
        break;
    }

    return recentInterventions.length >= limit;
  }

  private hasEnoughTimePassed(context: ConversationContext): boolean {
    if (context.interventionHistory.length === 0) {
      return true;
    }

    const lastIntervention = context.interventionHistory[context.interventionHistory.length - 1];
    const timeSinceLastIntervention = Date.now() - lastIntervention.timestamp.getTime();
    
    return timeSinceLastIntervention >= this.minTimeBetweenInterventions;
  }

  private createNoInterventionDecision(reasoning: string): InterventionDecision {
    return {
      shouldRespond: false,
      interventionType: InterventionType.CLARIFICATION_REQUEST, // Default type
      confidence: 0,
      reasoning,
      priority: Priority.LOW
    };
  }

  private calculatePriority(score: number, type: InterventionType): Priority {
    // Fact checks and topic redirects are generally higher priority
    const highPriorityTypes = [InterventionType.FACT_CHECK, InterventionType.TOPIC_REDIRECT];
    const isHighPriorityType = highPriorityTypes.includes(type);

    if (score >= 0.9) {
      return Priority.URGENT;
    } else if (score >= 0.7 || isHighPriorityType) {
      return Priority.HIGH;
    } else if (score >= 0.5) {
      return Priority.MEDIUM;
    } else {
      return Priority.LOW;
    }
  }

  private getBaseDelayForType(type: InterventionType): number {
    // Return delay in seconds
    switch (type) {
      case InterventionType.FACT_CHECK:
        return 3; // Quick fact checks
      case InterventionType.TOPIC_REDIRECT:
        return 5; // Give a moment before redirecting
      case InterventionType.CLARIFICATION_REQUEST:
        return 2; // Quick clarifications
      case InterventionType.INFORMATION_PROVIDE:
        return 4; // Moderate delay for information
      case InterventionType.SUMMARY_OFFER:
        return 8; // Longer delay for summaries
      default:
        return 5;
    }
  }

  private getPriorityMultiplier(priority: Priority): number {
    switch (priority) {
      case Priority.URGENT:
        return 0.3; // Respond very quickly
      case Priority.HIGH:
        return 0.6;
      case Priority.MEDIUM:
        return 1.0;
      case Priority.LOW:
        return 1.5; // Take more time
      default:
        return 1.0;
    }
  }

  private shouldWaitForPause(decision: InterventionDecision, state: ConversationState): boolean {
    // Always wait for pause unless it's urgent
    if (decision.priority === Priority.URGENT) {
      return false;
    }

    // If conversation is very active, wait for pause
    if (state.isActive && state.pauseDuration < 3000) {
      return true;
    }

    return decision.priority !== Priority.HIGH;
  }

  private calculateInterruptThreshold(decision: InterventionDecision, state: ConversationState): number {
    // Higher threshold means more willing to interrupt
    let threshold = 0.3; // Base threshold

    if (decision.priority === Priority.URGENT) {
      threshold = 0.9;
    } else if (decision.priority === Priority.HIGH) {
      threshold = 0.7;
    } else if (decision.priority === Priority.MEDIUM) {
      threshold = 0.5;
    }

    // Adjust based on confidence
    threshold *= decision.confidence;

    return Math.max(0.1, Math.min(1.0, threshold));
  }

  private calculatePreferredTypes(
    interventionHistory: InterventionRecord[],
    feedback: UserFeedback
  ): InterventionType[] {
    // Analyze which intervention types have received positive feedback
    const typeRatings = new Map<InterventionType, number[]>();

    // Collect ratings for each intervention type
    for (const intervention of interventionHistory) {
      if (intervention.userReaction && intervention.userReaction.type === 'positive') {
        const ratings = typeRatings.get(intervention.type as InterventionType) || [];
        ratings.push(5); // Positive reaction = 5 rating
        typeRatings.set(intervention.type as InterventionType, ratings);
      } else if (intervention.userReaction && intervention.userReaction.type === 'negative') {
        const ratings = typeRatings.get(intervention.type as InterventionType) || [];
        ratings.push(1); // Negative reaction = 1 rating
        typeRatings.set(intervention.type as InterventionType, ratings);
      }
    }

    // Calculate average ratings and filter preferred types
    const preferredTypes: InterventionType[] = [];
    
    for (const [type, ratings] of typeRatings) {
      const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      if (avgRating >= 3.5) { // Above neutral
        preferredTypes.push(type);
      }
    }

    // If no clear preferences, return all types
    if (preferredTypes.length === 0) {
      return Object.values(InterventionType);
    }

    return preferredTypes;
  }
}