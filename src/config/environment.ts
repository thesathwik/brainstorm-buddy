import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface EnvironmentConfig {
  geminiApiKey: string;
  logLevel: string;
  port: number;
  nodeEnv: string;
  maxMessageHistory: number;
  interventionCooldownMs: number;
}

export const config: EnvironmentConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  maxMessageHistory: parseInt(process.env.MAX_MESSAGE_HISTORY || '100', 10),
  interventionCooldownMs: parseInt(process.env.INTERVENTION_COOLDOWN_MS || '5000', 10)
};

// Validate required environment variables
export function validateEnvironment(): void {
  const requiredVars = ['GEMINI_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}