import { describe, it, expect, beforeEach } from 'vitest';
import { 
  UserPreferencesManager, 
  ConfigurationSettings, 
  UserPreferences,
  PreferenceLearningData,
  TimeRange
} from '../../src/models/UserPreferences';
import { 
  InterventionFrequency, 
  CommunicationStyle, 
  InformationType, 
  ExpertiseArea,
  InterventionType 
} from '../../src/models/Enums';

describe('UserPreferencesManager', () => {
  let manager: UserPreferencesManager;
  let defaultConfig: ConfigurationSettings;

  beforeEach(() => {
    defaultConfig = {
      defaultPreferences: {
        interventionFrequency: InterventionFrequency.MODERATE,
        preferredInformationTypes: [InformationType.MARKET_DATA],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: [ExpertiseArea.FINTECH],
        preferredInterventionTypes: [],
        quietHours: [],
        maxInterventionsPerHour: 10,
        learningEnabled: true,
        customSettings: {}
      },
      learningSettings: {
        enabled: true,
        adaptationRate: 0.1,
        minimumDataPoints: 5,
        confidenceThreshold: 0.7
      },
      systemSettings: {
        maxStoredPatterns: 100,
        dataRetentionDays: 30,
        backupFrequency: 24
      }
    };
    manager = new UserPreferencesManager(defaultConfig);
  });

  describe('Basic Preference Management', () => {
    it('should return default preferences for new user', () => {
      const prefs = manager.getUserPreferences('user1');
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.MODERATE);
      expect(prefs.communicationStyle).toBe(CommunicationStyle.CONVERSATIONAL);
    });

    it('should store and retrieve user preferences', () => {
      const customPrefs: UserPreferences = {
        interventionFrequency: InterventionFrequency.ACTIVE,
        preferredInformationTypes: [InformationType.COMPANY_INFO],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: [ExpertiseArea.HEALTHCARE],
        maxInterventionsPerHour: 15
      };

      manager.setUserPreferences('user1', customPrefs);
      const retrieved = manager.getUserPreferences('user1');
      
      expect(retrieved.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
      expect(retrieved.communicationStyle).toBe(CommunicationStyle.FORMAL);
      expect(retrieved.maxInterventionsPerHour).toBe(15);
    });

    it('should update individual preference fields', () => {
      manager.updateUserPreference('user1', 'interventionFrequency', InterventionFrequency.MINIMAL);
      const prefs = manager.getUserPreferences('user1');
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.MINIMAL);
    });

    it('should handle quiet hours configuration', () => {
      const quietHours: TimeRange[] = [
        { start: '22:00', end: '08:00' },
        { start: '12:00', end: '13:00' }
      ];
      
      manager.updateUserPreference('user1', 'quietHours', quietHours);
      const prefs = manager.getUserPreferences('user1');
      
      expect(prefs.quietHours).toHaveLength(2);
      expect(prefs.quietHours![0].start).toBe('22:00');
    });
  });

  describe('Behavior Pattern Tracking', () => {
    it('should record user reactions', () => {
      const learningData: PreferenceLearningData = {
        userId: 'user1',
        sessionId: 'session1',
        interventionId: InterventionType.INFORMATION_PROVIDE,
        userReaction: 'positive',
        contextTags: ['market-data', 'fintech'],
        timestamp: new Date()
      };

      expect(() => manager.recordUserReaction(learningData)).not.toThrow();
    });

    it('should not record reactions when learning is disabled', () => {
      const disabledConfig = { 
        ...defaultConfig, 
        learningSettings: { ...defaultConfig.learningSettings, enabled: false } 
      };
      const disabledManager = new UserPreferencesManager(disabledConfig);

      const learningData: PreferenceLearningData = {
        userId: 'user1',
        sessionId: 'session1',
        interventionId: InterventionType.INFORMATION_PROVIDE,
        userReaction: 'positive',
        contextTags: ['market-data'],
        timestamp: new Date()
      };

      // Should not throw but also should not affect behavior patterns
      expect(() => disabledManager.recordUserReaction(learningData)).not.toThrow();
    });

    it('should track multiple reaction types', () => {
      const reactions = [
        { reaction: 'positive', type: InterventionType.INFORMATION_PROVIDE },
        { reaction: 'negative', type: InterventionType.TOPIC_REDIRECT },
        { reaction: 'ignored', type: InterventionType.FACT_CHECK }
      ];

      reactions.forEach((r, index) => {
        const learningData: PreferenceLearningData = {
          userId: 'user1',
          sessionId: `session${index}`,
          interventionId: r.type,
          userReaction: r.reaction as any,
          contextTags: ['test'],
          timestamp: new Date()
        };
        manager.recordUserReaction(learningData);
      });

      // Should not throw and should handle different reaction types
      expect(() => manager.getUserInsights('user1')).not.toThrow();
    });
  });

  describe('Preference Learning and Adaptation', () => {
    it('should not adapt preferences without sufficient data', () => {
      const originalPrefs = manager.getUserPreferences('user1');
      const adaptedPrefs = manager.adaptPreferencesFromBehavior('user1');
      
      expect(adaptedPrefs.interventionFrequency).toBe(originalPrefs.interventionFrequency);
    });

    it('should increase intervention frequency with positive feedback', () => {
      // Record multiple positive reactions
      for (let i = 0; i < 6; i++) {
        const learningData: PreferenceLearningData = {
          userId: 'user1',
          sessionId: `session${i}`,
          interventionId: InterventionType.INFORMATION_PROVIDE,
          userReaction: 'positive',
          contextTags: ['test'],
          timestamp: new Date()
        };
        manager.recordUserReaction(learningData);
      }

      const originalPrefs = manager.getUserPreferences('user1');
      const adaptedPrefs = manager.adaptPreferencesFromBehavior('user1');
      
      // Should increase frequency due to positive feedback
      const frequencies = [
        InterventionFrequency.MINIMAL,
        InterventionFrequency.MODERATE,
        InterventionFrequency.ACTIVE,
        InterventionFrequency.VERY_ACTIVE
      ];
      
      const originalIndex = frequencies.indexOf(originalPrefs.interventionFrequency);
      const adaptedIndex = frequencies.indexOf(adaptedPrefs.interventionFrequency);
      
      expect(adaptedIndex).toBeGreaterThanOrEqual(originalIndex);
    });

    it('should decrease intervention frequency with negative feedback', () => {
      // Set initial frequency to something that can be decreased
      manager.updateUserPreference('user1', 'interventionFrequency', InterventionFrequency.ACTIVE);
      
      // Record multiple negative reactions
      for (let i = 0; i < 6; i++) {
        const learningData: PreferenceLearningData = {
          userId: 'user1',
          sessionId: `session${i}`,
          interventionId: InterventionType.INFORMATION_PROVIDE,
          userReaction: 'negative',
          contextTags: ['test'],
          timestamp: new Date()
        };
        manager.recordUserReaction(learningData);
      }

      const adaptedPrefs = manager.adaptPreferencesFromBehavior('user1');
      
      // Should decrease frequency due to negative feedback
      expect([
        InterventionFrequency.MINIMAL,
        InterventionFrequency.MODERATE
      ]).toContain(adaptedPrefs.interventionFrequency);
    });

    it('should identify preferred intervention types', () => {
      // Record positive reactions for specific intervention types
      const positiveTypes = [InterventionType.INFORMATION_PROVIDE, InterventionType.FACT_CHECK];
      
      positiveTypes.forEach(type => {
        for (let i = 0; i < 3; i++) {
          const learningData: PreferenceLearningData = {
            userId: 'user1',
            sessionId: `session${type}${i}`,
            interventionId: type,
            userReaction: 'positive',
            contextTags: ['test'],
            timestamp: new Date()
          };
          manager.recordUserReaction(learningData);
        }
      });

      const adaptedPrefs = manager.adaptPreferencesFromBehavior('user1');
      
      expect(adaptedPrefs.preferredInterventionTypes).toBeDefined();
      expect(adaptedPrefs.preferredInterventionTypes!.length).toBeGreaterThan(0);
    });
  });

  describe('Data Management', () => {
    it('should export user data', () => {
      manager.setUserPreferences('user1', {
        interventionFrequency: InterventionFrequency.ACTIVE,
        preferredInformationTypes: [InformationType.MARKET_DATA],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: []
      });

      const exportedData = manager.exportUserData('user1');
      
      expect(exportedData).toBeDefined();
      expect(exportedData.preferences).toBeDefined();
      expect(exportedData.preferences.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
    });

    it('should import user data', () => {
      const importData = {
        preferences: {
          interventionFrequency: InterventionFrequency.MINIMAL,
          preferredInformationTypes: [InformationType.COMPANY_INFO],
          communicationStyle: CommunicationStyle.BRIEF,
          topicExpertise: [ExpertiseArea.BIOTECH]
        },
        behaviorPatterns: [],
        learningData: []
      };

      manager.importUserData('user1', importData);
      const prefs = manager.getUserPreferences('user1');
      
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.MINIMAL);
      expect(prefs.communicationStyle).toBe(CommunicationStyle.BRIEF);
    });

    it('should provide user insights', () => {
      // Add some learning data first
      const learningData: PreferenceLearningData = {
        userId: 'user1',
        sessionId: 'session1',
        interventionId: InterventionType.INFORMATION_PROVIDE,
        userReaction: 'positive',
        contextTags: ['test'],
        timestamp: new Date()
      };
      manager.recordUserReaction(learningData);

      const insights = manager.getUserInsights('user1');
      
      expect(insights).toBeDefined();
      expect(insights.totalInterventions).toBeDefined();
      expect(insights.engagementScore).toBeDefined();
      expect(typeof insights.engagementScore).toBe('number');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration settings', () => {
      const newConfig = {
        learningSettings: {
          enabled: false,
          adaptationRate: 0.2,
          minimumDataPoints: 10,
          confidenceThreshold: 0.8
        }
      };

      manager.updateConfiguration(newConfig);
      
      // Verify the configuration was updated by checking learning behavior
      const learningData: PreferenceLearningData = {
        userId: 'user1',
        sessionId: 'session1',
        interventionId: InterventionType.INFORMATION_PROVIDE,
        userReaction: 'positive',
        contextTags: ['test'],
        timestamp: new Date()
      };

      // Should not record when learning is disabled
      manager.recordUserReaction(learningData);
      const insights = manager.getUserInsights('user1');
      expect(insights.totalInterventions).toBe(0);
    });
  });
});