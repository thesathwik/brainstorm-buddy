import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigurationService } from '../../src/services/ConfigurationService';
import { 
  UserPreferences, 
  PreferenceLearningData 
} from '../../src/models/UserPreferences';
import { 
  InterventionFrequency, 
  CommunicationStyle, 
  InformationType, 
  ExpertiseArea,
  InterventionType 
} from '../../src/models/Enums';

describe('Configuration System Integration', () => {
  let configService: ConfigurationService;

  beforeEach(() => {
    // Reset singleton for each test
    (ConfigurationService as any).instance = undefined;
    configService = ConfigurationService.getInstance('./integration-test-config.json');
  });

  describe('End-to-End User Preference Management', () => {
    it('should handle complete user lifecycle with learning', async () => {
      const userId = 'integration-user-1';
      
      // 1. Create new user profile
      const initialProfile = configService.createUserProfile(userId, 'analyst', {
        interventionFrequency: InterventionFrequency.MODERATE,
        maxInterventionsPerHour: 8
      });
      
      expect(initialProfile.interventionFrequency).toBe(InterventionFrequency.MODERATE);
      expect(initialProfile.communicationStyle).toBe(CommunicationStyle.DETAILED); // Analyst default
      
      // 2. Simulate user interactions with positive feedback
      const positiveInteractions = [
        InterventionType.INFORMATION_PROVIDE,
        InterventionType.FACT_CHECK,
        InterventionType.INFORMATION_PROVIDE,
        InterventionType.FACT_CHECK,
        InterventionType.INFORMATION_PROVIDE,
        InterventionType.FACT_CHECK
      ];
      
      positiveInteractions.forEach((type, index) => {
        const learningData: PreferenceLearningData = {
          userId,
          sessionId: `session-${index}`,
          interventionId: type,
          userReaction: 'positive',
          contextTags: ['market-analysis', 'fintech'],
          timestamp: new Date(Date.now() - (index * 1000 * 60)) // Spread over time
        };
        configService.recordUserReaction(learningData);
      });
      
      // 3. Adapt preferences based on behavior
      const adaptedPrefs = configService.adaptUserPreferences(userId);
      
      // Should increase frequency due to positive feedback
      expect([
        InterventionFrequency.ACTIVE,
        InterventionFrequency.VERY_ACTIVE
      ]).toContain(adaptedPrefs.interventionFrequency);
      
      // Should identify preferred intervention types
      expect(adaptedPrefs.preferredInterventionTypes).toBeDefined();
      expect(adaptedPrefs.preferredInterventionTypes!.length).toBeGreaterThan(0);
      
      // 4. Get user insights
      const insights = configService.getUserInsights(userId);
      expect(insights.totalInterventions).toBe(6);
      expect(insights.engagementScore).toBe(1.0); // All positive reactions
      expect(insights.preferredTypes).toContain(InterventionType.INFORMATION_PROVIDE);
      expect(insights.preferredTypes).toContain(InterventionType.FACT_CHECK);
    });

    it('should handle mixed feedback and adjust accordingly', () => {
      const userId = 'integration-user-2';
      
      // Create user with high initial frequency
      configService.createUserProfile(userId, 'partner', {
        interventionFrequency: InterventionFrequency.VERY_ACTIVE
      });
      
      // Simulate mixed feedback with more negative reactions
      const mixedInteractions = [
        { type: InterventionType.TOPIC_REDIRECT, reaction: 'negative' },
        { type: InterventionType.TOPIC_REDIRECT, reaction: 'negative' },
        { type: InterventionType.INFORMATION_PROVIDE, reaction: 'positive' },
        { type: InterventionType.TOPIC_REDIRECT, reaction: 'ignored' },
        { type: InterventionType.INFORMATION_PROVIDE, reaction: 'positive' },
        { type: InterventionType.TOPIC_REDIRECT, reaction: 'negative' }
      ];
      
      mixedInteractions.forEach((interaction, index) => {
        const learningData: PreferenceLearningData = {
          userId,
          sessionId: `mixed-session-${index}`,
          interventionId: interaction.type,
          userReaction: interaction.reaction as any,
          contextTags: ['strategy-discussion'],
          timestamp: new Date()
        };
        configService.recordUserReaction(learningData);
      });
      
      const adaptedPrefs = configService.adaptUserPreferences(userId);
      
      // Should decrease frequency due to negative feedback
      expect([
        InterventionFrequency.MINIMAL,
        InterventionFrequency.MODERATE,
        InterventionFrequency.ACTIVE
      ]).toContain(adaptedPrefs.interventionFrequency);
      
      // Should prefer information providing over topic redirects
      const insights = configService.getUserInsights(userId);
      expect(insights.preferredTypes).toContain(InterventionType.INFORMATION_PROVIDE);
      expect(insights.preferredTypes).not.toContain(InterventionType.TOPIC_REDIRECT);
    });
  });

  describe('Configuration Persistence and Recovery', () => {
    it('should maintain user data across configuration changes', () => {
      const userId = 'persistent-user';
      
      // Set initial preferences
      const initialPrefs: UserPreferences = {
        interventionFrequency: InterventionFrequency.ACTIVE,
        preferredInformationTypes: [InformationType.MARKET_DATA, InformationType.COMPANY_INFO],
        communicationStyle: CommunicationStyle.FORMAL,
        topicExpertise: [ExpertiseArea.FINTECH, ExpertiseArea.HEALTHCARE],
        maxInterventionsPerHour: 15,
        quietHours: [{ start: '22:00', end: '08:00' }]
      };
      
      configService.setUserPreferences(userId, initialPrefs);
      
      // Export user data
      const exportedData = configService.exportUserData(userId);
      
      // Simulate configuration change
      configService.updateConfiguration({
        learningSettings: {
          enabled: false,
          adaptationRate: 0.05,
          minimumDataPoints: 10,
          confidenceThreshold: 0.9
        }
      });
      
      // User preferences should still be intact
      const retrievedPrefs = configService.getUserPreferences(userId);
      expect(retrievedPrefs.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
      expect(retrievedPrefs.maxInterventionsPerHour).toBe(15);
      expect(retrievedPrefs.quietHours).toHaveLength(1);
      
      // Import should work correctly
      configService.importUserData(`${userId}-copy`, exportedData);
      const importedPrefs = configService.getUserPreferences(`${userId}-copy`);
      expect(importedPrefs.interventionFrequency).toBe(InterventionFrequency.ACTIVE);
    });
  });

  describe('Multi-User Scenario', () => {
    it('should handle multiple users with different preferences and learning patterns', () => {
      const users = [
        { id: 'partner-1', role: 'partner' },
        { id: 'analyst-1', role: 'analyst' },
        { id: 'analyst-2', role: 'analyst' }
      ];
      
      // Create profiles for all users
      users.forEach(user => {
        configService.createUserProfile(user.id, user.role);
      });
      
      // Simulate different interaction patterns for each user
      
      // Partner prefers brief, infrequent interventions (need minimum 5 data points)
      const partnerInteractions = [
        { type: InterventionType.SUMMARY_OFFER, reaction: 'positive' },
        { type: InterventionType.INFORMATION_PROVIDE, reaction: 'ignored' },
        { type: InterventionType.SUMMARY_OFFER, reaction: 'positive' },
        { type: InterventionType.SUMMARY_OFFER, reaction: 'positive' },
        { type: InterventionType.INFORMATION_PROVIDE, reaction: 'negative' }
      ];
      
      partnerInteractions.forEach((interaction, index) => {
        const learningData: PreferenceLearningData = {
          userId: 'partner-1',
          sessionId: `partner-session-${index}`,
          interventionId: interaction.type,
          userReaction: interaction.reaction as any,
          contextTags: ['executive-summary'],
          timestamp: new Date()
        };
        configService.recordUserReaction(learningData);
      });
      
      // Analyst 1 prefers detailed information
      const analyst1Interactions = Array(6).fill(null).map((_, index) => ({
        type: InterventionType.INFORMATION_PROVIDE,
        reaction: 'positive'
      }));
      
      analyst1Interactions.forEach((interaction, index) => {
        const learningData: PreferenceLearningData = {
          userId: 'analyst-1',
          sessionId: `analyst1-session-${index}`,
          interventionId: interaction.type,
          userReaction: interaction.reaction as any,
          contextTags: ['detailed-analysis'],
          timestamp: new Date()
        };
        configService.recordUserReaction(learningData);
      });
      
      // Adapt preferences for all users
      const partnerAdapted = configService.adaptUserPreferences('partner-1');
      const analyst1Adapted = configService.adaptUserPreferences('analyst-1');
      const analyst2Prefs = configService.getUserPreferences('analyst-2'); // No learning data
      
      // Verify different adaptation outcomes
      expect(partnerAdapted.preferredInterventionTypes).toContain(InterventionType.SUMMARY_OFFER);
      expect(analyst1Adapted.interventionFrequency).toBe(InterventionFrequency.VERY_ACTIVE);
      expect(analyst2Prefs.interventionFrequency).toBe(InterventionFrequency.ACTIVE); // Default for analyst
      
      // Get insights for all users
      const partnerInsights = configService.getUserInsights('partner-1');
      const analyst1Insights = configService.getUserInsights('analyst-1');
      const analyst2Insights = configService.getUserInsights('analyst-2');
      
      expect(partnerInsights.totalInterventions).toBe(5);
      expect(analyst1Insights.totalInterventions).toBe(6);
      expect(analyst2Insights.totalInterventions).toBe(0);
      
      expect(analyst1Insights.engagementScore).toBe(1.0); // All positive
      expect(partnerInsights.engagementScore).toBeGreaterThan(0.5); // Mixed but mostly positive
    });
  });

  describe('Preference Validation Integration', () => {
    it('should validate and reject invalid preferences in real scenarios', () => {
      const userId = 'validation-user';
      
      // Try to set invalid preferences
      const invalidPrefs: Partial<UserPreferences> = {
        maxInterventionsPerHour: 200, // Too high
        quietHours: [
          { start: '25:00', end: '08:00' }, // Invalid time
          { start: '12:00', end: '13:00' }  // Valid time
        ]
      };
      
      const errors = configService.validatePreferences(invalidPrefs);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('maxInterventionsPerHour must be between 0 and 100');
      expect(errors).toContain('quietHours must use HH:MM format');
      
      // Valid preferences should pass
      const validPrefs: Partial<UserPreferences> = {
        maxInterventionsPerHour: 12,
        quietHours: [
          { start: '23:00', end: '07:00' },
          { start: '12:30', end: '13:30' }
        ]
      };
      
      const validErrors = configService.validatePreferences(validPrefs);
      expect(validErrors).toHaveLength(0);
    });
  });

  describe('System Configuration Impact', () => {
    it('should respect system-wide learning settings', () => {
      const userId = 'system-test-user';
      
      // Disable learning system-wide
      configService.updateConfiguration({
        learningSettings: {
          enabled: false,
          adaptationRate: 0.1,
          minimumDataPoints: 5,
          confidenceThreshold: 0.7
        }
      });
      
      // Record interactions
      const learningData: PreferenceLearningData = {
        userId,
        sessionId: 'disabled-session',
        interventionId: InterventionType.INFORMATION_PROVIDE,
        userReaction: 'positive',
        contextTags: ['test'],
        timestamp: new Date()
      };
      
      configService.recordUserReaction(learningData);
      
      // Insights should show no learning occurred
      const insights = configService.getUserInsights(userId);
      expect(insights.totalInterventions).toBe(0);
      
      // Re-enable learning
      configService.updateConfiguration({
        learningSettings: {
          enabled: true,
          adaptationRate: 0.1,
          minimumDataPoints: 5,
          confidenceThreshold: 0.7
        }
      });
      
      // Now learning should work
      configService.recordUserReaction(learningData);
      const updatedInsights = configService.getUserInsights(userId);
      expect(updatedInsights.totalInterventions).toBe(1);
    });
  });
});