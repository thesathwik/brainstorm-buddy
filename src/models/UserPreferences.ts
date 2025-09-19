import { 
  InterventionFrequency, 
  InformationType, 
  CommunicationStyle, 
  ExpertiseArea,
  VCRole,
  InterventionType 
} from './Enums';

export interface UserPreferences {
  interventionFrequency: InterventionFrequency;
  preferredInformationTypes: InformationType[];
  communicationStyle: CommunicationStyle;
  topicExpertise: ExpertiseArea[];
  // Additional preference fields for learning
  preferredInterventionTypes?: InterventionType[];
  quietHours?: TimeRange[];
  maxInterventionsPerHour?: number;
  learningEnabled?: boolean;
  customSettings?: Record<string, any>;
}

export interface TimeRange {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface UserBehaviorPattern {
  userId: string;
  interventionType: InterventionType;
  positiveReactions: number;
  negativeReactions: number;
  ignoreCount: number;
  contextPatterns: string[];
  lastUpdated: Date;
}

export interface PreferenceLearningData {
  userId: string;
  sessionId: string;
  interventionId: string;
  userReaction: 'positive' | 'negative' | 'neutral' | 'ignored';
  contextTags: string[];
  timestamp: Date;
}

export interface ConfigurationSettings {
  defaultPreferences: UserPreferences;
  learningSettings: {
    enabled: boolean;
    adaptationRate: number; // 0-1, how quickly to adapt
    minimumDataPoints: number;
    confidenceThreshold: number;
  };
  systemSettings: {
    maxStoredPatterns: number;
    dataRetentionDays: number;
    backupFrequency: number;
  };
}

export class UserPreferencesManager {
  private preferences: Map<string, UserPreferences> = new Map();
  private behaviorPatterns: Map<string, UserBehaviorPattern[]> = new Map();
  private learningData: PreferenceLearningData[] = [];
  private config: ConfigurationSettings;

  constructor(config: ConfigurationSettings) {
    this.config = config;
  }

  // Core preference management
  getUserPreferences(userId: string): UserPreferences {
    return this.preferences.get(userId) || this.getDefaultPreferences();
  }

  setUserPreferences(userId: string, preferences: UserPreferences): void {
    this.preferences.set(userId, { ...preferences });
  }

  updateUserPreference<K extends keyof UserPreferences>(
    userId: string, 
    key: K, 
    value: UserPreferences[K]
  ): void {
    const current = this.getUserPreferences(userId);
    current[key] = value;
    this.setUserPreferences(userId, current);
  }

  // Behavior pattern tracking
  recordUserReaction(data: PreferenceLearningData): void {
    if (!this.config.learningSettings.enabled) return;
    
    this.learningData.push(data);
    this.updateBehaviorPattern(data);
    this.cleanupOldData();
  }

  private updateBehaviorPattern(data: PreferenceLearningData): void {
    const patterns = this.behaviorPatterns.get(data.userId) || [];
    let pattern = patterns.find(p => p.interventionType === data.interventionId as any);
    
    if (!pattern) {
      pattern = {
        userId: data.userId,
        interventionType: data.interventionId as any,
        positiveReactions: 0,
        negativeReactions: 0,
        ignoreCount: 0,
        contextPatterns: [],
        lastUpdated: new Date()
      };
      patterns.push(pattern);
    }

    // Update reaction counts
    switch (data.userReaction) {
      case 'positive':
        pattern.positiveReactions++;
        break;
      case 'negative':
        pattern.negativeReactions++;
        break;
      case 'ignored':
        pattern.ignoreCount++;
        break;
    }

    // Update context patterns
    data.contextTags.forEach(tag => {
      if (!pattern!.contextPatterns.includes(tag)) {
        pattern!.contextPatterns.push(tag);
      }
    });

    pattern.lastUpdated = new Date();
    this.behaviorPatterns.set(data.userId, patterns);
  }

  // Preference learning and adaptation
  adaptPreferencesFromBehavior(userId: string): UserPreferences {
    if (!this.config.learningSettings.enabled) {
      return this.getUserPreferences(userId);
    }

    const patterns = this.behaviorPatterns.get(userId) || [];
    const currentPrefs = this.getUserPreferences(userId);
    const adaptedPrefs = { ...currentPrefs };

    // Adapt intervention frequency based on reaction patterns
    const totalReactions = patterns.reduce((sum, p) => 
      sum + p.positiveReactions + p.negativeReactions + p.ignoreCount, 0);
    
    if (totalReactions >= this.config.learningSettings.minimumDataPoints) {
      const positiveRatio = patterns.reduce((sum, p) => sum + p.positiveReactions, 0) / totalReactions;
      const negativeRatio = patterns.reduce((sum, p) => sum + p.negativeReactions, 0) / totalReactions;
      
      // Adjust intervention frequency based on positive/negative feedback
      if (positiveRatio > 0.7) {
        adaptedPrefs.interventionFrequency = this.increaseFrequency(currentPrefs.interventionFrequency);
      } else if (negativeRatio > 0.4) {
        adaptedPrefs.interventionFrequency = this.decreaseFrequency(currentPrefs.interventionFrequency);
      }

      // Adapt preferred intervention types
      const preferredTypes = patterns
        .filter(p => p.positiveReactions > p.negativeReactions)
        .map(p => p.interventionType);
      
      if (preferredTypes.length > 0) {
        adaptedPrefs.preferredInterventionTypes = preferredTypes;
      }
    }

    return adaptedPrefs;
  }

  private increaseFrequency(current: InterventionFrequency): InterventionFrequency {
    const levels = [
      InterventionFrequency.MINIMAL,
      InterventionFrequency.MODERATE,
      InterventionFrequency.ACTIVE,
      InterventionFrequency.VERY_ACTIVE
    ];
    const currentIndex = levels.indexOf(current);
    return levels[Math.min(currentIndex + 1, levels.length - 1)];
  }

  private decreaseFrequency(current: InterventionFrequency): InterventionFrequency {
    const levels = [
      InterventionFrequency.MINIMAL,
      InterventionFrequency.MODERATE,
      InterventionFrequency.ACTIVE,
      InterventionFrequency.VERY_ACTIVE
    ];
    const currentIndex = levels.indexOf(current);
    return levels[Math.max(currentIndex - 1, 0)];
  }

  // Configuration management
  getDefaultPreferences(): UserPreferences {
    return { ...this.config.defaultPreferences };
  }

  updateConfiguration(newConfig: Partial<ConfigurationSettings>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Data management
  private cleanupOldData(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.systemSettings.dataRetentionDays);
    
    this.learningData = this.learningData.filter(data => data.timestamp > cutoffDate);
    
    // Cleanup behavior patterns
    this.behaviorPatterns.forEach((patterns, userId) => {
      const filteredPatterns = patterns
        .filter(p => p.lastUpdated > cutoffDate)
        .slice(0, this.config.systemSettings.maxStoredPatterns);
      this.behaviorPatterns.set(userId, filteredPatterns);
    });
  }

  // Export/Import for persistence
  exportUserData(userId: string): any {
    return {
      preferences: this.preferences.get(userId),
      behaviorPatterns: this.behaviorPatterns.get(userId),
      learningData: this.learningData.filter(d => d.userId === userId)
    };
  }

  importUserData(userId: string, data: any): void {
    if (data.preferences) {
      this.preferences.set(userId, data.preferences);
    }
    if (data.behaviorPatterns) {
      this.behaviorPatterns.set(userId, data.behaviorPatterns);
    }
    if (data.learningData) {
      this.learningData.push(...data.learningData);
    }
  }

  // Analytics and insights
  getUserInsights(userId: string): any {
    const patterns = this.behaviorPatterns.get(userId) || [];
    const totalInterventions = patterns.reduce((sum, p) => 
      sum + p.positiveReactions + p.negativeReactions + p.ignoreCount, 0);
    
    return {
      totalInterventions,
      preferredTypes: patterns
        .filter(p => p.positiveReactions > p.negativeReactions)
        .map(p => p.interventionType),
      engagementScore: totalInterventions > 0 ? 
        patterns.reduce((sum, p) => sum + p.positiveReactions, 0) / totalInterventions : 0,
      lastActivity: patterns.length > 0 ? 
        Math.max(...patterns.map(p => p.lastUpdated.getTime())) : null
    };
  }
}

export interface Participant {
  id: string;
  name: string;
  role: VCRole;
  preferences: UserPreferences;
  engagementLevel: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  priority: number;
  estimatedDuration?: number;
}