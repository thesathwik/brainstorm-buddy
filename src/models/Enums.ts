export enum VCRole {
  PARTNER = 'partner',
  PRINCIPAL = 'principal',
  ANALYST = 'analyst',
  ENTREPRENEUR = 'entrepreneur',
  GUEST = 'guest'
}

export enum InterventionType {
  TOPIC_REDIRECT = 'topic_redirect',
  INFORMATION_PROVIDE = 'information_provide',
  FACT_CHECK = 'fact_check',
  CLARIFICATION_REQUEST = 'clarification_request',
  SUMMARY_OFFER = 'summary_offer'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum MeetingType {
  INVESTMENT_REVIEW = 'investment_review',
  PORTFOLIO_UPDATE = 'portfolio_update',
  STRATEGY_SESSION = 'strategy_session',
  DUE_DILIGENCE = 'due_diligence',
  GENERAL_DISCUSSION = 'general_discussion'
}

export enum InterventionFrequency {
  MINIMAL = 'minimal',
  MODERATE = 'moderate',
  ACTIVE = 'active',
  VERY_ACTIVE = 'very_active'
}

export enum InformationType {
  MARKET_DATA = 'market_data',
  COMPANY_INFO = 'company_info',
  FINANCIAL_METRICS = 'financial_metrics',
  INDUSTRY_TRENDS = 'industry_trends',
  COMPETITIVE_ANALYSIS = 'competitive_analysis'
}

export enum CommunicationStyle {
  FORMAL = 'formal',
  CONVERSATIONAL = 'conversational',
  BRIEF = 'brief',
  DETAILED = 'detailed'
}

export enum ExpertiseArea {
  FINTECH = 'fintech',
  HEALTHCARE = 'healthcare',
  ENTERPRISE_SOFTWARE = 'enterprise_software',
  CONSUMER_TECH = 'consumer_tech',
  DEEP_TECH = 'deep_tech',
  BIOTECH = 'biotech'
}

export enum SummonType {
  BOT_MENTION = 'bot_mention',
  TRIGGER_PHRASE = 'trigger_phrase',
  HELP_REQUEST = 'help_request',
  ACTIVITY_CONTROL = 'activity_control'
}

export enum ActivityLevel {
  SILENT = 'silent',
  QUIET = 'quiet',
  NORMAL = 'normal',
  ACTIVE = 'active'
}

export interface BotStatus {
  isRunning: boolean;
  startTime: Date | null;
  activeConversations: number;
  metrics: {
    messagesProcessed: number;
    interventionsMade: number;
    interventionsByType: Record<InterventionType, number>;
    averageResponseTime: number;
    uptime: number;
    errorCount: number;
    learningEvents: number;
  };
}