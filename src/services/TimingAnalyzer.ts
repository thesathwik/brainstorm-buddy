import { ProcessedMessage, ConversationContext } from '../models';
import { FlowAnalysis } from './ContextAnalyzer';

export interface ConversationPause {
  startTime: Date;
  endTime?: Date;
  duration: number; // in milliseconds
  type: PauseType;
  confidence: number; // 0-1 scale
}

export enum PauseType {
  NATURAL_BREAK = 'natural_break',
  TOPIC_TRANSITION = 'topic_transition',
  THINKING_PAUSE = 'thinking_pause',
  DISCUSSION_END = 'discussion_end',
  EXTENDED_SILENCE = 'extended_silence'
}

export interface InterventionTiming {
  isGoodTime: boolean;
  confidence: number; // 0-1 scale
  reasoning: string;
  suggestedDelay?: number; // milliseconds to wait before intervening
  pauseDetected?: ConversationPause;
}

export interface ConversationMomentum {
  velocity: number; // messages per minute
  acceleration: number; // change in velocity
  engagement: number; // 0-1 scale
  intensity: number; // 0-1 scale based on message length and frequency
  direction: 'increasing' | 'decreasing' | 'stable';
}

export interface ParticipantEngagement {
  participantId: string;
  isActivelyEngaged: boolean;
  lastActivity: Date;
  responsePattern: ResponsePattern;
  engagementLevel: number; // 0-1 scale
}

export interface ResponsePattern {
  averageResponseTime: number;
  responseTimeVariance: number;
  messageLength: number;
  recentActivity: boolean;
}

export interface TimingStrategy {
  shouldWaitForPause: boolean;
  maxWaitTime: number; // milliseconds
  interventionUrgency: number; // 0-1 scale
  preferredTimingWindow: TimingWindow;
}

export interface TimingWindow {
  minDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  optimalDelay: number; // milliseconds
}

export interface TimingAnalyzer {
  detectConversationPauses(messages: ProcessedMessage[]): ConversationPause[];
  assessInterventionTiming(
    context: ConversationContext,
    flowAnalysis: FlowAnalysis
  ): InterventionTiming;
  calculateConversationMomentum(messages: ProcessedMessage[]): ConversationMomentum;
  analyzeParticipantEngagement(
    messages: ProcessedMessage[],
    participants: string[]
  ): ParticipantEngagement[];
  determineOptimalTimingStrategy(
    context: ConversationContext,
    interventionUrgency: number
  ): TimingStrategy;
}

export class DefaultTimingAnalyzer implements TimingAnalyzer {
  private readonly pauseThresholds = {
    shortPause: 10000, // 10 seconds
    mediumPause: 30000, // 30 seconds
    longPause: 60000, // 1 minute
    extendedSilence: 180000 // 3 minutes
  };

  private readonly momentumWindow = 300000; // 5 minutes for momentum calculation
  private readonly engagementWindow = 600000; // 10 minutes for engagement analysis

  detectConversationPauses(messages: ProcessedMessage[]): ConversationPause[] {
    if (messages.length < 2) return [];

    const pauses: ConversationPause[] = [];
    
    for (let i = 1; i < messages.length; i++) {
      const currentMsg = messages[i];
      const previousMsg = messages[i - 1];
      
      const timeDiff = currentMsg.originalMessage.timestamp.getTime() - 
                      previousMsg.originalMessage.timestamp.getTime();

      if (timeDiff >= this.pauseThresholds.shortPause) {
        const pause = this.classifyPause(timeDiff, previousMsg, currentMsg, messages, i);
        pauses.push(pause);
      }
    }

    return pauses;
  }

  assessInterventionTiming(
    context: ConversationContext,
    flowAnalysis: FlowAnalysis
  ): InterventionTiming {
    const recentMessages = context.messageHistory.slice(-10);
    
    if (recentMessages.length === 0) {
      return {
        isGoodTime: true,
        confidence: 0.8,
        reasoning: 'No recent activity detected, safe to intervene'
      };
    }

    // Check for recent pauses
    const pauses = this.detectConversationPauses(recentMessages);
    const recentPause = pauses.length > 0 ? pauses[pauses.length - 1] : null;

    // Calculate conversation momentum
    const momentum = this.calculateConversationMomentum(recentMessages);
    
    // Analyze current conversation state
    const timeSinceLastMessage = Date.now() - 
      recentMessages[recentMessages.length - 1].originalMessage.timestamp.getTime();

    // Determine if it's a good time to intervene
    const assessment = this.evaluateInterventionTiming(
      momentum,
      flowAnalysis,
      timeSinceLastMessage,
      recentPause
    );

    return assessment;
  }

  calculateConversationMomentum(messages: ProcessedMessage[]): ConversationMomentum {
    if (messages.length < 2) {
      return {
        velocity: 0,
        acceleration: 0,
        engagement: 0,
        intensity: 0,
        direction: 'stable'
      };
    }

    // Filter messages within momentum window
    const cutoffTime = Date.now() - this.momentumWindow;
    const recentMessages = messages.filter(
      msg => msg.originalMessage.timestamp.getTime() >= cutoffTime
    );

    if (recentMessages.length < 2) {
      return {
        velocity: 0,
        acceleration: 0,
        engagement: 0,
        intensity: 0,
        direction: 'stable'
      };
    }

    // Calculate velocity (messages per minute)
    const timeSpan = recentMessages[recentMessages.length - 1].originalMessage.timestamp.getTime() - 
                    recentMessages[0].originalMessage.timestamp.getTime();
    const velocity = timeSpan > 0 ? (recentMessages.length / (timeSpan / 60000)) : 0;

    // Calculate acceleration by comparing recent vs earlier velocity
    const midPoint = Math.floor(recentMessages.length / 2);
    const earlierMessages = recentMessages.slice(0, midPoint);
    const laterMessages = recentMessages.slice(midPoint);

    let acceleration = 0;
    if (earlierMessages.length > 1 && laterMessages.length > 1) {
      const earlierTimeSpan = earlierMessages[earlierMessages.length - 1].originalMessage.timestamp.getTime() - 
                             earlierMessages[0].originalMessage.timestamp.getTime();
      const laterTimeSpan = laterMessages[laterMessages.length - 1].originalMessage.timestamp.getTime() - 
                           laterMessages[0].originalMessage.timestamp.getTime();
      
      const earlierVelocity = earlierTimeSpan > 0 ? (earlierMessages.length / (earlierTimeSpan / 60000)) : 0;
      const laterVelocity = laterTimeSpan > 0 ? (laterMessages.length / (laterTimeSpan / 60000)) : 0;
      
      acceleration = laterVelocity - earlierVelocity;
    }

    // Calculate engagement based on participant diversity and sentiment
    const uniqueParticipants = new Set(recentMessages.map(msg => msg.originalMessage.userId)).size;
    const avgSentiment = recentMessages.reduce((sum, msg) => sum + msg.sentiment.overall, 0) / recentMessages.length;
    const engagement = Math.min(1, (uniqueParticipants / 4) * ((avgSentiment + 1) / 2));

    // Calculate intensity based on message length and frequency
    const avgMessageLength = recentMessages.reduce((sum, msg) => sum + msg.originalMessage.content.length, 0) / recentMessages.length;
    const normalizedLength = Math.min(1, avgMessageLength / 200); // Normalize to 200 chars = 1.0
    const normalizedVelocity = Math.min(1, velocity / 10); // Normalize to 10 msg/min = 1.0
    const intensity = (normalizedLength + normalizedVelocity) / 2;

    // Determine direction
    let direction: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(acceleration) < 0.5) {
      direction = 'stable';
    } else if (acceleration > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    return {
      velocity: Math.round(velocity * 100) / 100,
      acceleration: Math.round(acceleration * 100) / 100,
      engagement: Math.round(engagement * 100) / 100,
      intensity: Math.round(intensity * 100) / 100,
      direction
    };
  }

  analyzeParticipantEngagement(
    messages: ProcessedMessage[],
    participants: string[]
  ): ParticipantEngagement[] {
    const cutoffTime = Date.now() - this.engagementWindow;
    const recentMessages = messages.filter(
      msg => msg.originalMessage.timestamp.getTime() >= cutoffTime
    );

    return participants.map(participantId => {
      const participantMessages = recentMessages.filter(
        msg => msg.originalMessage.userId === participantId
      );

      if (participantMessages.length === 0) {
        return {
          participantId,
          isActivelyEngaged: false,
          lastActivity: new Date(0),
          responsePattern: {
            averageResponseTime: 0,
            responseTimeVariance: 0,
            messageLength: 0,
            recentActivity: false
          },
          engagementLevel: 0
        };
      }

      const lastActivity = participantMessages[participantMessages.length - 1].originalMessage.timestamp;
      const isRecentlyActive = Date.now() - lastActivity.getTime() < 300000; // 5 minutes

      // Calculate response pattern
      const responseTimes: number[] = [];
      const messageLengths: number[] = [];

      for (let i = 1; i < participantMessages.length; i++) {
        const responseTime = participantMessages[i].originalMessage.timestamp.getTime() - 
                           participantMessages[i - 1].originalMessage.timestamp.getTime();
        responseTimes.push(responseTime);
      }

      participantMessages.forEach(msg => {
        messageLengths.push(msg.originalMessage.content.length);
      });

      const averageResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

      const responseTimeVariance = responseTimes.length > 1 ? 
        this.calculateVariance(responseTimes) : 0;

      const averageMessageLength = messageLengths.reduce((sum, len) => sum + len, 0) / messageLengths.length;

      // Calculate engagement level
      const messageFrequency = participantMessages.length / (this.engagementWindow / 60000); // per minute
      const recentActivityScore = isRecentlyActive ? 1 : Math.max(0, 1 - (Date.now() - lastActivity.getTime()) / this.engagementWindow);
      const messageQualityScore = Math.min(1, averageMessageLength / 100); // Normalize to 100 chars
      
      const engagementLevel = (messageFrequency * 0.4 + recentActivityScore * 0.4 + messageQualityScore * 0.2);

      return {
        participantId,
        isActivelyEngaged: isRecentlyActive && engagementLevel > 0.3,
        lastActivity,
        responsePattern: {
          averageResponseTime: Math.round(averageResponseTime),
          responseTimeVariance: Math.round(responseTimeVariance),
          messageLength: Math.round(averageMessageLength),
          recentActivity: isRecentlyActive
        },
        engagementLevel: Math.round(engagementLevel * 100) / 100
      };
    });
  }

  determineOptimalTimingStrategy(
    context: ConversationContext,
    interventionUrgency: number
  ): TimingStrategy {
    const recentMessages = context.messageHistory.slice(-5);
    const momentum = this.calculateConversationMomentum(context.messageHistory);
    
    // High momentum conversations need more careful timing, but low urgency should always wait for pause
    const shouldWaitForPause = interventionUrgency < 0.5 || momentum.velocity > 5 || momentum.intensity > 0.7;
    
    // Calculate wait times based on urgency and momentum
    let maxWaitTime: number;
    let minDelay: number;
    let optimalDelay: number;

    if (interventionUrgency > 0.8) {
      // High urgency - intervene quickly
      maxWaitTime = 30000; // 30 seconds max wait
      minDelay = 2000; // 2 seconds min
      optimalDelay = 5000; // 5 seconds optimal
    } else if (interventionUrgency > 0.5) {
      // Medium urgency - wait for good timing
      maxWaitTime = 60000; // 1 minute max wait
      minDelay = 5000; // 5 seconds min
      optimalDelay = 15000; // 15 seconds optimal
    } else {
      // Low urgency - wait for natural break
      maxWaitTime = 180000; // 3 minutes max wait
      minDelay = 10000; // 10 seconds min
      optimalDelay = 30000; // 30 seconds optimal
    }

    // Adjust based on conversation momentum
    if (momentum.direction === 'increasing' && momentum.velocity > 3) {
      maxWaitTime *= 1.5; // Wait longer for high-velocity conversations
      optimalDelay *= 1.3;
    }

    return {
      shouldWaitForPause,
      maxWaitTime,
      interventionUrgency,
      preferredTimingWindow: {
        minDelay,
        maxDelay: maxWaitTime,
        optimalDelay
      }
    };
  }

  private classifyPause(
    duration: number,
    previousMsg: ProcessedMessage,
    currentMsg: ProcessedMessage,
    allMessages: ProcessedMessage[],
    currentIndex: number
  ): ConversationPause {
    let type: PauseType;
    let confidence: number;

    if (duration >= this.pauseThresholds.extendedSilence) {
      type = PauseType.EXTENDED_SILENCE;
      confidence = 0.9;
    } else if (duration >= this.pauseThresholds.longPause) {
      // Check if this might be end of discussion or topic transition
      const topicChanged = this.detectTopicChange(previousMsg, currentMsg);
      if (topicChanged) {
        type = PauseType.TOPIC_TRANSITION;
        confidence = 0.8;
      } else {
        type = PauseType.THINKING_PAUSE;
        confidence = 0.7;
      }
    } else if (duration >= this.pauseThresholds.mediumPause) {
      type = PauseType.NATURAL_BREAK;
      confidence = 0.6;
    } else {
      type = PauseType.NATURAL_BREAK;
      confidence = 0.4;
    }

    return {
      startTime: previousMsg.originalMessage.timestamp,
      endTime: currentMsg.originalMessage.timestamp,
      duration,
      type,
      confidence
    };
  }

  private detectTopicChange(previousMsg: ProcessedMessage, currentMsg: ProcessedMessage): boolean {
    // Simple topic change detection based on topic classifications
    const prevTopics = previousMsg.topicClassification.map(t => t.category);
    const currentTopics = currentMsg.topicClassification.map(t => t.category);
    
    // Check if there's significant difference in topics
    const commonTopics = prevTopics.filter(topic => currentTopics.includes(topic));
    return commonTopics.length / Math.max(prevTopics.length, currentTopics.length) < 0.5;
  }

  private evaluateInterventionTiming(
    momentum: ConversationMomentum,
    flowAnalysis: FlowAnalysis,
    timeSinceLastMessage: number,
    recentPause: ConversationPause | null
  ): InterventionTiming {
    let isGoodTime = false;
    let confidence = 0;
    let reasoning = '';
    let suggestedDelay: number | undefined;

    // High momentum - should wait (check this first to avoid interrupting heated discussions)
    if (momentum.velocity > 5 || momentum.intensity > 0.8) {
      isGoodTime = false;
      confidence = 0.8;
      reasoning = 'High conversation momentum - should wait for natural break';
      suggestedDelay = this.pauseThresholds.mediumPause;
    }
    // Check if there's been a recent natural pause
    else if (recentPause && recentPause.type === PauseType.NATURAL_BREAK) {
      isGoodTime = true;
      confidence = Math.max(0.6, recentPause.confidence); // Ensure minimum confidence
      reasoning = 'Natural conversation break detected';
    }
    // Topic instability might indicate good intervention time
    else if (flowAnalysis.topicStability < 0.5) {
      isGoodTime = true;
      confidence = 0.7; // Higher confidence for topic instability
      reasoning = 'Topic instability suggests intervention opportunity';
    }
    // Check if conversation has extended silence
    else if (timeSinceLastMessage > this.pauseThresholds.mediumPause) {
      isGoodTime = true;
      confidence = Math.min(0.9, timeSinceLastMessage / this.pauseThresholds.longPause);
      reasoning = 'Extended silence provides intervention opportunity';
    }
    // Check if momentum is low (good time to interject)
    else if (momentum.velocity < 2 && momentum.intensity < 0.5) {
      isGoodTime = true;
      confidence = 0.7;
      reasoning = 'Low conversation momentum allows for intervention';
    }
    // Default case - moderate timing
    else {
      isGoodTime = timeSinceLastMessage > this.pauseThresholds.shortPause;
      confidence = 0.5;
      reasoning = 'Moderate timing conditions';
      if (!isGoodTime) {
        suggestedDelay = this.pauseThresholds.shortPause - timeSinceLastMessage;
      }
    }

    return {
      isGoodTime,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
      suggestedDelay,
      pauseDetected: recentPause || undefined
    };
  }

  private calculateVariance(numbers: number[]): number {
    if (numbers.length < 2) return 0;
    
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }
}