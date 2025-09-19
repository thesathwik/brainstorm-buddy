import { logger } from '../config/logger';

export enum ErrorType {
  API_FAILURE = 'api_failure',
  RATE_LIMIT = 'rate_limit',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  operation: string;
  component: string;
  userId?: string;
  sessionId?: string;
  additionalData?: Record<string, any>;
}

export interface ErrorRecord {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  context: ErrorContext;
  timestamp: Date;
  stackTrace?: string;
  retryCount: number;
  resolved: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
}

export interface FallbackStrategy {
  type: 'cache' | 'template' | 'degraded' | 'offline';
  implementation: () => Promise<any>;
  description: string;
}

/**
 * Comprehensive error handling and resilience system
 */
export class ErrorHandler {
  private errorHistory: Map<string, ErrorRecord[]> = new Map();
  private retryConfig: RetryConfig;
  private fallbackStrategies: Map<string, FallbackStrategy[]> = new Map();

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableErrors: [
        ErrorType.API_FAILURE,
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT_ERROR,
        ErrorType.RATE_LIMIT
      ],
      ...retryConfig
    };
  }

  /**
   * Execute operation with retry logic and fallback strategies
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallbackKey?: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount <= this.retryConfig.maxRetries) {
      try {
        const result = await this.executeWithTimeout(operation, 30000); // 30 second timeout
        
        // If we had previous errors for this operation, mark them as resolved
        this.markErrorsResolved(context);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        const errorType = this.classifyError(error as Error);
        const severity = this.determineSeverity(errorType, retryCount);

        // Record the error
        const errorRecord = this.recordError(errorType, severity, lastError.message, context, retryCount);

        // Check if this error type is retryable
        if (!this.retryConfig.retryableErrors.includes(errorType) || retryCount >= this.retryConfig.maxRetries) {
          break;
        }

        // Calculate delay for exponential backoff
        const delay = this.calculateBackoffDelay(retryCount);
        
        logger.warn(`Operation failed, retrying in ${delay}ms`, {
          error: lastError.message,
          retryCount,
          context
        });

        await this.sleep(delay);
        retryCount++;
      }
    }

    // All retries exhausted, try fallback strategies
    if (fallbackKey && this.fallbackStrategies.has(fallbackKey)) {
      return await this.executeFallbackStrategies<T>(fallbackKey, context, lastError!);
    }

    // No fallback available, throw the last error
    throw this.enhanceError(lastError!, context, retryCount);
  }

  /**
   * Register a fallback strategy for a specific operation
   */
  registerFallbackStrategy(operationKey: string, strategy: FallbackStrategy): void {
    if (!this.fallbackStrategies.has(operationKey)) {
      this.fallbackStrategies.set(operationKey, []);
    }
    this.fallbackStrategies.get(operationKey)!.push(strategy);
  }

  /**
   * Get error statistics for monitoring and alerting
   */
  getErrorStatistics(timeWindow?: number): ErrorStatistics {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    const allErrors: ErrorRecord[] = [];
    for (const errors of this.errorHistory.values()) {
      allErrors.push(...errors.filter(e => e.timestamp.getTime() >= windowStart));
    }

    const errorsByType = new Map<ErrorType, number>();
    const errorsBySeverity = new Map<ErrorSeverity, number>();
    let totalErrors = 0;
    let resolvedErrors = 0;

    for (const error of allErrors) {
      totalErrors++;
      if (error.resolved) resolvedErrors++;

      errorsByType.set(error.type, (errorsByType.get(error.type) || 0) + 1);
      errorsBySeverity.set(error.severity, (errorsBySeverity.get(error.severity) || 0) + 1);
    }

    return {
      totalErrors,
      resolvedErrors,
      errorRate: totalErrors > 0 ? (totalErrors - resolvedErrors) / totalErrors : 0,
      errorsByType: Object.fromEntries(errorsByType),
      errorsBySeverity: Object.fromEntries(errorsBySeverity),
      timeWindow: timeWindow || 'all-time'
    };
  }

  /**
   * Check system health based on error patterns
   */
  getSystemHealth(): SystemHealthStatus {
    const stats = this.getErrorStatistics(300000); // Last 5 minutes
    
    let healthScore = 1.0;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const issues: string[] = [];

    // Check error rate
    if (stats.errorRate > 0.5) {
      healthScore -= 0.4;
      issues.push('High error rate detected');
      status = 'unhealthy';
    } else if (stats.errorRate > 0.2) {
      healthScore -= 0.2;
      issues.push('Elevated error rate');
      status = status === 'healthy' ? 'degraded' : status;
    }

    // Check for critical errors
    const criticalErrors = stats.errorsBySeverity[ErrorSeverity.CRITICAL] || 0;
    if (criticalErrors > 0) {
      healthScore -= 0.3;
      issues.push(`${criticalErrors} critical errors detected`);
      status = 'unhealthy';
    }

    // Check for API failures
    const apiFailures = stats.errorsByType[ErrorType.API_FAILURE] || 0;
    if (apiFailures > 5) {
      healthScore -= 0.2;
      issues.push('Multiple API failures detected');
      status = status === 'healthy' ? 'degraded' : status;
    }

    return {
      status,
      healthScore: Math.max(healthScore, 0),
      issues,
      lastChecked: new Date(),
      statistics: stats
    };
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT_ERROR;
    }
    
    if (message.includes('rate limit') || message.includes('quota exceeded')) {
      return ErrorType.RATE_LIMIT;
    }
    
    if (message.includes('network') || message.includes('connection') || 
        message.includes('econnrefused') || message.includes('enotfound')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    if (message.includes('unauthorized') || message.includes('authentication') || 
        message.includes('api key') || message.includes('forbidden')) {
      return ErrorType.AUTHENTICATION_ERROR;
    }
    
    if (message.includes('validation') || message.includes('invalid') || 
        message.includes('bad request')) {
      return ErrorType.VALIDATION_ERROR;
    }
    
    if (message.includes('api') || message.includes('server error') || 
        message.includes('internal error')) {
      return ErrorType.API_FAILURE;
    }
    
    return ErrorType.UNKNOWN_ERROR;
  }

  private determineSeverity(errorType: ErrorType, retryCount: number): ErrorSeverity {
    // Authentication and validation errors are always high severity
    if (errorType === ErrorType.AUTHENTICATION_ERROR || errorType === ErrorType.VALIDATION_ERROR) {
      return ErrorSeverity.HIGH;
    }
    
    // Rate limits start as medium but become high if persistent
    if (errorType === ErrorType.RATE_LIMIT) {
      return retryCount > 2 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
    }
    
    // Network and timeout errors escalate with retry count
    if (errorType === ErrorType.NETWORK_ERROR || errorType === ErrorType.TIMEOUT_ERROR) {
      if (retryCount > 2) return ErrorSeverity.HIGH;
      if (retryCount > 0) return ErrorSeverity.MEDIUM;
      return ErrorSeverity.LOW;
    }
    
    // API failures are medium by default, high if persistent
    if (errorType === ErrorType.API_FAILURE) {
      return retryCount > 1 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }

  private recordError(
    type: ErrorType,
    severity: ErrorSeverity,
    message: string,
    context: ErrorContext,
    retryCount: number
  ): ErrorRecord {
    const errorRecord: ErrorRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      context,
      timestamp: new Date(),
      retryCount,
      resolved: false
    };

    const key = `${context.component}-${context.operation}`;
    if (!this.errorHistory.has(key)) {
      this.errorHistory.set(key, []);
    }
    
    this.errorHistory.get(key)!.push(errorRecord);
    
    // Keep only last 100 errors per operation to prevent memory leaks
    const errors = this.errorHistory.get(key)!;
    if (errors.length > 100) {
      this.errorHistory.set(key, errors.slice(-100));
    }

    // Log the error
    logger.error('Error recorded', {
      errorId: errorRecord.id,
      type,
      severity,
      message,
      context,
      retryCount
    });

    return errorRecord;
  }

  private markErrorsResolved(context: ErrorContext): void {
    const key = `${context.component}-${context.operation}`;
    const errors = this.errorHistory.get(key);
    
    if (errors) {
      errors.forEach(error => {
        if (!error.resolved) {
          error.resolved = true;
        }
      });
    }
  }

  private calculateBackoffDelay(retryCount: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private async executeFallbackStrategies<T>(
    fallbackKey: string,
    context: ErrorContext,
    originalError: Error
  ): Promise<T> {
    const strategies = this.fallbackStrategies.get(fallbackKey) || [];
    
    for (const strategy of strategies) {
      try {
        logger.info(`Attempting fallback strategy: ${strategy.description}`, { context });
        const result = await strategy.implementation();
        
        logger.info(`Fallback strategy succeeded: ${strategy.description}`, { context });
        return result;
      } catch (fallbackError) {
        logger.warn(`Fallback strategy failed: ${strategy.description}`, {
          error: (fallbackError as Error).message,
          context
        });
      }
    }
    
    // All fallback strategies failed
    throw this.enhanceError(originalError, context, this.retryConfig.maxRetries, 'All fallback strategies failed');
  }

  private enhanceError(
    originalError: Error,
    context: ErrorContext,
    retryCount: number,
    additionalInfo?: string
  ): Error {
    const enhancedMessage = [
      `Operation failed after ${retryCount} retries`,
      `Component: ${context.component}`,
      `Operation: ${context.operation}`,
      `Original error: ${originalError.message}`,
      additionalInfo
    ].filter(Boolean).join('. ');

    const enhancedError = new Error(enhancedMessage);
    enhancedError.name = 'ResilientOperationError';
    enhancedError.stack = originalError.stack;
    
    return enhancedError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export interface ErrorStatistics {
  totalErrors: number;
  resolvedErrors: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  timeWindow: string | number;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthScore: number; // 0-1 scale
  issues: string[];
  lastChecked: Date;
  statistics: ErrorStatistics;
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();