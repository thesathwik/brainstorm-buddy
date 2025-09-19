import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientGeminiApiClient, ResilientApiConfig } from '../../src/api/ResilientGeminiApiClient';
import { GeminiApiClient, GeminiApiResponse } from '../../src/api/GeminiApiClient';
import { ErrorHandler } from '../../src/services/ErrorHandler';

describe('ResilientGeminiApiClient', () => {
  let resilientClient: ResilientGeminiApiClient;
  let mockBaseClient: vi.Mocked<GeminiApiClient>;
  let mockErrorHandler: vi.Mocked<ErrorHandler>;

  const mockResponse: GeminiApiResponse = {
    content: 'Test response',
    confidence: 0.8,
    usage: {
      inputTokens: 10,
      outputTokens: 20
    }
  };

  beforeEach(() => {
    mockBaseClient = {
      analyzeText: vi.fn(),
      generateResponse: vi.fn(),
      isHealthy: vi.fn()
    };

    mockErrorHandler = {
      executeWithResilience: vi.fn(),
      registerFallbackStrategy: vi.fn(),
      getErrorStatistics: vi.fn(),
      getSystemHealth: vi.fn()
    } as any;

    resilientClient = new ResilientGeminiApiClient(
      mockBaseClient,
      mockErrorHandler,
      { cacheEnabled: true, cacheTtlMs: 300000 }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeText', () => {
    it('should execute analyzeText with resilience', async () => {
      mockErrorHandler.executeWithResilience.mockResolvedValue(mockResponse);

      const result = await resilientClient.analyzeText('test text', 'test prompt');

      expect(result).toEqual(mockResponse);
      expect(mockErrorHandler.executeWithResilience).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          operation: 'analyzeText',
          component: 'ResilientGeminiApiClient'
        }),
        'analyzeText'
      );
    });

    it('should cache successful responses', async () => {
      mockErrorHandler.executeWithResilience.mockImplementation(async (operation) => {
        return await operation();
      });
      mockBaseClient.analyzeText.mockResolvedValue(mockResponse);

      // First call
      const result1 = await resilientClient.analyzeText('test text', 'test prompt');
      expect(result1).toEqual(mockResponse);
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(1);

      // Second call with same parameters should use cache
      const result2 = await resilientClient.analyzeText('test text', 'test prompt');
      expect(result2).toEqual(mockResponse);
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should not cache when caching is disabled', async () => {
      resilientClient = new ResilientGeminiApiClient(
        mockBaseClient,
        mockErrorHandler,
        { cacheEnabled: false }
      );

      mockErrorHandler.executeWithResilience.mockImplementation(async (operation) => {
        return await operation();
      });
      mockBaseClient.analyzeText.mockResolvedValue(mockResponse);

      // First call
      await resilientClient.analyzeText('test text', 'test prompt');
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(1);

      // Second call should not use cache
      await resilientClient.analyzeText('test text', 'test prompt');
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateResponse', () => {
    it('should execute generateResponse with resilience', async () => {
      mockErrorHandler.executeWithResilience.mockResolvedValue(mockResponse);

      const result = await resilientClient.generateResponse('test prompt', 'test context');

      expect(result).toEqual(mockResponse);
      expect(mockErrorHandler.executeWithResilience).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          operation: 'generateResponse',
          component: 'ResilientGeminiApiClient'
        }),
        'generateResponse'
      );
    });

    it('should handle context parameter correctly', async () => {
      mockErrorHandler.executeWithResilience.mockImplementation(async (operation) => {
        return await operation();
      });
      mockBaseClient.generateResponse.mockResolvedValue(mockResponse);

      await resilientClient.generateResponse('test prompt', 'test context');

      expect(mockBaseClient.generateResponse).toHaveBeenCalledWith('test prompt', 'test context');
    });

    it('should handle missing context parameter', async () => {
      mockErrorHandler.executeWithResilience.mockImplementation(async (operation) => {
        return await operation();
      });
      mockBaseClient.generateResponse.mockResolvedValue(mockResponse);

      await resilientClient.generateResponse('test prompt');

      expect(mockBaseClient.generateResponse).toHaveBeenCalledWith('test prompt', undefined);
    });
  });

  describe('isHealthy', () => {
    it('should execute health check with resilience', async () => {
      mockErrorHandler.executeWithResilience.mockResolvedValue(true);

      const result = await resilientClient.isHealthy();

      expect(result).toBe(true);
      expect(mockErrorHandler.executeWithResilience).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          operation: 'isHealthy',
          component: 'ResilientGeminiApiClient'
        })
      );
    });

    it('should return false and set offline mode when health check fails', async () => {
      mockErrorHandler.executeWithResilience.mockRejectedValue(new Error('Health check failed'));

      const result = await resilientClient.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('offline mode', () => {
    it('should enable offline mode', () => {
      resilientClient.enableOfflineMode();
      // Test would need to verify offline behavior in actual implementation
    });

    it('should disable offline mode', () => {
      resilientClient.enableOfflineMode();
      resilientClient.disableOfflineMode();
      // Test would need to verify online behavior in actual implementation
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      resilientClient.clearCache();
      // Verify cache is cleared - would need cache inspection methods
    });

    it('should provide cache statistics', () => {
      const stats = resilientClient.getCacheStatistics();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('validEntries');
      expect(stats).toHaveProperty('expiredEntries');
      expect(stats).toHaveProperty('totalSizeBytes');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should expire cached entries after TTL', async () => {
      const shortTtlConfig: Partial<ResilientApiConfig> = {
        cacheEnabled: true,
        cacheTtlMs: 100 // 100ms TTL
      };

      resilientClient = new ResilientGeminiApiClient(
        mockBaseClient,
        mockErrorHandler,
        shortTtlConfig
      );

      mockErrorHandler.executeWithResilience.mockImplementation(async (operation) => {
        return await operation();
      });
      mockBaseClient.analyzeText.mockResolvedValue(mockResponse);

      // First call
      await resilientClient.analyzeText('test text', 'test prompt');
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call should not use expired cache
      await resilientClient.analyzeText('test text', 'test prompt');
      expect(mockBaseClient.analyzeText).toHaveBeenCalledTimes(2);
    });
  });

  describe('fallback strategies', () => {
    it('should register fallback strategies during construction', () => {
      expect(mockErrorHandler.registerFallbackStrategy).toHaveBeenCalledWith(
        'analyzeText',
        expect.objectContaining({
          type: 'cache',
          description: expect.stringContaining('cached response')
        })
      );

      expect(mockErrorHandler.registerFallbackStrategy).toHaveBeenCalledWith(
        'analyzeText',
        expect.objectContaining({
          type: 'degraded',
          description: expect.stringContaining('Basic text analysis')
        })
      );

      expect(mockErrorHandler.registerFallbackStrategy).toHaveBeenCalledWith(
        'generateResponse',
        expect.objectContaining({
          type: 'template',
          description: expect.stringContaining('predefined response templates')
        })
      );
    });
  });

  describe('error handling integration', () => {
    it('should pass correct error context to error handler', async () => {
      mockErrorHandler.executeWithResilience.mockResolvedValue(mockResponse);

      await resilientClient.analyzeText('test text', 'test prompt');

      expect(mockErrorHandler.executeWithResilience).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          operation: 'analyzeText',
          component: 'ResilientGeminiApiClient',
          additionalData: expect.objectContaining({
            textLength: 9,
            promptLength: 11
          })
        }),
        'analyzeText'
      );
    });

    it('should include context information in generateResponse calls', async () => {
      mockErrorHandler.executeWithResilience.mockResolvedValue(mockResponse);

      await resilientClient.generateResponse('test prompt', 'test context');

      expect(mockErrorHandler.executeWithResilience).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          operation: 'generateResponse',
          component: 'ResilientGeminiApiClient',
          additionalData: expect.objectContaining({
            promptLength: 11,
            hasContext: true
          })
        }),
        'generateResponse'
      );
    });
  });

  describe('configuration options', () => {
    it('should use default configuration when none provided', () => {
      // Create a mock base client to avoid API key requirement
      const mockClient = {
        analyzeText: vi.fn(),
        generateResponse: vi.fn(),
        isHealthy: vi.fn()
      } as any;
      
      const defaultClient = new ResilientGeminiApiClient(mockClient);
      const stats = defaultClient.getCacheStatistics();
      
      expect(stats).toBeDefined();
    });

    it('should respect custom configuration', () => {
      const customConfig: Partial<ResilientApiConfig> = {
        cacheEnabled: false,
        cacheTtlMs: 600000,
        fallbackEnabled: false,
        offlineMode: true
      };

      const customClient = new ResilientGeminiApiClient(
        mockBaseClient,
        mockErrorHandler,
        customConfig
      );

      expect(customClient).toBeDefined();
    });
  });
});