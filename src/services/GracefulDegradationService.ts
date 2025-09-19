import { InterventionType } from '../models/Enums';
import { BotResponse } from './ResponseGenerator';
import { ConversationContext } from '../models/ConversationContext';
import { logger } from '../config/logger';

export enum DegradationLevel {
  NONE = 'none',
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  SEVERE = 'severe',
  OFFLINE = 'offline'
}

export enum ConflictType {
  CONTRADICTORY_INFORMATION = 'contradictory_information',
  AMBIGUOUS_CONTEXT = 'ambiguous_context',
  INSUFFICIENT_DATA = 'insufficient_data',
  MULTIPLE_INTERPRETATIONS = 'multiple_interpretations',
  UNCERTAIN_FACTS = 'uncertain_facts'
}

export interface ConflictResolution {
  type: ConflictType;
  confidence: number;
  recommendedAction: RecommendedAction;
  alternatives: Alternative[];
  explanation: string;
}

export interface Alternative {
  description: string;
  confidence: number;
  sources: string[];
  reasoning: string;
}

export enum RecommendedAction {
  REQUEST_CLARIFICATION = 'request_clarification',
  PRESENT_ALTERNATIVES = 'present_alternatives',
  DEFER_TO_HUMAN = 'defer_to_human',
  USE_CONSERVATIVE_APPROACH = 'use_conservative_approach',
  ACKNOWLEDGE_UNCERTAINTY = 'acknowledge_uncertainty'
}

export interface DegradationStrategy {
  level: DegradationLevel;
  description: string;
  capabilities: string[];
  limitations: string[];
  fallbackBehaviors: FallbackBehavior[];
}

export interface FallbackBehavior {
  trigger: string;
  action: string;
  responseTemplate: string;
}

/**
 * Service for handling graceful degradation when facing ambiguous or conflicting information
 */
export class GracefulDegradationService {
  private currentDegradationLevel: DegradationLevel = DegradationLevel.NONE;
  private degradationStrategies: Map<DegradationLevel, DegradationStrategy>;
  private conflictHistory: ConflictResolution[] = [];

  constructor() {
    this.degradationStrategies = this.initializeDegradationStrategies();
  }

  /**
   * Analyze potential conflicts or ambiguities in information
   */
  analyzeInformationConflicts(
    information: any[],
    context: ConversationContext
  ): ConflictResolution | null {
    // Check for insufficient data first (most specific)
    if (this.hasInsufficientData(information, context)) {
      return this.createConflictResolution(
        ConflictType.INSUFFICIENT_DATA,
        ['Limited information available'],
        context
      );
    }

    // Check for contradictory information
    const contradictions = this.detectContradictions(information);
    if (contradictions.length > 0) {
      return this.createConflictResolution(
        ConflictType.CONTRADICTORY_INFORMATION,
        contradictions,
        context
      );
    }

    // Check for multiple valid interpretations
    const interpretations = this.detectMultipleInterpretations(information, context);
    if (interpretations.length > 1) {
      return this.createConflictResolution(
        ConflictType.MULTIPLE_INTERPRETATIONS,
        interpretations,
        context
      );
    }

    // Check for ambiguous context (least specific, catch-all)
    const ambiguities = this.detectAmbiguities(information, context);
    if (ambiguities.length > 0) {
      return this.createConflictResolution(
        ConflictType.AMBIGUOUS_CONTEXT,
        ambiguities,
        context
      );
    }

    return null;
  }

  /**
   * Generate a graceful response when conflicts are detected
   */
  generateGracefulResponse(
    conflict: ConflictResolution,
    originalInterventionType: InterventionType,
    context: ConversationContext
  ): BotResponse {
    const strategy = this.degradationStrategies.get(this.currentDegradationLevel)!;
    
    let content: string;
    let confidence: number;

    switch (conflict.recommendedAction) {
      case RecommendedAction.REQUEST_CLARIFICATION:
        content = this.generateClarificationRequest(conflict, context);
        confidence = 0.7;
        break;

      case RecommendedAction.PRESENT_ALTERNATIVES:
        content = this.generateAlternativesPresentation(conflict, context);
        confidence = 0.6;
        break;

      case RecommendedAction.DEFER_TO_HUMAN:
        content = this.generateHumanDeferral(conflict, context);
        confidence = 0.8;
        break;

      case RecommendedAction.USE_CONSERVATIVE_APPROACH:
        content = this.generateConservativeResponse(conflict, context);
        confidence = 0.5;
        break;

      case RecommendedAction.ACKNOWLEDGE_UNCERTAINTY:
        content = this.generateUncertaintyAcknowledgment(conflict, context);
        confidence = 0.6;
        break;

      default:
        content = this.generateFallbackResponse(conflict, context);
        confidence = 0.4;
    }

    // Record the conflict for learning
    this.recordConflict(conflict);

    return {
      content,
      type: originalInterventionType,
      confidence,
      sources: [{
        type: 'api',
        description: 'Graceful degradation response',
        timestamp: new Date()
      }],
      followUpSuggestions: this.generateFollowUpSuggestions(conflict)
    };
  }

  /**
   * Set the current degradation level based on system health
   */
  setDegradationLevel(level: DegradationLevel): void {
    const previousLevel = this.currentDegradationLevel;
    this.currentDegradationLevel = level;

    if (previousLevel !== level) {
      logger.info(`Degradation level changed from ${previousLevel} to ${level}`);
      
      const strategy = this.degradationStrategies.get(level)!;
      logger.info(`Active capabilities: ${strategy.capabilities.join(', ')}`);
      logger.info(`Known limitations: ${strategy.limitations.join(', ')}`);
    }
  }

  /**
   * Get current degradation status
   */
  getDegradationStatus(): DegradationStatus {
    const strategy = this.degradationStrategies.get(this.currentDegradationLevel)!;
    
    return {
      level: this.currentDegradationLevel,
      strategy,
      recentConflicts: this.conflictHistory.slice(-10),
      recommendations: this.generateSystemRecommendations()
    };
  }

  /**
   * Check if a specific capability is available at current degradation level
   */
  isCapabilityAvailable(capability: string): boolean {
    const strategy = this.degradationStrategies.get(this.currentDegradationLevel)!;
    return strategy.capabilities.includes(capability);
  }

  private initializeDegradationStrategies(): Map<DegradationLevel, DegradationStrategy> {
    const strategies = new Map<DegradationLevel, DegradationStrategy>();

    strategies.set(DegradationLevel.NONE, {
      level: DegradationLevel.NONE,
      description: 'Full functionality available',
      capabilities: [
        'ai_analysis',
        'real_time_processing',
        'complex_reasoning',
        'proactive_interventions',
        'detailed_responses'
      ],
      limitations: [],
      fallbackBehaviors: []
    });

    strategies.set(DegradationLevel.MINIMAL, {
      level: DegradationLevel.MINIMAL,
      description: 'Slight reduction in AI capabilities',
      capabilities: [
        'ai_analysis',
        'real_time_processing',
        'basic_reasoning',
        'proactive_interventions'
      ],
      limitations: [
        'Reduced response complexity',
        'Lower confidence in analysis'
      ],
      fallbackBehaviors: [
        {
          trigger: 'complex_analysis_request',
          action: 'simplify_response',
          responseTemplate: 'I can provide a basic analysis, though my detailed capabilities are currently limited.'
        }
      ]
    });

    strategies.set(DegradationLevel.MODERATE, {
      level: DegradationLevel.MODERATE,
      description: 'Significant reduction in AI capabilities',
      capabilities: [
        'basic_analysis',
        'template_responses',
        'reactive_interventions'
      ],
      limitations: [
        'No proactive interventions',
        'Limited reasoning capabilities',
        'Template-based responses only'
      ],
      fallbackBehaviors: [
        {
          trigger: 'proactive_intervention',
          action: 'wait_for_summon',
          responseTemplate: 'I\'m available to help if you need me. Please mention my name or ask for assistance.'
        },
        {
          trigger: 'complex_question',
          action: 'request_clarification',
          responseTemplate: 'I\'m working with limited capabilities. Could you rephrase your question more simply?'
        }
      ]
    });

    strategies.set(DegradationLevel.SEVERE, {
      level: DegradationLevel.SEVERE,
      description: 'Minimal functionality - basic responses only',
      capabilities: [
        'acknowledgment_responses',
        'basic_templates',
        'error_reporting'
      ],
      limitations: [
        'No AI analysis',
        'No proactive behavior',
        'Very limited response variety'
      ],
      fallbackBehaviors: [
        {
          trigger: 'any_request',
          action: 'acknowledge_limitation',
          responseTemplate: 'I\'m experiencing technical difficulties and can only provide basic responses right now.'
        }
      ]
    });

    strategies.set(DegradationLevel.OFFLINE, {
      level: DegradationLevel.OFFLINE,
      description: 'Offline mode - cached responses only',
      capabilities: [
        'cached_responses',
        'offline_templates'
      ],
      limitations: [
        'No real-time processing',
        'No new AI analysis',
        'Limited to cached content'
      ],
      fallbackBehaviors: [
        {
          trigger: 'any_request',
          action: 'use_cached_response',
          responseTemplate: 'I\'m currently offline but can provide some assistance based on previous conversations.'
        }
      ]
    });

    return strategies;
  }

  private detectContradictions(information: any[]): string[] {
    const contradictions: string[] = [];
    
    // Simple contradiction detection - in practice, this would be more sophisticated
    for (let i = 0; i < information.length; i++) {
      for (let j = i + 1; j < information.length; j++) {
        const item1 = information[i];
        const item2 = information[j];
        
        // Check for numerical contradictions
        if (this.hasNumericalContradiction(item1, item2)) {
          contradictions.push(`Conflicting numerical data: ${JSON.stringify(item1)} vs ${JSON.stringify(item2)}`);
        }
        
        // Check for categorical contradictions
        if (this.hasCategoricalContradiction(item1, item2)) {
          contradictions.push(`Conflicting categorical information: ${JSON.stringify(item1)} vs ${JSON.stringify(item2)}`);
        }
      }
    }
    
    return contradictions;
  }

  private detectAmbiguities(information: any[], context: ConversationContext): string[] {
    const ambiguities: string[] = [];
    
    // Check for missing context - if we have information but very limited conversation history
    if (information.length > 0 && context.messageHistory.length === 0) {
      ambiguities.push('Insufficient conversation context for accurate analysis');
    }
    
    // Only check for vague language if we have actual information
    if (information.length > 0) {
      const vaguePhrases = ['maybe', 'possibly', 'might be', 'could be', 'uncertain', 'unclear'];
      const contextText = JSON.stringify(information).toLowerCase();
      
      for (const phrase of vaguePhrases) {
        if (contextText.includes(phrase)) {
          ambiguities.push(`Ambiguous language detected: "${phrase}"`);
        }
      }
    }
    
    return ambiguities;
  }

  private hasInsufficientData(information: any[], context: ConversationContext): boolean {
    // Check if we have enough information to make a confident assessment
    return information.length === 0 || 
           information.every(item => !item || (typeof item === 'object' && Object.keys(item).length === 0));
  }

  private detectMultipleInterpretations(information: any[], context: ConversationContext): string[] {
    const interpretations: string[] = [];
    
    // Only check if we have actual information
    if (information.length === 0) {
      return interpretations;
    }
    
    // Simple heuristic - look for multiple possible meanings
    const contextText = JSON.stringify(information).toLowerCase();
    
    if (contextText.includes('or') || contextText.includes('either')) {
      interpretations.push('Multiple options presented');
    }
    
    if (contextText.includes('depends') || contextText.includes('varies')) {
      interpretations.push('Context-dependent interpretation');
    }
    
    return interpretations;
  }

  private createConflictResolution(
    type: ConflictType,
    issues: string[],
    context: ConversationContext
  ): ConflictResolution {
    const confidence = this.calculateConflictConfidence(type, issues);
    const recommendedAction = this.determineRecommendedAction(type, confidence);
    const alternatives = this.generateAlternatives(type, issues, context);
    
    return {
      type,
      confidence,
      recommendedAction,
      alternatives,
      explanation: `Detected ${type}: ${issues.join(', ')}`
    };
  }

  private calculateConflictConfidence(type: ConflictType, issues: string[]): number {
    let baseConfidence = 0.7;
    
    // Adjust based on conflict type
    switch (type) {
      case ConflictType.CONTRADICTORY_INFORMATION:
        baseConfidence = 0.9;
        break;
      case ConflictType.INSUFFICIENT_DATA:
        baseConfidence = 0.8;
        break;
      case ConflictType.AMBIGUOUS_CONTEXT:
        baseConfidence = 0.6;
        break;
      default:
        baseConfidence = 0.7;
    }
    
    // Adjust based on number of issues
    const issueMultiplier = Math.min(issues.length * 0.1, 0.3);
    
    return Math.min(baseConfidence + issueMultiplier, 1.0);
  }

  private determineRecommendedAction(type: ConflictType, confidence: number): RecommendedAction {
    if (confidence > 0.8) {
      switch (type) {
        case ConflictType.CONTRADICTORY_INFORMATION:
          return RecommendedAction.PRESENT_ALTERNATIVES;
        case ConflictType.INSUFFICIENT_DATA:
          return RecommendedAction.REQUEST_CLARIFICATION;
        default:
          return RecommendedAction.ACKNOWLEDGE_UNCERTAINTY;
      }
    } else if (confidence > 0.6) {
      return RecommendedAction.USE_CONSERVATIVE_APPROACH;
    } else {
      return RecommendedAction.DEFER_TO_HUMAN;
    }
  }

  private generateAlternatives(type: ConflictType, issues: string[], context: ConversationContext): Alternative[] {
    const alternatives: Alternative[] = [];
    
    switch (type) {
      case ConflictType.CONTRADICTORY_INFORMATION:
        alternatives.push({
          description: 'Present all conflicting viewpoints',
          confidence: 0.7,
          sources: ['multiple_sources'],
          reasoning: 'Allow participants to evaluate conflicting information'
        });
        alternatives.push({
          description: 'Request source verification',
          confidence: 0.8,
          sources: ['verification_needed'],
          reasoning: 'Verify accuracy of conflicting claims'
        });
        break;
        
      case ConflictType.AMBIGUOUS_CONTEXT:
        alternatives.push({
          description: 'Ask for clarification',
          confidence: 0.8,
          sources: ['clarification_request'],
          reasoning: 'Reduce ambiguity through targeted questions'
        });
        break;
        
      default:
        alternatives.push({
          description: 'Acknowledge limitation and defer',
          confidence: 0.6,
          sources: ['conservative_approach'],
          reasoning: 'Maintain transparency about limitations'
        });
    }
    
    return alternatives;
  }

  private generateClarificationRequest(conflict: ConflictResolution, context: ConversationContext): string {
    const templates = [
      'I need some clarification to provide accurate information. Could you help me understand {specific_point}?',
      'There seems to be some ambiguity here. Could you provide clarification on {specific_point}?',
      'To give you the best response, I\'d like clarification on {specific_point}. Could you provide more details?'
    ];
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    const specificPoint = this.extractSpecificPoint(conflict);
    
    return template.replace('{specific_point}', specificPoint);
  }

  private generateAlternativesPresentation(conflict: ConflictResolution, context: ConversationContext): string {
    let response = 'I\'ve found some conflicting information. Here are the different perspectives:\n\n';
    
    conflict.alternatives.forEach((alt, index) => {
      response += `${index + 1}. ${alt.description} (Confidence: ${Math.round(alt.confidence * 100)}%)\n`;
      response += `   Reasoning: ${alt.reasoning}\n\n`;
    });
    
    response += 'Which perspective would you like me to explore further?';
    
    return response;
  }

  private generateHumanDeferral(conflict: ConflictResolution, context: ConversationContext): string {
    return `I'm encountering some complexity here that would benefit from human judgment. ${conflict.explanation} I'd recommend having someone with domain expertise weigh in on this topic.`;
  }

  private generateConservativeResponse(conflict: ConflictResolution, context: ConversationContext): string {
    return `I want to be careful here since there's some uncertainty. ${conflict.explanation} I can provide general guidance, but I'd recommend verifying specific details before making important decisions.`;
  }

  private generateUncertaintyAcknowledgment(conflict: ConflictResolution, context: ConversationContext): string {
    return `I want to be transparent - there's some uncertainty in the information I have. ${conflict.explanation} I can share what I know, but please consider this preliminary and verify important details.`;
  }

  private generateFallbackResponse(conflict: ConflictResolution, context: ConversationContext): string {
    return `I'm having some difficulty providing a confident response here. ${conflict.explanation} Would you like me to try a different approach or would you prefer to handle this manually?`;
  }

  private generateFollowUpSuggestions(conflict: ConflictResolution): string[] {
    const suggestions: string[] = [];
    
    switch (conflict.recommendedAction) {
      case RecommendedAction.REQUEST_CLARIFICATION:
        suggestions.push('I can help once we clarify the details');
        suggestions.push('Would you like me to suggest specific questions to ask?');
        break;
        
      case RecommendedAction.PRESENT_ALTERNATIVES:
        suggestions.push('I can provide more details on any of these options');
        suggestions.push('Would you like me to research additional perspectives?');
        break;
        
      default:
        suggestions.push('I can try a different approach if this isn\'t helpful');
        suggestions.push('Let me know if you\'d like me to focus on a specific aspect');
    }
    
    return suggestions;
  }

  private extractSpecificPoint(conflict: ConflictResolution): string {
    // Extract the most relevant point that needs clarification
    if (conflict.alternatives.length > 0) {
      return conflict.alternatives[0].description.toLowerCase();
    }
    
    return 'the specific details of this topic';
  }

  private recordConflict(conflict: ConflictResolution): void {
    this.conflictHistory.push(conflict);
    
    // Keep only last 100 conflicts to prevent memory leaks
    if (this.conflictHistory.length > 100) {
      this.conflictHistory = this.conflictHistory.slice(-100);
    }
    
    logger.info('Conflict recorded for learning', {
      type: conflict.type,
      confidence: conflict.confidence,
      action: conflict.recommendedAction
    });
  }

  private generateSystemRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.currentDegradationLevel !== DegradationLevel.NONE) {
      recommendations.push('Consider checking system health and API connectivity');
    }
    
    const recentConflicts = this.conflictHistory.slice(-10);
    const conflictTypes = new Set(recentConflicts.map(c => c.type));
    
    if (conflictTypes.has(ConflictType.CONTRADICTORY_INFORMATION)) {
      recommendations.push('Multiple contradictory information sources detected - consider source verification');
    }
    
    if (conflictTypes.has(ConflictType.INSUFFICIENT_DATA)) {
      recommendations.push('Frequent insufficient data issues - consider expanding knowledge base');
    }
    
    return recommendations;
  }

  private hasNumericalContradiction(item1: any, item2: any): boolean {
    // Check for numerical contradictions in object properties
    if (typeof item1 === 'object' && typeof item2 === 'object' && item1 && item2) {
      for (const key in item1) {
        if (key in item2) {
          const val1 = item1[key];
          const val2 = item2[key];
          if (typeof val1 === 'number' && typeof val2 === 'number') {
            const difference = Math.abs(val1 - val2) / Math.max(val1, val2);
            if (difference > 0.5) { // 50% difference threshold
              return true;
            }
          }
        }
      }
    }
    
    // Direct numerical comparison
    if (typeof item1 === 'number' && typeof item2 === 'number') {
      return Math.abs(item1 - item2) / Math.max(item1, item2) > 0.5;
    }
    
    return false;
  }

  private hasCategoricalContradiction(item1: any, item2: any): boolean {
    // Simple categorical contradiction detection
    if (typeof item1 === 'string' && typeof item2 === 'string') {
      const contradictoryPairs = [
        ['yes', 'no'],
        ['true', 'false'],
        ['positive', 'negative'],
        ['increase', 'decrease'],
        ['up', 'down']
      ];
      
      const item1Lower = item1.toLowerCase();
      const item2Lower = item2.toLowerCase();
      
      return contradictoryPairs.some(([a, b]) => 
        (item1Lower.includes(a) && item2Lower.includes(b)) ||
        (item1Lower.includes(b) && item2Lower.includes(a))
      );
    }
    return false;
  }
}

export interface DegradationStatus {
  level: DegradationLevel;
  strategy: DegradationStrategy;
  recentConflicts: ConflictResolution[];
  recommendations: string[];
}