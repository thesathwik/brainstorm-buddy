import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientGeminiApiClient } from '../../src/api/ResilientGeminiApiClient';
import { DefaultGeminiApiClient } from '../../src/api/GeminiApiClient';
import { DefaultResponseGenerator } from '../../src/services/ResponseGenerator';
import { GracefulDegradationService, DegradationLevel } from '../../src/services/GracefulDegradationService';
import { ErrorHandler, globalErrorHandler } from '../../src/services/ErrorHandler';
import { InterventionType } from '../../src/models/Enums';
import { createTestContext, createTestMessage } from '../testUtils';

describe('Error Handling Integration', () => {
  let mockGeminiClient: vi.Mocked<DefaultGeminiApiClient>;
  let resilientClient: ResilientGeminiApiClient;
  let responseGenerator: DefaultResponseGenerator;
  let degradationService: GracefulDegradationService;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    // Mock the base Gemini client
    mockGeminiClient = {
      analyzeText: vi.fn(),
      generateResponse: vi.fn(),
      isHealthy: vi.fn()
    } as any;

    // Create error handler and resilient client
    errorHandler = new ErrorHandler({
      maxRetries: 2,
      baseDelay: 10, // Short delay for tests
      backoffMultiplier: 2
    });

    resilientClient = new ResilientGeminiApiClient(
      mockGeminiClient,
      errorHandler,
      { cacheEnabled: true, cacheTtlMs: 1000 }
    );

    responseGenerator = new DefaultResponseGenerator(mockGeminiClient);
    degradationService = new GracefulDegradationService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('API failure scenarios', () => {
    it('should handle network failures with retry and fallback', async () => {
      // Simulate network failures followed by success
      mockGeminiClient.generateResponse
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValue({
          content: 'Success after retries',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 20 }
        });

      const result = await resilientClient.generateResponse('test prompt');

      expect(result.content).toBe('Success after retries');
      expect(mockGeminiClient.generateResponse).toHaveBeenCalledTimes(3);
    });

    it('should use cached responses when API is completely unavailable', async () => {
      // First, make a successful call to populate cache
      mockGeminiClient.generateResponse.mockResolvedValueOnce({
        content: 'Cached response',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      await resilientClient.generateResponse('test prompt');

      // Now simulate complete API failure
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('API completely down'));

      // Should return cached response
      const result = await resilientClient.generateResponse('test prompt');
      expect(result.content).toBe('Cached response');
    });

    it('should degrade gracefully when both API and cache fail', async () => {
      // Simulate complete API failure with no cache
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('API failure'));

      const context = createTestContext([
        createTestMessage('1', 'user1', 'Test message')
      ]);

      const result = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        context
      );

      // Should get a fallback response
      expect(result.content).toBeDefined();
      expect(result.confidence).toBeLessThan(0.8);
      expect(result.sources).toBeDefined();
    });
  });

  describe('rate limiting scenarios', () => {
    it('should handle rate limiting with exponential backoff', async () => {
      // Simulate rate limiting followed by success
      mockGeminiClient.generateResponse
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Quota exceeded'))
        .mockResolvedValue({
          content: 'Success after rate limit',
          confidence: 0.8,
          usage: { inputTokens: 10, outputTokens: 20 }
        });

      const startTime = Date.now();
      const result = await resilientClient.generateResponse('test prompt');
      const endTime = Date.now();

      expect(result.content).toBe('Success after rate limit');
      expect(endTime - startTime).toBeGreaterThan(30); // Should have waited for backoff
    });
  });

  describe('authentication failures', () => {
    it('should not retry authentication errors', async () => {
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('Unauthorized access'));

      await expect(
        resilientClient.generateResponse('test prompt')
      ).rejects.toThrow('Unauthorized');

      expect(mockGeminiClient.generateResponse).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('graceful degradation integration', () => {
    it('should detect and handle conflicting information', async () => {
      const context = createTestContext([
        createTestMessage('1', 'user1', 'The company valuation is $10M'),
        createTestMessage('2', 'user2', 'Actually, I heard it was $50M')
      ]);

      const conflictingData = [
        { valuation: 10000000, source: 'user1' },
        { valuation: 50000000, source: 'user2' }
      ];

      const result = await responseGenerator.generateResponse(
        InterventionType.FACT_CHECK,
        context,
        { knowledgeItems: conflictingData }
      );

      expect(result.content).toContain('conflicting');
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('should adapt behavior based on degradation level', async () => {
      degradationService.setDegradationLevel(DegradationLevel.MODERATE);

      // Should not have proactive intervention capability
      expect(degradationService.isCapabilityAvailable('proactive_interventions')).toBe(false);
      expect(degradationService.isCapabilityAvailable('basic_analysis')).toBe(true);
    });

    it('should provide appropriate responses in offline mode', async () => {
      degradationService.setDegradationLevel(DegradationLevel.OFFLINE);
      resilientClient.enableOfflineMode();

      const context = createTestContext([
        createTestMessage('1', 'user1', 'Need help with analysis')
      ]);

      // Should still be able to provide some response
      const result = await responseGenerator.generateResponse(
        InterventionType.INFORMATION_PROVIDE,
        context
      );

      expect(result.content).toBeDefined();
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('system health monitoring', () => {
    it('should track error patterns and system health', async () => {
      // Generate multiple errors
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('API failure'));

      for (let i = 0; i < 5; i++) {
        try {
          await resilientClient.generateResponse(`test prompt ${i}`);
        } catch (error) {
          // Expected to fail
        }
      }

      const health = errorHandler.getSystemHealth();
      expect(health.status).not.toBe('healthy');
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.statistics.totalErrors).toBeGreaterThan(0);
    });

    it('should recover health status when errors resolve', async () => {
      // First, generate errors
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('API failure'));

      try {
        await resilientClient.generateResponse('failing prompt');
      } catch (error) {
        // Expected to fail
      }

      // Then simulate recovery
      mockGeminiClient.generateResponse.mockResolvedValue({
        content: 'Recovery successful',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      await resilientClient.generateResponse('recovery prompt');

      const stats = errorHandler.getErrorStatistics();
      expect(stats.resolvedErrors).toBeGreaterThan(0);
    });
  });

  describe('cache behavior under stress', () => {
    it('should maintain cache performance during API failures', async () => {
      // Populate cache with successful response
      mockGeminiClient.generateResponse.mockResolvedValueOnce({
        content: 'Cached content',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      await resilientClient.generateResponse('cacheable prompt');

      // Simulate API failure
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('API down'));

      // Multiple requests should use cache without hitting API
      const results = await Promise.all([
        resilientClient.generateResponse('cacheable prompt'),
        resilientClient.generateResponse('cacheable prompt'),
        resilientClient.generateResponse('cacheable prompt')
      ]);

      results.forEach(result => {
        expect(result.content).toBe('Cached content');
      });

      // Should only have made the initial successful call
      expect(mockGeminiClient.generateResponse).toHaveBeenCalledTimes(1);
    });

    it('should clean up expired cache entries', async () => {
      // Create client with very short cache TTL
      const shortTtlClient = new ResilientGeminiApiClient(
        mockGeminiClient,
        errorHandler,
        { cacheEnabled: true, cacheTtlMs: 50 }
      );

      mockGeminiClient.generateResponse.mockResolvedValue({
        content: 'Short-lived cache',
        confidence: 0.8,
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      // Make initial request
      await shortTtlClient.generateResponse('test prompt');

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Make another request - should hit API again
      await shortTtlClient.generateResponse('test prompt');

      expect(mockGeminiClient.generateResponse).toHaveBeenCalledTimes(2);
    });
  });

  describe('fallback strategy execution', () => {
    it('should execute multiple fallback strategies in sequence', async () => {
      // Register custom fallback that fails
      const failingFallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));
      const successfulFallback = vi.fn().mockResolvedValue({
        content: 'Fallback success',
        confidence: 0.5,
        usage: { inputTokens: 0, outputTokens: 15 }
      });

      errorHandler.registerFallbackStrategy('test_operation', {
        type: 'cache',
        description: 'Failing fallback',
        implementation: failingFallback
      });

      errorHandler.registerFallbackStrategy('test_operation', {
        type: 'template',
        description: 'Successful fallback',
        implementation: successfulFallback
      });

      // Simulate primary operation failure
      const failingOperation = vi.fn().mockRejectedValue(new Error('Primary failure'));

      const result = await errorHandler.executeWithResilience(
        failingOperation,
        { operation: 'test', component: 'TestComponent' },
        'test_operation'
      );

      expect(result.content).toBe('Fallback success');
      expect(failingFallback).toHaveBeenCalled();
      expect(successfulFallback).toHaveBeenCalled();
    });
  });

  describe('concurrent error handling', () => {
    it('should handle multiple concurrent failures gracefully', async () => {
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('Concurrent failure'));

      const promises = Array.from({ length: 10 }, (_, i) =>
        resilientClient.generateResponse(`concurrent prompt ${i}`)
          .catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(promises);

      // All should have failed gracefully
      results.forEach(result => {
        expect(result).toHaveProperty('error');
      });

      // Error handler should have tracked all failures
      const stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBeGreaterThan(10); // Including retries
    });
  });

  describe('memory management', () => {
    it('should limit error history to prevent memory leaks', async () => {
      mockGeminiClient.generateResponse.mockRejectedValue(new Error('Memory test error'));

      // Generate many errors
      for (let i = 0; i < 150; i++) {
        try {
          await resilientClient.generateResponse(`memory test ${i}`);
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = errorHandler.getErrorStatistics();
      // Should have limited the stored errors to prevent memory issues
      expect(stats.totalErrors).toBeLessThan(1000); // Reasonable upper bound
    });

    it('should clean up cache periodically', () => {
      const stats = resilientClient.getCacheStatistics();
      expect(stats.totalEntries).toBeDefined();
      expect(stats.totalSizeBytes).toBeDefined();

      // Clear cache to test cleanup
      resilientClient.clearCache();
      
      const clearedStats = resilientClient.getCacheStatistics();
      expect(clearedStats.totalEntries).toBe(0);
    });
  });
});