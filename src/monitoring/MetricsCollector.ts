import { ProactiveBrainstormBot, BotMetrics } from '../index';
import { logger } from '../config';
import { InterventionType } from '../models';

export interface MetricsSnapshot {
  timestamp: Date;
  metrics: BotMetrics;
  systemMetrics: {
    cpuUsage: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    uptime: number;
  };
}

export interface PerformanceAlert {
  type: 'high_error_rate' | 'slow_response' | 'high_memory' | 'high_cpu';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
  value: number;
  threshold: number;
}

export class MetricsCollector {
  private bot: ProactiveBrainstormBot;
  private metricsHistory: MetricsSnapshot[] = [];
  private alertThresholds = {
    errorRate: 5, // percentage
    responseTime: 2000, // milliseconds
    memoryUsage: 80, // percentage
    cpuUsage: 80 // percentage
  };
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];

  constructor(bot: ProactiveBrainstormBot) {
    this.bot = bot;
  }

  collectMetrics(): MetricsSnapshot {
    const botMetrics = this.bot.getMetrics();
    const memoryUsage = process.memoryUsage();
    
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      metrics: botMetrics,
      systemMetrics: {
        cpuUsage: this.getCpuUsage(),
        memoryUsage: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
        },
        uptime: process.uptime() * 1000
      }
    };

    // Store in history (keep last 1000 snapshots)
    this.metricsHistory.push(snapshot);
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory.shift();
    }

    // Check for alerts
    this.checkAlerts(snapshot);

    return snapshot;
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, you might want to use a more sophisticated method
    const usage = process.cpuUsage();
    return (usage.user + usage.system) / 1000000; // Convert to milliseconds
  }

  private checkAlerts(snapshot: MetricsSnapshot): void {
    const { metrics, systemMetrics } = snapshot;

    // Check error rate
    if (metrics.messagesProcessed > 0) {
      const errorRate = (metrics.errorCount / metrics.messagesProcessed) * 100;
      if (errorRate > this.alertThresholds.errorRate) {
        this.triggerAlert({
          type: 'high_error_rate',
          severity: errorRate > this.alertThresholds.errorRate * 2 ? 'critical' : 'warning',
          message: `High error rate detected: ${errorRate.toFixed(2)}%`,
          timestamp: new Date(),
          value: errorRate,
          threshold: this.alertThresholds.errorRate
        });
      }
    }

    // Check response time
    if (metrics.averageResponseTime > this.alertThresholds.responseTime) {
      this.triggerAlert({
        type: 'slow_response',
        severity: metrics.averageResponseTime > this.alertThresholds.responseTime * 2 ? 'critical' : 'warning',
        message: `Slow response time detected: ${metrics.averageResponseTime.toFixed(0)}ms`,
        timestamp: new Date(),
        value: metrics.averageResponseTime,
        threshold: this.alertThresholds.responseTime
      });
    }

    // Check memory usage
    if (systemMetrics.memoryUsage.percentage > this.alertThresholds.memoryUsage) {
      this.triggerAlert({
        type: 'high_memory',
        severity: systemMetrics.memoryUsage.percentage > this.alertThresholds.memoryUsage * 1.2 ? 'critical' : 'warning',
        message: `High memory usage detected: ${systemMetrics.memoryUsage.percentage.toFixed(1)}%`,
        timestamp: new Date(),
        value: systemMetrics.memoryUsage.percentage,
        threshold: this.alertThresholds.memoryUsage
      });
    }
  }

  private triggerAlert(alert: PerformanceAlert): void {
    logger.warn('Performance alert:', alert);
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback:', error);
      }
    });
  }

  onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  getMetricsHistory(limit?: number): MetricsSnapshot[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  getAggregatedMetrics(timeRangeMs: number): {
    averageResponseTime: number;
    totalMessages: number;
    totalInterventions: number;
    interventionsByType: Record<InterventionType, number>;
    errorRate: number;
    averageMemoryUsage: number;
  } {
    const cutoffTime = Date.now() - timeRangeMs;
    const relevantSnapshots = this.metricsHistory.filter(
      snapshot => snapshot.timestamp.getTime() > cutoffTime
    );

    if (relevantSnapshots.length === 0) {
      return {
        averageResponseTime: 0,
        totalMessages: 0,
        totalInterventions: 0,
        interventionsByType: {
          [InterventionType.TOPIC_REDIRECT]: 0,
          [InterventionType.INFORMATION_PROVIDE]: 0,
          [InterventionType.FACT_CHECK]: 0,
          [InterventionType.CLARIFICATION_REQUEST]: 0,
          [InterventionType.SUMMARY_OFFER]: 0
        },
        errorRate: 0,
        averageMemoryUsage: 0
      };
    }

    const latest = relevantSnapshots[relevantSnapshots.length - 1];
    const earliest = relevantSnapshots[0];

    const totalMessages = latest.metrics.messagesProcessed - earliest.metrics.messagesProcessed;
    const totalInterventions = latest.metrics.interventionsMade - earliest.metrics.interventionsMade;
    const totalErrors = latest.metrics.errorCount - earliest.metrics.errorCount;

    const interventionsByType: Record<InterventionType, number> = {
      [InterventionType.TOPIC_REDIRECT]: 
        latest.metrics.interventionsByType[InterventionType.TOPIC_REDIRECT] - 
        earliest.metrics.interventionsByType[InterventionType.TOPIC_REDIRECT],
      [InterventionType.INFORMATION_PROVIDE]: 
        latest.metrics.interventionsByType[InterventionType.INFORMATION_PROVIDE] - 
        earliest.metrics.interventionsByType[InterventionType.INFORMATION_PROVIDE],
      [InterventionType.FACT_CHECK]: 
        latest.metrics.interventionsByType[InterventionType.FACT_CHECK] - 
        earliest.metrics.interventionsByType[InterventionType.FACT_CHECK],
      [InterventionType.CLARIFICATION_REQUEST]: 
        latest.metrics.interventionsByType[InterventionType.CLARIFICATION_REQUEST] - 
        earliest.metrics.interventionsByType[InterventionType.CLARIFICATION_REQUEST],
      [InterventionType.SUMMARY_OFFER]: 
        latest.metrics.interventionsByType[InterventionType.SUMMARY_OFFER] - 
        earliest.metrics.interventionsByType[InterventionType.SUMMARY_OFFER]
    };

    const averageMemoryUsage = relevantSnapshots.reduce(
      (sum, snapshot) => sum + snapshot.systemMetrics.memoryUsage.percentage, 0
    ) / relevantSnapshots.length;

    return {
      averageResponseTime: latest.metrics.averageResponseTime,
      totalMessages,
      totalInterventions,
      interventionsByType,
      errorRate: totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0,
      averageMemoryUsage
    };
  }

  startPeriodicCollection(intervalMs: number = 30000): void {
    setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
    
    logger.info(`Started periodic metrics collection every ${intervalMs}ms`);
  }

  updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    Object.assign(this.alertThresholds, thresholds);
    logger.info('Updated alert thresholds:', this.alertThresholds);
  }
}