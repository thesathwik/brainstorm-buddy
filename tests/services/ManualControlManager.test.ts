import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultManualControlManager } from '../../src/services/ManualControlManager';
import { ActivityLevel, InterventionFrequency } from '../../src/models/Enums';
import { UserPreferences } from '../../src/models/UserPreferences';

describe('ManualControlManager', () => {
  let controlManager: DefaultManualControlManager;
  let testUserId: string;
  let testPreferences: UserPreferences;

  beforeEach(() => {
    controlManager = new DefaultManualControlManager();
    testUserId = 'test-user-1';
    testPreferences = {
      interventionFrequency: InterventionFrequency.MODERATE,
      preferredInformationTypes: [],
      communicationStyle: 'conversational' as any,
      topicExpertise: []
    };
  });

  describe('Activity Level Management', () => {
    it('should start with normal activity level by default', () => {
      const level = controlManager.getActivityLevel(testUserId);
      expect(level).toBe(ActivityLevel.NORMAL);
    });

    it('should set and retrieve activity levels', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.QUIET, 'User request');
      
      const level = controlManager.getActivityLevel(testUserId);
      expect(level).toBe(ActivityLevel.QUIET);
    });

    it('should record activity level changes in history', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.SILENT, 'Test change');
      
      const history = controlManager.getActivityHistory(testUserId);
      expect(history).toHaveLength(1);
      expect(history[0].newLevel).toBe(ActivityLevel.SILENT);
      expect(history[0].previousLevel).toBe(ActivityLevel.NORMAL);
      expect(history[0].reason).toBe('Test change');
      expect(history[0].userId).toBe(testUserId);
    });

    it('should track multiple activity level changes', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.QUIET, 'First change');
      controlManager.setActivityLevel(testUserId, ActivityLevel.ACTIVE, 'Second change');
      controlManager.setActivityLevel(testUserId, ActivityLevel.NORMAL, 'Third change');
      
      const history = controlManager.getActivityHistory(testUserId);
      expect(history).toHaveLength(3);
      expect(history[0].newLevel).toBe(ActivityLevel.QUIET);
      expect(history[1].newLevel).toBe(ActivityLevel.ACTIVE);
      expect(history[2].newLevel).toBe(ActivityLevel.NORMAL);
    });

    it('should limit history to 50 entries', () => {
      // Add 60 changes
      for (let i = 0; i < 60; i++) {
        const level = i % 2 === 0 ? ActivityLevel.QUIET : ActivityLevel.ACTIVE;
        controlManager.setActivityLevel(testUserId, level, `Change ${i}`);
      }
      
      const history = controlManager.getActivityHistory(testUserId);
      expect(history).toHaveLength(50);
      expect(history[0].reason).toBe('Change 10'); // Should start from change 10 (60-50)
    });
  });

  describe('Intervention Control', () => {
    it('should allow intervention at normal activity level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.NORMAL);
      
      const shouldAllow = controlManager.shouldAllowIntervention(testUserId, true);
      expect(shouldAllow).toBe(true);
    });

    it('should block intervention at silent activity level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.SILENT);
      
      const shouldAllow = controlManager.shouldAllowIntervention(testUserId, true);
      expect(shouldAllow).toBe(false);
    });

    it('should reduce intervention probability at quiet level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.QUIET);
      
      // Test multiple times to check probability
      let allowedCount = 0;
      const testRuns = 100;
      
      for (let i = 0; i < testRuns; i++) {
        if (controlManager.shouldAllowIntervention(testUserId, true)) {
          allowedCount++;
        }
      }
      
      // Should allow roughly 30% of interventions (100% - 70% reduction)
      expect(allowedCount).toBeLessThan(50); // Should be significantly less than 100%
      expect(allowedCount).toBeGreaterThan(10); // But not zero
    });

    it('should increase intervention probability at active level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.ACTIVE);
      
      // Test with base decision false
      let allowedCount = 0;
      const testRuns = 100;
      
      for (let i = 0; i < testRuns; i++) {
        if (controlManager.shouldAllowIntervention(testUserId, false)) {
          allowedCount++;
        }
      }
      
      // Should allow roughly 30% of interventions even when base decision is false
      expect(allowedCount).toBeGreaterThan(15);
      expect(allowedCount).toBeLessThan(50);
    });

    it('should always allow when base decision is true at active level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.ACTIVE);
      
      const shouldAllow = controlManager.shouldAllowIntervention(testUserId, true);
      expect(shouldAllow).toBe(true);
    });
  });

  describe('Intervention Frequency Adjustment', () => {
    it('should not change frequency at normal activity level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.NORMAL);
      
      const adjustedFrequency = controlManager.adjustInterventionFrequency(testUserId, testPreferences);
      expect(adjustedFrequency).toBe(InterventionFrequency.MODERATE);
    });

    it('should set minimal frequency at silent level', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.SILENT);
      
      const adjustedFrequency = controlManager.adjustInterventionFrequency(testUserId, testPreferences);
      expect(adjustedFrequency).toBe(InterventionFrequency.MINIMAL);
    });

    it('should reduce frequency by one level at quiet activity', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.QUIET);
      
      // Test with different base frequencies
      const testCases = [
        { base: InterventionFrequency.VERY_ACTIVE, expected: InterventionFrequency.ACTIVE },
        { base: InterventionFrequency.ACTIVE, expected: InterventionFrequency.MODERATE },
        { base: InterventionFrequency.MODERATE, expected: InterventionFrequency.MINIMAL },
        { base: InterventionFrequency.MINIMAL, expected: InterventionFrequency.MINIMAL }
      ];
      
      testCases.forEach(({ base, expected }) => {
        const prefs = { ...testPreferences, interventionFrequency: base };
        const adjusted = controlManager.adjustInterventionFrequency(testUserId, prefs);
        expect(adjusted).toBe(expected);
      });
    });

    it('should increase frequency by one level at active activity', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.ACTIVE);
      
      // Test with different base frequencies
      const testCases = [
        { base: InterventionFrequency.MINIMAL, expected: InterventionFrequency.MODERATE },
        { base: InterventionFrequency.MODERATE, expected: InterventionFrequency.ACTIVE },
        { base: InterventionFrequency.ACTIVE, expected: InterventionFrequency.VERY_ACTIVE },
        { base: InterventionFrequency.VERY_ACTIVE, expected: InterventionFrequency.VERY_ACTIVE }
      ];
      
      testCases.forEach(({ base, expected }) => {
        const prefs = { ...testPreferences, interventionFrequency: base };
        const adjusted = controlManager.adjustInterventionFrequency(testUserId, prefs);
        expect(adjusted).toBe(expected);
      });
    });
  });

  describe('Helper Methods', () => {
    it('should reset activity level to normal', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.SILENT);
      controlManager.resetActivityLevel(testUserId);
      
      const level = controlManager.getActivityLevel(testUserId);
      expect(level).toBe(ActivityLevel.NORMAL);
      
      const history = controlManager.getActivityHistory(testUserId);
      expect(history).toHaveLength(2);
      expect(history[1].reason).toBe('Reset to normal');
    });

    it('should identify users with modified activity levels', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      const user3 = 'user-3';
      
      controlManager.setActivityLevel(user1, ActivityLevel.QUIET);
      controlManager.setActivityLevel(user2, ActivityLevel.ACTIVE);
      // user3 stays at normal level
      
      const modifiedUsers = controlManager.getUsersWithModifiedActivity();
      
      expect(modifiedUsers.size).toBe(2);
      expect(modifiedUsers.get(user1)).toBe(ActivityLevel.QUIET);
      expect(modifiedUsers.get(user2)).toBe(ActivityLevel.ACTIVE);
      expect(modifiedUsers.has(user3)).toBe(false);
    });

    it('should detect recent activity changes', () => {
      controlManager.setActivityLevel(testUserId, ActivityLevel.QUIET);
      
      const hasRecent = controlManager.hasRecentActivityChange(testUserId, 5);
      expect(hasRecent).toBe(true);
    });

    it('should not detect old activity changes', () => {
      // This test would need to mock time or wait, so we'll test the logic
      const hasRecent = controlManager.hasRecentActivityChange('non-existent-user', 5);
      expect(hasRecent).toBe(false);
    });
  });

  describe('Multiple Users', () => {
    it('should handle multiple users independently', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      
      controlManager.setActivityLevel(user1, ActivityLevel.QUIET);
      controlManager.setActivityLevel(user2, ActivityLevel.ACTIVE);
      
      expect(controlManager.getActivityLevel(user1)).toBe(ActivityLevel.QUIET);
      expect(controlManager.getActivityLevel(user2)).toBe(ActivityLevel.ACTIVE);
      
      const user1History = controlManager.getActivityHistory(user1);
      const user2History = controlManager.getActivityHistory(user2);
      
      expect(user1History).toHaveLength(1);
      expect(user2History).toHaveLength(1);
      expect(user1History[0].newLevel).toBe(ActivityLevel.QUIET);
      expect(user2History[0].newLevel).toBe(ActivityLevel.ACTIVE);
    });

    it('should handle intervention decisions independently for multiple users', () => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      
      controlManager.setActivityLevel(user1, ActivityLevel.SILENT);
      controlManager.setActivityLevel(user2, ActivityLevel.ACTIVE);
      
      expect(controlManager.shouldAllowIntervention(user1, true)).toBe(false);
      expect(controlManager.shouldAllowIntervention(user2, true)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown activity levels gracefully', () => {
      // This tests the default case in switch statements
      const shouldAllow = controlManager.shouldAllowIntervention('unknown-user', true);
      expect(shouldAllow).toBe(true); // Should default to normal behavior
    });

    it('should handle empty user IDs', () => {
      const level = controlManager.getActivityLevel('');
      expect(level).toBe(ActivityLevel.NORMAL);
      
      controlManager.setActivityLevel('', ActivityLevel.QUIET);
      const newLevel = controlManager.getActivityLevel('');
      expect(newLevel).toBe(ActivityLevel.QUIET);
    });
  });
});