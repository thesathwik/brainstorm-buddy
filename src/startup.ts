#!/usr/bin/env node

import { ProactiveBrainstormBot, BotConfiguration } from './index';
import { logger } from './config';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration with defaults
const config: BotConfiguration = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  chatPort: parseInt(process.env.CHAT_PORT || '8080'),
  logLevel: process.env.LOG_LEVEL || 'info',
  enableLearning: process.env.ENABLE_LEARNING !== 'false',
  interventionThresholds: {
    topicDrift: parseFloat(process.env.TOPIC_DRIFT_THRESHOLD || '0.7'),
    informationGap: parseFloat(process.env.INFO_GAP_THRESHOLD || '0.6'),
    factCheck: parseFloat(process.env.FACT_CHECK_THRESHOLD || '0.8')
  }
};

// Validate required configuration
if (!config.geminiApiKey) {
  logger.error('GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

// Create and start the bot
const bot = new ProactiveBrainstormBot(config);

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await bot.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  try {
    await bot.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the bot
async function startBot() {
  try {
    logger.info('Starting Proactive Brainstorm Bot...');
    logger.info('Configuration:', {
      chatPort: config.chatPort,
      enableLearning: config.enableLearning,
      interventionThresholds: config.interventionThresholds
    });
    
    await bot.start();
    
    // Log status every 30 seconds
    setInterval(() => {
      const status = bot.getStatus();
      logger.info('Bot Status:', {
        isRunning: status.isRunning,
        activeConversations: status.activeConversations,
        messagesProcessed: status.metrics.messagesProcessed,
        interventionsMade: status.metrics.interventionsMade,
        uptime: Math.round(status.metrics.uptime / 1000) + 's'
      });
    }, 30000);
    
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();