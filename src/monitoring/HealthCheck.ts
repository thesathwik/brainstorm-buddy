import { ProactiveBrainstormBot } from '../index';
import { logger } from '../config';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  checks: {
    botRunning: boolean;
    apiConnectivity: boolean;
    memoryUsage: number;
    responseTime: number;
    errorRate: number;
  };
  details?: string;
}

export class HealthCheckService {
  private bot: ProactiveBrainstormBot;
  private lastHealthCheck: HealthCheckResult | null = null;

  constructor(bot: ProactiveBrainstormBot) {
    this.bot = bot;
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const status = this.bot.getStatus();
      const metrics = this.bot.getMetrics();
      
      // Check bot status
      const botRunning = status.isRunning;
      
      // Check API connectivity (simplified check)
      const apiConnectivity = await this.checkApiConnectivity();
      
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Calculate error rate (errors per message in last period)
      const errorRate = metrics.messagesProcessed > 0 
        ? (metrics.errorCount / metrics.messagesProcessed) * 100 
        : 0;
      
      const checks = {
        botRunning,
        apiConnectivity,
        memoryUsage: memoryUsagePercent,
        responseTime,
        errorRate
      };
      
      // Determine overall health status
      let healthStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let details = '';
      
      if (!botRunning) {
        healthStatus = 'unhealthy';
        details = 'Bot is not running';
      } else if (!apiConnectivity) {
        healthStatus = 'degraded';
        details = 'API connectivity issues';
      } else if (memoryUsagePercent > 90) {
        healthStatus = 'degraded';
        details = 'High memory usage';
      } else if (errorRate > 10) {
        healthStatus = 'degraded';
        details = 'High error rate';
      } else if (responseTime > 5000) {
        healthStatus = 'degraded';
        details = 'Slow response times';
      }
      
      const result: HealthCheckResult = {
        status: healthStatus,
        timestamp: new Date(),
        checks,
        details
      };
      
      this.lastHealthCheck = result;
      
      if (healthStatus !== 'healthy') {
        logger.warn('Health check failed:', result);
      }
      
      return result;
      
    } catch (error) {
      logger.error('Health check error:', error);
      
      const result: HealthCheckResult = {
        status: 'unhealthy',
        timestamp: new Date(),
        checks: {
          botRunning: false,
          apiConnectivity: false,
          memoryUsage: 0,
          responseTime: Date.now() - startTime,
          errorRate: 100
        },
        details: `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      };
      
      this.lastHealthCheck = result;
      return result;
    }
  }
  
  private async checkApiConnectivity(): Promise<boolean> {
    try {
      // This would be implemented based on the actual API client
      // For now, we'll assume it's healthy if the bot is running
      return this.bot.getStatus().isRunning;
    } catch (error) {
      return false;
    }
  }
  
  getLastHealthCheck(): HealthCheckResult | null {
    return this.lastHealthCheck;
  }
  
  startPeriodicHealthChecks(intervalMs: number = 60000): void {
    setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);
    
    logger.info(`Started periodic health checks every ${intervalMs}ms`);
  }
}