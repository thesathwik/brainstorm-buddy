import { ActivityLevel, InterventionFrequency } from '../models/Enums';
import { UserPreferences } from '../models/UserPreferences';

export interface ActivityLevelChange {
  userId: string;
  previousLevel: ActivityLevel;
  newLevel: ActivityLevel;
  timestamp: Date;
  reason: string;
}

export interface ManualControlManager {
  setActivityLevel(userId: string, level: ActivityLevel, reason?: string): void;
  getActivityLevel(userId: string): ActivityLevel;
  getActivityHistory(userId: string): ActivityLevelChange[];
  shouldAllowIntervention(userId: string, baseDecision: boolean): boolean;
  adjustInterventionFrequency(userId: string, preferences: UserPreferences): InterventionFrequency;
}

export class DefaultManualControlManager implements ManualControlManager {
  private userActivityLevels: Map<string, ActivityLevel> = new Map();
  private activityHistory: Map<string, ActivityLevelChange[]> = new Map();
  private defaultActivityLevel: ActivityLevel = ActivityLevel.NORMAL;

  setActivityLevel(userId: string, level: ActivityLevel, reason: string = 'Manual control'): void {
    const previousLevel = this.userActivityLevels.get(userId) || this.defaultActivityLevel;
    
    // Record the change
    const change: ActivityLevelChange = {
      userId,
      previousLevel,
      newLevel: level,
      timestamp: new Date(),
      reason
    };

    // Update current level
    this.userActivityLevels.set(userId, level);

    // Add to history
    if (!this.activityHistory.has(userId)) {
      this.activityHistory.set(userId, []);
    }
    this.activityHistory.get(userId)!.push(change);

    // Keep only last 50 changes per user
    const history = this.activityHistory.get(userId)!;
    if (history.length > 50) {
      this.activityHistory.set(userId, history.slice(-50));
    }
  }

  getActivityLevel(userId: string): ActivityLevel {
    return this.userActivityLevels.get(userId) || this.defaultActivityLevel;
  }

  getActivityHistory(userId: string): ActivityLevelChange[] {
    return this.activityHistory.get(userId) || [];
  }

  shouldAllowIntervention(userId: string, baseDecision: boolean): boolean {
    const activityLevel = this.getActivityLevel(userId);
    
    switch (activityLevel) {
      case ActivityLevel.SILENT:
        // Never intervene when silent, except for direct summons
        return false;
      
      case ActivityLevel.QUIET:
        // Only intervene for high-priority situations
        // Reduce intervention probability by 70%
        return baseDecision && Math.random() > 0.7;
      
      case ActivityLevel.NORMAL:
        // Use the base decision as-is
        return baseDecision;
      
      case ActivityLevel.ACTIVE:
        // Be more proactive - increase intervention probability
        // If base decision is false, give it a 30% chance to still intervene
        return baseDecision || Math.random() < 0.3;
      
      default:
        return baseDecision;
    }
  }

  adjustInterventionFrequency(userId: string, preferences: UserPreferences): InterventionFrequency {
    const activityLevel = this.getActivityLevel(userId);
    const baseFrequency = preferences.interventionFrequency;
    
    switch (activityLevel) {
      case ActivityLevel.SILENT:
        return InterventionFrequency.MINIMAL;
      
      case ActivityLevel.QUIET:
        // Reduce frequency by one level
        switch (baseFrequency) {
          case InterventionFrequency.VERY_ACTIVE:
            return InterventionFrequency.ACTIVE;
          case InterventionFrequency.ACTIVE:
            return InterventionFrequency.MODERATE;
          case InterventionFrequency.MODERATE:
            return InterventionFrequency.MINIMAL;
          case InterventionFrequency.MINIMAL:
            return InterventionFrequency.MINIMAL;
          default:
            return InterventionFrequency.MINIMAL;
        }
      
      case ActivityLevel.NORMAL:
        return baseFrequency;
      
      case ActivityLevel.ACTIVE:
        // Increase frequency by one level
        switch (baseFrequency) {
          case InterventionFrequency.MINIMAL:
            return InterventionFrequency.MODERATE;
          case InterventionFrequency.MODERATE:
            return InterventionFrequency.ACTIVE;
          case InterventionFrequency.ACTIVE:
            return InterventionFrequency.VERY_ACTIVE;
          case InterventionFrequency.VERY_ACTIVE:
            return InterventionFrequency.VERY_ACTIVE;
          default:
            return InterventionFrequency.MODERATE;
        }
      
      default:
        return baseFrequency;
    }
  }

  // Helper method to reset activity level to normal (useful for testing or session resets)
  resetActivityLevel(userId: string): void {
    this.setActivityLevel(userId, ActivityLevel.NORMAL, 'Reset to normal');
  }

  // Helper method to get all users with non-normal activity levels
  getUsersWithModifiedActivity(): Map<string, ActivityLevel> {
    const modifiedUsers = new Map<string, ActivityLevel>();
    
    for (const [userId, level] of this.userActivityLevels.entries()) {
      if (level !== ActivityLevel.NORMAL) {
        modifiedUsers.set(userId, level);
      }
    }
    
    return modifiedUsers;
  }

  // Helper method to check if a user has recently changed their activity level
  hasRecentActivityChange(userId: string, withinMinutes: number = 5): boolean {
    const history = this.getActivityHistory(userId);
    if (history.length === 0) return false;
    
    const lastChange = history[history.length - 1];
    const now = new Date();
    const timeDiff = now.getTime() - lastChange.timestamp.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff <= withinMinutes;
  }
}