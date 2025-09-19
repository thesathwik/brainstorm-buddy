module.exports = {
  // Application configuration
  app: {
    name: 'proactive-brainstorm-bot',
    version: '1.0.0',
    port: process.env.PORT || 8080,
    env: 'production'
  },

  // Bot configuration
  bot: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    enableLearning: process.env.ENABLE_LEARNING !== 'false',
    interventionThresholds: {
      topicDrift: parseFloat(process.env.TOPIC_DRIFT_THRESHOLD || '0.7'),
      informationGap: parseFloat(process.env.INFO_GAP_THRESHOLD || '0.6'),
      factCheck: parseFloat(process.env.FACT_CHECK_THRESHOLD || '0.8')
    }
  },

  // Monitoring configuration
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'), // 1 minute
    metricsCollectionInterval: parseInt(process.env.METRICS_INTERVAL || '30000'), // 30 seconds
    alertThresholds: {
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5'), // 5%
      responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '2000'), // 2 seconds
      memoryUsage: parseFloat(process.env.MEMORY_USAGE_THRESHOLD || '80'), // 80%
      cpuUsage: parseFloat(process.env.CPU_USAGE_THRESHOLD || '80') // 80%
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    enableConsole: true,
    enableFile: true,
    logFile: process.env.LOG_FILE || '/var/log/proactive-bot/app.log',
    maxFileSize: '10MB',
    maxFiles: 5
  },

  // Security configuration
  security: {
    enableCors: true,
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    enableRateLimit: true,
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: 100 // requests per window
  },

  // Database configuration (if needed for learning data)
  database: {
    url: process.env.DATABASE_URL,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000')
  },

  // Performance configuration
  performance: {
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '100'),
    messageQueueSize: parseInt(process.env.MESSAGE_QUEUE_SIZE || '1000'),
    responseTimeout: parseInt(process.env.RESPONSE_TIMEOUT || '10000') // 10 seconds
  }
};