import { 
  ConfigurationSettings, 
  UserPreferences, 
  UserPreferencesManager 
} from '../models/UserPreferences';
import { 
  InterventionFrequency, 
  CommunicationStyle, 
  InformationType, 
  ExpertiseArea 
} from '../models/Enums';

export class ConfigurationService {
  private static instance: ConfigurationService;
  private preferencesManager: UserPreferencesManager;
  private configFilePath: string;

  private constructor(configPath: string = './config/bot-config.json') {
    this.configFilePath = configPath;
    const defaultConfig = this.createDefaultConfiguration();
    this.preferencesManager = new UserPreferencesManager(defaultConfig);
  }

  public static getInstance(configPath?: string): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService(configPath);
    }
    return ConfigurationService.instance;
  }

  private createDefaultConfiguration(): ConfigurationSettings {
    return {
      defaultPreferences: {
        interventionFrequency: InterventionFrequency.MODERATE,
        preferredInformationTypes: [
          InformationType.MARKET_DATA,
          InformationType.COMPANY_INFO,
          InformationType.FINANCIAL_METRICS
        ],
        communicationStyle: CommunicationStyle.CONVERSATIONAL,
        topicExpertise: [],
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
        backupFrequency: 24 // hours
      }
    };
  }

  // Configuration management
  public getConfiguration(): ConfigurationSettings {
    return this.preferencesManager['config'];
  }

  public updateConfiguration(updates: Partial<ConfigurationSettings>): void {
    this.preferencesManager.updateConfiguration(updates);
    this.saveConfiguration();
  }

  public resetToDefaults(): void {
    const defaultConfig = this.createDefaultConfiguration();
    this.preferencesManager.updateConfiguration(defaultConfig);
    this.saveConfiguration();
  }

  // User preference delegation
  public getUserPreferences(userId: string): UserPreferences {
    return this.preferencesManager.getUserPreferences(userId);
  }

  public setUserPreferences(userId: string, preferences: UserPreferences): void {
    this.preferencesManager.setUserPreferences(userId, preferences);
  }

  public updateUserPreference<K extends keyof UserPreferences>(
    userId: string, 
    key: K, 
    value: UserPreferences[K]
  ): void {
    this.preferencesManager.updateUserPreference(userId, key, value);
  }

  // Learning system delegation
  public recordUserReaction(data: any): void {
    this.preferencesManager.recordUserReaction(data);
  }

  public adaptUserPreferences(userId: string): UserPreferences {
    const adaptedPrefs = this.preferencesManager.adaptPreferencesFromBehavior(userId);
    this.preferencesManager.setUserPreferences(userId, adaptedPrefs);
    return adaptedPrefs;
  }

  public getUserInsights(userId: string): any {
    return this.preferencesManager.getUserInsights(userId);
  }

  // Persistence methods (simplified for this implementation)
  private saveConfiguration(): void {
    // In a real implementation, this would save to file system or database
    // For now, we'll just log that configuration was saved
    console.log('Configuration saved to', this.configFilePath);
  }

  public loadConfiguration(): void {
    // In a real implementation, this would load from file system or database
    // For now, we'll use the default configuration
    console.log('Configuration loaded from', this.configFilePath);
  }

  // Backup and restore
  public exportUserData(userId: string): any {
    return this.preferencesManager.exportUserData(userId);
  }

  public importUserData(userId: string, data: any): void {
    this.preferencesManager.importUserData(userId, data);
  }

  // Validation helpers
  public validatePreferences(preferences: Partial<UserPreferences>): string[] {
    const errors: string[] = [];

    if (preferences.maxInterventionsPerHour !== undefined) {
      if (preferences.maxInterventionsPerHour < 0 || preferences.maxInterventionsPerHour > 100) {
        errors.push('maxInterventionsPerHour must be between 0 and 100');
      }
    }

    if (preferences.quietHours) {
      for (const timeRange of preferences.quietHours) {
        if (!this.isValidTimeFormat(timeRange.start) || !this.isValidTimeFormat(timeRange.end)) {
          errors.push('quietHours must use HH:MM format');
        }
      }
    }

    return errors;
  }

  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  // Utility methods for preference management
  public getPreferenceOptions(): any {
    return {
      interventionFrequencies: Object.values(InterventionFrequency),
      communicationStyles: Object.values(CommunicationStyle),
      informationTypes: Object.values(InformationType),
      expertiseAreas: Object.values(ExpertiseArea)
    };
  }

  public createUserProfile(userId: string, role: string, initialPrefs?: Partial<UserPreferences>): UserPreferences {
    const defaultPrefs = this.getConfiguration().defaultPreferences;
    const roleBasedPrefs = this.getRoleBasedDefaults(role);
    
    const preferences: UserPreferences = {
      ...defaultPrefs,
      ...roleBasedPrefs,
      ...initialPrefs
    };

    this.setUserPreferences(userId, preferences);
    return preferences;
  }

  private getRoleBasedDefaults(role: string): Partial<UserPreferences> {
    switch (role.toLowerCase()) {
      case 'partner':
        return {
          interventionFrequency: InterventionFrequency.MODERATE,
          communicationStyle: CommunicationStyle.BRIEF,
          preferredInformationTypes: [
            InformationType.MARKET_DATA,
            InformationType.FINANCIAL_METRICS,
            InformationType.COMPETITIVE_ANALYSIS
          ]
        };
      case 'analyst':
        return {
          interventionFrequency: InterventionFrequency.ACTIVE,
          communicationStyle: CommunicationStyle.DETAILED,
          preferredInformationTypes: [
            InformationType.COMPANY_INFO,
            InformationType.FINANCIAL_METRICS,
            InformationType.INDUSTRY_TRENDS
          ]
        };
      default:
        return {};
    }
  }
}