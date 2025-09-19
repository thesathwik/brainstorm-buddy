import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { 
  UserPreferences, 
  ConfigurationSettings 
} from '../../src/models/UserPreferences';
import { 
  InterventionFrequency, 
  CommunicationStyle, 
  InformationType, 
  ExpertiseArea 
} from '../../src/models/Enums';

describe('ConfigurationService', () => {
  let configService: ConfigurationService;

  beforeEach(() => {
    // Reset singleton instance for each test
    (ConfigurationService as any).instance = undefined;
    configService = ConfigurationService.getInstance('./test-config.json');
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigurationService.getInstance();
      const instance2 = ConfigurationService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided config path on first instantiation', () => {
      const customPath = './custom-config.json';
      const instance = ConfigurationService.getInstance(customPath);
      expect(instance).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    it('should provide default configuration', () => {
      const config = configService.getConfiguration();
      
      expect(config).toBeDefined();
      expect(config.defaultPreferences).toBeDefined();
      expect(config.learningSettings).toBeDefined();
      expect(config.systemSettings).toBeDefined();
    });

    it('should update configuration', () => {
      const updates: Partial<ConfigurationSettings> = {
        learningSettings: {
          enabled: false,
          adaptationRate: 0.2,
          minimumDataPoints: 10,
          confidenceThreshold: 0.8
        }
      };

      configService.updateConfiguration(updates);
      const config = configService.getConfiguration();
      
      expect(config.learningSettings.enabled).toBe(false);
      expect(config.learningSettings.adaptationRate).toBe(0.2);
    });

    it('should reset to defaults', () => {
      // First modify the configuration
      configService.updateConfiguration({
        learningSettings: { enabled: false, adaptationRate: 0.5, minimumDataPoints: 20, confidenceThreshold: 0.9 }
      });

      // Then reset
      configService.resetToDefaults();
      const config = configService.getConfiguration();
      
      expect(config.learningSettings.enabled).toBe(true);
      expect(config.learningSettings.adaptationRate).toBe(0.1);
    });
  });

  describe('User Preference Management', () => {
    it('should get default preferences for new user', () => {
      const prefs = configService.getUserPreferences('newUser');
      
      expect(prefs).toBeDefined();
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.MODERATE);
      expect(prefs.communicationStyle).toBe(CommunicationStyle.CONVERSATIONAL);
    });

    it('should set and retrieve user preferences', () => {
      const customPrefs: UserPreferences = {
        interventionFrequency: InterventionFrequency.ACTIVE,
        preferredInformationTypes: [InformationType.COMPANY_INFO, InformationType.MARKET_DATA],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: [ExpertiseArea.FINTECH],
        maxInterventionsPerHour: 20
      };

      configService.setUserPreferences('user1', customPrefs);
      const retrieved = configService.getUserPreferences('user1');
      
      expect(retrieved.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
      expect(retrieved.communicationStyle).toBe(CommunicationStyle.FORMAL);
      expect(retrieved.maxInterventionsPerHour).toBe(20);
    });

    it('should update individual preference fields', () => {
      configService.updateUserPreference('user1', 'interventionFrequency', InterventionFrequency.MINIMAL);
      const prefs = configService.getUserPreferences('user1');
      
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.MINIMAL);
    });
  });

  describe('Learning System Integration', () => {
    it('should record user reactions', () => {
      const reactionData = {
        userId: 'user1',
        sessionId: 'session1',
        interventionId: 'information_provide',
        userReaction: 'positive',
        contextTags: ['market-data'],
        timestamp: new Date()
      };

      expect(() => configService.recordUserReaction(reactionData)).not.toThrow();
    });

    it('should adapt user preferences based on behavior', () => {
      const originalPrefs = configService.getUserPreferences('user1');
      const adaptedPrefs = configService.adaptUserPreferences('user1');
      
      expect(adaptedPrefs).toBeDefined();
      // Without sufficient learning data, preferences should remain the same
      expect(adaptedPrefs.interventionFrequency).toBe(originalPrefs.interventionFrequency);
    });

    it('should provide user insights', () => {
      const insights = configService.getUserInsights('user1');
      
      expect(insights).toBeDefined();
      expect(insights.totalInterventions).toBeDefined();
      expect(insights.engagementScore).toBeDefined();
    });
  });

  describe('Data Import/Export', () => {
    it('should export user data', () => {
      configService.setUserPreferences('user1', {
        interventionFrequency: InterventionFrequency.ACTIVE,
        preferredInformationTypes: [InformationType.MARKET_DATA],
        communicationStyle: CommunicationStyle.BRIEF,
        topicExpertise: []
      });

      const exportedData = configService.exportUserData('user1');
      
      expect(exportedData).toBeDefined();
      expect(exportedData.preferences).toBeDefined();
    });

    it('should import user data', () => {
      const importData = {
        preferences: {
          interventionFrequency: InterventionFrequency.VERY_ACTIVE,
          preferredInformationTypes: [InformationType.FINANCIAL_METRICS],
          communicationStyle: CommunicationStyle.DETAILED,
          topicExpertise: [ExpertiseArea.HEALTHCARE]
        }
      };

      configService.importUserData('user1', importData);
      const prefs = configService.getUserPreferences('user1');
      
      expect(prefs.interventionFrequency).toBe(InterventionFrequency.VERY_ACTIVE);
      expect(prefs.communicationStyle).toBe(CommunicationStyle.DETAILED);
    });
  });

  describe('Preference Validation', () => {
    it('should validate intervention frequency limits', () => {
      const invalidPrefs = {
        maxInterventionsPerHour: 150 // Too high
      };

      const errors = configService.validatePreferences(invalidPrefs);
      expect(errors).toContain('maxInterventionsPerHour must be between 0 and 100');
    });

    it('should validate negative intervention limits', () => {
      const invalidPrefs = {
        maxInterventionsPerHour: -5
      };

      const errors = configService.validatePreferences(invalidPrefs);
      expect(errors).toContain('maxInterventionsPerHour must be between 0 and 100');
    });

    it('should validate quiet hours format', () => {
      const invalidPrefs = {
        quietHours: [
          { start: '25:00', end: '08:00' }, // Invalid hour
          { start: '12:00', end: '13:70' }  // Invalid minute
        ]
      };

      const errors = configService.validatePreferences(invalidPrefs);
      expect(errors).toContain('quietHours must use HH:MM format');
    });

    it('should accept valid preferences', () => {
      const validPrefs = {
        maxInterventionsPerHour: 15,
        quietHours: [
          { start: '22:00', end: '08:00' },
          { start: '12:00', end: '13:00' }
        ]
      };

      const errors = configService.validatePreferences(validPrefs);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Utility Methods', () => {
    it('should provide preference options', () => {
      const options = configService.getPreferenceOptions();
      
      expect(options).toBeDefined();
      expect(options.interventionFrequencies).toBeDefined();
      expect(options.communicationStyles).toBeDefined();
      expect(options.informationTypes).toBeDefined();
      expect(options.expertiseAreas).toBeDefined();
      
      expect(Array.isArray(options.interventionFrequencies)).toBe(true);
      expect(options.interventionFrequencies.length).toBeGreaterThan(0);
    });

    it('should create user profile with role-based defaults', () => {
      const partnerProfile = configService.createUserProfile('partner1', 'partner');
      
      expect(partnerProfile.communicationStyle).toBe(CommunicationStyle.BRIEF);
      expect(partnerProfile.preferredInformationTypes).toContain(InformationType.MARKET_DATA);
    });

    it('should create analyst profile with appropriate defaults', () => {
      const analystProfile = configService.createUserProfile('analyst1', 'analyst');
      
      expect(analystProfile.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
      expect(analystProfile.communicationStyle).toBe(CommunicationStyle.DETAILED);
      expect(analystProfile.preferredInformationTypes).toContain(InformationType.COMPANY_INFO);
    });

    it('should create profile with custom initial preferences', () => {
      const customInitial = {
        interventionFrequency: InterventionFrequency.MINIMAL,
        communicationStyle: CommunicationStyle.CONVERSATIONAL
      };

      const profile = configService.createUserProfile('user1', 'partner', customInitial);
      
      expect(profile.interventionFrequency).toBe(InterventionFrequency.MINIMAL);
      expect(profile.communicationStyle).toBe(CommunicationStyle.CONVERSATIONAL);
    });

    it('should handle unknown roles gracefully', () => {
      const profile = configService.createUserProfile('user1', 'unknown_role');
      
      expect(profile).toBeDefined();
      expect(profile.interventionFrequency).toBe(InterventionFrequency.MODERATE); // Default
    });
  });

  describe('Persistence Methods', () => {
    it('should call save configuration', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      configService.updateConfiguration({
        learningSettings: { enabled: false, adaptationRate: 0.1, minimumDataPoints: 5, confidenceThreshold: 0.7 }
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('Configuration saved to', './test-config.json');
      consoleSpy.mockRestore();
    });

    it('should call load configuration', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      configService.loadConfiguration();
      
      expect(consoleSpy).toHaveBeenCalledWith('Configuration loaded from', './test-config.json');
      consoleSpy.mockRestore();
    });
  });
});