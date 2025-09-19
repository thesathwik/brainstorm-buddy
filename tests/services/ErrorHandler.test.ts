import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  ErrorHandler, 
  ErrorType, 
  ErrorSeverity, 
  ErrorContext,
  RetryConfig,
  FallbackStrategy 
} from '../../src/services/ErrorHandler';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockOperation: vi.MockedFunction<() => Promise<string>>;

  beforeEach(() => {
    // Use fast retry configuration for tests
    errorHandler = new ErrorHandler({
      maxRetries: 2,
      baseDelay: 10,
      maxDelay: 100,
      backoffMultiplier: 2
    });
    mockOperation = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWithResilience', () => {
    it('should execute operation successfully on first try', async () => {
      const expectedResult = 'success';
      mockOperation.mockResolvedValue(expectedResult);

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(mockOperation, context);

      expect(result).toBe(expectedResult);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const expectedResult = 'success';
      mockOperation
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('API failure'))
        .mockResolvedValue(expectedResult);

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(mockOperation, context);

      expect(result).toBe(expectedResult);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      mockOperation.mockRejectedValue(new Error('Validation error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow('Validation error');

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should respect maximum retry limit', async () => {
      const customConfig: Partial<RetryConfig> = {
        maxRetries: 2
      };
      errorHandler = new ErrorHandler(customConfig);

      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff for retries', async () => {
      const customConfig: Partial<RetryConfig> = {
        baseDelay: 20,
        backoffMultiplier: 2,
        maxRetries: 2
      };
      errorHandler = new ErrorHandler(customConfig);

      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const startTime = Date.now();
      
      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should have waited at least 20ms + 40ms = 60ms for backoff
      expect(totalTime).toBeGreaterThan(50);
    });

    it('should execute fallback strategies when all retries fail', async () => {
      const fallbackResult = 'fallback_success';
      const fallbackStrategy: FallbackStrategy = {
        type: 'template',
        description: 'Test fallback',
        implementation: vi.fn().mockResolvedValue(fallbackResult)
      };

      errorHandler.registerFallbackStrategy('test_operation', fallbackStrategy);
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(
        mockOperation, 
        context, 
        'test_operation'
      );

      expect(result).toBe(fallbackResult);
      expect(fallbackStrategy.implementation).toHaveBeenCalled();
    });

    it('should handle timeout errors', async () => {
      // Mock a timeout by creating a promise that never resolves
      mockOperation.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      // Use a very short timeout for testing
      const originalExecuteWithTimeout = errorHandler['executeWithTimeout'];
      errorHandler['executeWithTimeout'] = async (operation, timeoutMs) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Operation timed out after 100ms'));
          }, 100);

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
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow('timed out');
    }, 10000);
  });

  describe('error classification', () => {
    it('should classify network errors correctly', async () => {
      mockOperation.mockRejectedValue(new Error('ECONNREFUSED'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStatistics();
      expect(stats.errorsByType[ErrorType.NETWORK_ERROR]).toBe(4); // 1 + 3 retries
    });

    it('should classify API failures correctly', async () => {
      mockOperation.mockRejectedValue(new Error('API server error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStatistics();
      expect(stats.errorsByType[ErrorType.API_FAILURE]).toBe(4); // 1 + 3 retries
    });

    it('should classify rate limit errors correctly', async () => {
      mockOperation.mockRejectedValue(new Error('Rate limit exceeded'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStatistics();
      expect(stats.errorsByType[ErrorType.RATE_LIMIT]).toBe(4); // 1 + 3 retries
    });

    it('should classify authentication errors correctly', async () => {
      mockOperation.mockRejectedValue(new Error('Unauthorized access'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStatistics();
      expect(stats.errorsByType[ErrorType.AUTHENTICATION_ERROR]).toBe(1); // No retries for auth errors
    });
  });

  describe('error statistics', () => {
    it('should track error statistics correctly', async () => {
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      const stats = errorHandler.getErrorStatistics();
      
      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.errorsByType[ErrorType.NETWORK_ERROR]).toBeGreaterThan(0);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBeGreaterThan(0);
    });

    it('should calculate error rate correctly', async () => {
      // Create a fresh error handler to avoid interference from other tests
      const freshErrorHandler = new ErrorHandler({
        maxRetries: 1,
        baseDelay: 10
      });
      
      // First operation fails completely
      const failingOperation = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const context1: ErrorContext = {
        operation: 'test1',
        component: 'TestComponent'
      };

      await expect(
        freshErrorHandler.executeWithResilience(failingOperation, context1)
      ).rejects.toThrow();

      // Second operation succeeds
      const successOperation = vi.fn().mockResolvedValue('success');
      
      const context2: ErrorContext = {
        operation: 'test2',
        component: 'TestComponent'
      };

      await freshErrorHandler.executeWithResilience(successOperation, context2);

      const stats = freshErrorHandler.getErrorStatistics();
      expect(stats.errorRate).toBeLessThan(1.0);
      expect(stats.resolvedErrors).toBe(0); // The failed operation was never resolved
    });

    it('should support time window filtering', async () => {
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      // Get stats for last 1 second
      const recentStats = errorHandler.getErrorStatistics(1000);
      const allStats = errorHandler.getErrorStatistics();

      expect(recentStats.totalErrors).toBeLessThanOrEqual(allStats.totalErrors);
    });
  });

  describe('system health', () => {
    it('should report healthy status with no errors', () => {
      const health = errorHandler.getSystemHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.healthScore).toBe(1.0);
      expect(health.issues).toHaveLength(0);
    });

    it('should report degraded status with moderate errors', async () => {
      // Generate some errors
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      // Generate multiple errors to trigger degraded status
      for (let i = 0; i < 3; i++) {
        await expect(
          errorHandler.executeWithResilience(mockOperation, context)
        ).rejects.toThrow();
      }

      const health = errorHandler.getSystemHealth();
      
      expect(health.status).not.toBe('healthy');
      expect(health.healthScore).toBeLessThan(1.0);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('should include relevant issues in health report', async () => {
      // Generate API failures
      mockOperation.mockRejectedValue(new Error('API server error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      // Generate multiple API failures
      for (let i = 0; i < 6; i++) {
        await expect(
          errorHandler.executeWithResilience(mockOperation, context)
        ).rejects.toThrow();
      }

      const health = errorHandler.getSystemHealth();
      
      expect(health.issues.some(issue => 
        issue.includes('API failures')
      )).toBe(true);
    });
  });

  describe('fallback strategies', () => {
    it('should register and execute fallback strategies', async () => {
      const fallbackResult = 'fallback_result';
      const fallbackStrategy: FallbackStrategy = {
        type: 'cache',
        description: 'Test cache fallback',
        implementation: vi.fn().mockResolvedValue(fallbackResult)
      };

      errorHandler.registerFallbackStrategy('test_op', fallbackStrategy);
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(
        mockOperation, 
        context, 
        'test_op'
      );

      expect(result).toBe(fallbackResult);
      expect(fallbackStrategy.implementation).toHaveBeenCalled();
    });

    it('should try multiple fallback strategies in order', async () => {
      const strategy1: FallbackStrategy = {
        type: 'cache',
        description: 'First fallback',
        implementation: vi.fn().mockRejectedValue(new Error('Cache miss'))
      };

      const strategy2: FallbackStrategy = {
        type: 'template',
        description: 'Second fallback',
        implementation: vi.fn().mockResolvedValue('template_result')
      };

      errorHandler.registerFallbackStrategy('test_op', strategy1);
      errorHandler.registerFallbackStrategy('test_op', strategy2);
      
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(
        mockOperation, 
        context, 
        'test_op'
      );

      expect(result).toBe('template_result');
      expect(strategy1.implementation).toHaveBeenCalled();
      expect(strategy2.implementation).toHaveBeenCalled();
    });

    it('should throw enhanced error when all fallbacks fail', async () => {
      const strategy: FallbackStrategy = {
        type: 'cache',
        description: 'Failing fallback',
        implementation: vi.fn().mockRejectedValue(new Error('Fallback failed'))
      };

      errorHandler.registerFallbackStrategy('test_op', strategy);
      mockOperation.mockRejectedValue(new Error('Original error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context, 'test_op')
      ).rejects.toThrow('All fallback strategies failed');
    });
  });

  describe('error resolution tracking', () => {
    it('should mark errors as resolved when operation succeeds', async () => {
      // First call fails
      mockOperation
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      const result = await errorHandler.executeWithResilience(mockOperation, context);

      expect(result).toBe('success');
      
      const stats = errorHandler.getErrorStatistics();
      expect(stats.resolvedErrors).toBeGreaterThan(0);
    });
  });

  describe('custom retry configuration', () => {
    it('should use custom retry configuration', async () => {
      const customConfig: Partial<RetryConfig> = {
        maxRetries: 1,
        baseDelay: 50,
        retryableErrors: [ErrorType.NETWORK_ERROR]
      };

      errorHandler = new ErrorHandler(customConfig);
      mockOperation.mockRejectedValue(new Error('Network error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should respect custom retryable error types', async () => {
      const customConfig: Partial<RetryConfig> = {
        retryableErrors: [ErrorType.NETWORK_ERROR] // Only network errors are retryable
      };

      errorHandler = new ErrorHandler(customConfig);
      mockOperation.mockRejectedValue(new Error('API server error'));

      const context: ErrorContext = {
        operation: 'test',
        component: 'TestComponent'
      };

      await expect(
        errorHandler.executeWithResilience(mockOperation, context)
      ).rejects.toThrow();

      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries for API errors
    });
  });
});