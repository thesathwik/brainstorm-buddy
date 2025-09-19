import {
  UserReaction,
  UserReactionType,
  FeedbackRecord,
  EffectivenessScore,
  ConversationOutcome,
  InterventionRecord,
  InterventionPattern,
  ThresholdAdjustments,
  LearningMetrics
} from '../models/LearningModels';
import { InterventionType } from '../models/Enums';
import { BehaviorAdjustment } from '../models/InterventionDecision';

export class LearningModule {
  private feedbackHistory: Map<string, FeedbackRecord[]> = new Map();
  private interventionHistory: Map<string, InterventionRecord[]> = new Map();
  private userMetrics: Map<string, LearningMetrics> = new Map();
  private globalPatterns: InterventionPattern[] = [];

  /**
   * Records the outcome of an intervention for learning purposes
   */
  recordInterventionOutcome(
    intervention: InterventionRecord,
    userReaction: UserReaction,
    conversationOutcome: ConversationOutcome
  ): void {
    // Update intervention record with reaction and effectiveness
    const effectiveness: EffectivenessScore = this.calculateEffectiveness(
      userReaction,
      conversationOutcome,
      intervention
    );

    intervention.userReaction = userReaction;
    intervention.effectiveness = effectiveness;

    // Store in intervention history
    const userInterventions = this.interventionHistory.get(intervention.userId) || [];
    userInterventions.push(intervention);
    this.interventionHistory.set(intervention.userId, userInterventions);

    // Create feedback record
    const feedbackRecord: FeedbackRecord = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: intervention.userId,
      interventionId: intervention.id,
      reaction: userReaction,
      conversationContext: intervention.trigger,
      timestamp: new Date(),
      effectiveness
    };

    // Store in feedback history
    const userFeedback = this.feedbackHistory.get(intervention.userId) || [];
    userFeedback.push(feedbackRecord);
    this.feedbackHistory.set(intervention.userId, userFeedback);

    // Update user metrics
    this.updateUserMetrics(intervention.userId);

    // Update global patterns
    this.updateGlobalPatterns(intervention, effectiveness);
  }

  /**
   * Updates intervention thresholds based on user feedback history
   */
  updateInterventionThresholds(
    userId: string,
    feedbackHistory?: FeedbackRecord[]
  ): ThresholdAdjustments {
    const feedback = feedbackHistory || this.feedbackHistory.get(userId) || [];
    
    if (feedback.length === 0) {
      // Return default thresholds for new users
      return {
        interventionThreshold: 0.7,
        confidenceThreshold: 0.6,
        timingThreshold: 0.5,
        typePreferences: new Map([
          [InterventionType.TOPIC_REDIRECT, 0.7],
          [InterventionType.INFORMATION_PROVIDE, 0.8],
          [InterventionType.FACT_CHECK, 0.9],
          [InterventionType.CLARIFICATION_REQUEST, 0.6],
          [InterventionType.SUMMARY_OFFER, 0.5]
        ])
      };
    }

    // Calculate success rates and adjust thresholds
    const recentFeedback = this.getRecentFeedback(feedback, 30); // Last 30 days
    const successRate = this.calculateSuccessRate(recentFeedback);
    const averageEffectiveness = this.calculateAverageEffectiveness(recentFeedback);

    // Adjust intervention threshold based on success rate
    let interventionThreshold = 0.7;
    if (successRate > 0.8) {
      interventionThreshold = 0.6; // Lower threshold for successful users
    } else if (successRate < 0.4) {
      interventionThreshold = 0.9; // Higher threshold for users who don't respond well
    }

    // Adjust confidence threshold based on effectiveness
    let confidenceThreshold = 0.6;
    if (averageEffectiveness > 0.7) {
      confidenceThreshold = 0.5; // Allow lower confidence for effective interventions
    } else if (averageEffectiveness < 0.4) {
      confidenceThreshold = 0.8; // Require higher confidence for ineffective patterns
    }

    // Calculate type preferences based on historical effectiveness
    const typePreferences = this.calculateTypePreferences(recentFeedback);

    return {
      interventionThreshold,
      confidenceThreshold,
      timingThreshold: 0.5, // Keep timing threshold stable for now
      typePreferences
    };
  }

  /**
   * Identifies successful intervention patterns from historical data
   */
  identifySuccessPatterns(): InterventionPattern[] {
    const patterns: InterventionPattern[] = [];
    const allInterventions = Array.from(this.interventionHistory.values()).flat();

    // Group interventions by context and type
    const contextGroups = this.groupInterventionsByContext(allInterventions);

    for (const [context, interventions] of contextGroups) {
      const successfulInterventions = interventions.filter(
        i => i.effectiveness && i.effectiveness.overall > 0.6
      );

      if (successfulInterventions.length >= 3) { // Minimum sample size
        const successRate = successfulInterventions.length / interventions.length;
        
        if (successRate > 0.6) { // Minimum success rate
          const pattern: InterventionPattern = {
            pattern: context,
            successRate,
            contexts: [context],
            interventionTypes: [...new Set(successfulInterventions.map(i => i.type))],
            userTypes: [...new Set(successfulInterventions.map(i => i.userId))],
            confidence: this.calculatePatternConfidence(successfulInterventions)
          };
          
          patterns.push(pattern);
        }
      }
    }

    // Sort by success rate and confidence
    return patterns.sort((a, b) => 
      (b.successRate * b.confidence) - (a.successRate * a.confidence)
    );
  }

  /**
   * Adapts behavior based on explicit user feedback
   */
  adaptBehaviorFromFeedback(
    feedback: UserReaction,
    interventionHistory: InterventionRecord[]
  ): BehaviorAdjustment {
    const recentInterventions = interventionHistory.slice(-10); // Last 10 interventions
    
    let frequencyMultiplier = 1.0;
    let interventionThreshold = 0.7;
    let preferredTypes: InterventionType[] = [];

    switch (feedback.type) {
      case UserReactionType.POSITIVE:
        frequencyMultiplier = 1.2; // Increase intervention frequency
        interventionThreshold = 0.6; // Lower threshold
        preferredTypes = this.getSuccessfulTypes(recentInterventions);
        break;

      case UserReactionType.NEGATIVE:
        frequencyMultiplier = 0.5; // Reduce intervention frequency
        interventionThreshold = 0.9; // Higher threshold
        preferredTypes = [InterventionType.CLARIFICATION_REQUEST]; // Safe fallback
        break;

      case UserReactionType.IGNORED:
        frequencyMultiplier = 0.8; // Slightly reduce frequency
        interventionThreshold = 0.8; // Slightly higher threshold
        preferredTypes = this.getHighImpactTypes(recentInterventions);
        break;

      default:
        // Keep current settings for neutral/acknowledged feedback
        break;
    }

    return {
      interventionThreshold,
      frequencyMultiplier,
      preferredTypes,
      reasoning: `Adapted based on ${feedback.type} feedback with ${feedback.confidence} confidence`
    };
  }

  /**
   * Gets learning metrics for a specific user
   */
  getUserMetrics(userId: string): LearningMetrics | null {
    return this.userMetrics.get(userId) || null;
  }

  /**
   * Gets global learning patterns
   */
  getGlobalPatterns(): InterventionPattern[] {
    return [...this.globalPatterns];
  }

  // Private helper methods

  private calculateEffectiveness(
    userReaction: UserReaction,
    conversationOutcome: ConversationOutcome,
    intervention: InterventionRecord
  ): EffectivenessScore {
    let overall = 0.5; // Default neutral score
    let timing = 0.5;
    let relevance = 0.5;
    let tone = 0.5;

    // Score based on user reaction
    switch (userReaction.type) {
      case UserReactionType.POSITIVE:
        overall += 0.3;
        tone += 0.3;
        break;
      case UserReactionType.ACKNOWLEDGED:
        overall += 0.1;
        break;
      case UserReactionType.NEGATIVE:
        overall -= 0.3;
        tone -= 0.3;
        break;
      case UserReactionType.IGNORED:
        overall -= 0.1;
        relevance -= 0.2;
        break;
      case UserReactionType.DISMISSED:
        overall -= 0.2;
        relevance -= 0.3;
        break;
    }

    // Score based on conversation outcome
    switch (conversationOutcome) {
      case ConversationOutcome.IMPROVED_FOCUS:
        overall += 0.2;
        relevance += 0.3;
        timing += 0.2;
        break;
      case ConversationOutcome.PROVIDED_VALUE:
        overall += 0.3;
        relevance += 0.4;
        break;
      case ConversationOutcome.DISRUPTED_FLOW:
        overall -= 0.3;
        timing -= 0.4;
        break;
      case ConversationOutcome.NEGATIVE_IMPACT:
        overall -= 0.4;
        timing -= 0.3;
        relevance -= 0.2;
        break;
    }

    // Ensure scores are within 0-1 range
    overall = Math.max(0, Math.min(1, overall));
    timing = Math.max(0, Math.min(1, timing));
    relevance = Math.max(0, Math.min(1, relevance));
    tone = Math.max(0, Math.min(1, tone));

    return {
      overall,
      timing,
      relevance,
      tone,
      outcome: conversationOutcome
    };
  }

  private updateUserMetrics(userId: string): void {
    const interventions = this.interventionHistory.get(userId) || [];
    const feedback = this.feedbackHistory.get(userId) || [];

    if (interventions.length === 0) return;

    const effectiveInterventions = interventions.filter(
      i => i.effectiveness && i.effectiveness.overall > 0.5
    );

    const successRate = effectiveInterventions.length / interventions.length;
    const averageEffectiveness = interventions
      .filter(i => i.effectiveness)
      .reduce((sum, i) => sum + i.effectiveness!.overall, 0) / interventions.length;

    const positiveReactions = feedback.filter(
      f => f.reaction.type === UserReactionType.POSITIVE || 
           f.reaction.type === UserReactionType.ACKNOWLEDGED
    ).length;
    const userSatisfaction = feedback.length > 0 ? positiveReactions / feedback.length : 0.5;

    // Calculate improvement trend (last 10 vs previous 10)
    const recentInterventions = interventions.slice(-10);
    const previousInterventions = interventions.slice(-20, -10);
    
    let improvementTrend = 0;
    if (previousInterventions.length > 0 && recentInterventions.length > 0) {
      const recentAvg = recentInterventions
        .filter(i => i.effectiveness)
        .reduce((sum, i) => sum + i.effectiveness!.overall, 0) / recentInterventions.length;
      const previousAvg = previousInterventions
        .filter(i => i.effectiveness)
        .reduce((sum, i) => sum + i.effectiveness!.overall, 0) / previousInterventions.length;
      
      improvementTrend = recentAvg - previousAvg;
    }

    const metrics: LearningMetrics = {
      totalInterventions: interventions.length,
      successRate,
      averageEffectiveness,
      userSatisfaction,
      improvementTrend,
      lastUpdated: new Date()
    };

    this.userMetrics.set(userId, metrics);
  }

  private updateGlobalPatterns(intervention: InterventionRecord, effectiveness: EffectivenessScore): void {
    // This is a simplified pattern update - in a real system, this would be more sophisticated
    const patternKey = `${intervention.type}_${intervention.trigger.substring(0, 20)}`;
    
    let existingPattern = this.globalPatterns.find(p => p.pattern === patternKey);
    
    if (!existingPattern) {
      existingPattern = {
        pattern: patternKey,
        successRate: effectiveness.overall > 0.6 ? 1 : 0,
        contexts: [intervention.trigger],
        interventionTypes: [intervention.type],
        userTypes: [intervention.userId],
        confidence: 0.1 // Low confidence for new patterns
      };
      this.globalPatterns.push(existingPattern);
    } else {
      // Update existing pattern (simplified)
      const isSuccess = effectiveness.overall > 0.6;
      existingPattern.successRate = (existingPattern.successRate + (isSuccess ? 1 : 0)) / 2;
      existingPattern.confidence = Math.min(1, existingPattern.confidence + 0.1);
    }
  }

  private getRecentFeedback(feedback: FeedbackRecord[], days: number): FeedbackRecord[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return feedback.filter(f => f.timestamp >= cutoffDate);
  }

  private calculateSuccessRate(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0.5;
    
    const successfulFeedback = feedback.filter(
      f => f.reaction.type === UserReactionType.POSITIVE || 
           f.reaction.type === UserReactionType.ACKNOWLEDGED
    );
    
    return successfulFeedback.length / feedback.length;
  }

  private calculateAverageEffectiveness(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0.5;
    
    const effectivenessScores = feedback
      .filter(f => f.effectiveness)
      .map(f => f.effectiveness!.overall);
    
    if (effectivenessScores.length === 0) return 0.5;
    
    return effectivenessScores.reduce((sum, score) => sum + score, 0) / effectivenessScores.length;
  }

  private calculateTypePreferences(feedback: FeedbackRecord[]): Map<InterventionType, number> {
    const typePreferences = new Map<InterventionType, number>();
    
    // Initialize with default values
    Object.values(InterventionType).forEach(type => {
      typePreferences.set(type, 0.7);
    });

    // Group feedback by intervention type
    const interventions = feedback
      .map(f => this.interventionHistory.get(f.userId)?.find(i => i.id === f.interventionId))
      .filter(i => i !== undefined) as InterventionRecord[];

    const typeGroups = new Map<InterventionType, FeedbackRecord[]>();
    interventions.forEach(intervention => {
      const relatedFeedback = feedback.find(f => f.interventionId === intervention.id);
      if (relatedFeedback) {
        const existing = typeGroups.get(intervention.type) || [];
        existing.push(relatedFeedback);
        typeGroups.set(intervention.type, existing);
      }
    });

    // Calculate preferences based on success rates
    typeGroups.forEach((typeFeedback, type) => {
      const successRate = this.calculateSuccessRate(typeFeedback);
      const avgEffectiveness = this.calculateAverageEffectiveness(typeFeedback);
      
      // Combine success rate and effectiveness for preference score
      const preference = (successRate * 0.6) + (avgEffectiveness * 0.4);
      typePreferences.set(type, Math.max(0.3, Math.min(0.9, preference)));
    });

    return typePreferences;
  }

  private groupInterventionsByContext(interventions: InterventionRecord[]): Map<string, InterventionRecord[]> {
    const groups = new Map<string, InterventionRecord[]>();
    
    interventions.forEach(intervention => {
      // Simplified context grouping - in reality, this would use more sophisticated NLP
      const contextKey = intervention.trigger.split(' ').slice(0, 3).join(' ');
      const existing = groups.get(contextKey) || [];
      existing.push(intervention);
      groups.set(contextKey, existing);
    });
    
    return groups;
  }

  private calculatePatternConfidence(interventions: InterventionRecord[]): number {
    const sampleSize = interventions.length;
    const avgEffectiveness = interventions
      .filter(i => i.effectiveness)
      .reduce((sum, i) => sum + i.effectiveness!.overall, 0) / interventions.length;
    
    // Confidence increases with sample size and effectiveness
    const sizeConfidence = Math.min(1, sampleSize / 10); // Max confidence at 10+ samples
    const effectivenessConfidence = avgEffectiveness;
    
    return (sizeConfidence * 0.4) + (effectivenessConfidence * 0.6);
  }

  private getSuccessfulTypes(interventions: InterventionRecord[]): InterventionType[] {
    const typeSuccess = new Map<InterventionType, number>();
    
    interventions.forEach(intervention => {
      if (intervention.effectiveness && intervention.effectiveness.overall > 0.6) {
        const current = typeSuccess.get(intervention.type) || 0;
        typeSuccess.set(intervention.type, current + 1);
      }
    });
    
    return Array.from(typeSuccess.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  private getHighImpactTypes(interventions: InterventionRecord[]): InterventionType[] {
    // Return types that typically have high impact even if ignored
    return [
      InterventionType.FACT_CHECK,
      InterventionType.INFORMATION_PROVIDE,
      InterventionType.TOPIC_REDIRECT
    ];
  }
}