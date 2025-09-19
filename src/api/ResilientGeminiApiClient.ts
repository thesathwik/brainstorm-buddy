import { GeminiApiClient, GeminiApiResponse, DefaultGeminiApiClient } from './GeminiApiClient';
import { ErrorHandler, ErrorContext, FallbackStrategy } from '../services/ErrorHandler';
import { logger } from '../config/logger';

export interface CachedResponse {
  response: GeminiApiResponse;
  timestamp: Date;
  expirationTime: Date;
}

export interface ResilientApiConfig {
  cacheEnabled: boolean;
  cacheTtlMs: number;
  fallbackEnabled: boolean;
  offlineMode: boolean;
}

/**
 * Resilient wrapper around GeminiApiClient with error handling, caching, and fallback strategies
 */
export class ResilientGeminiApiClient implements GeminiApiClient {
  private baseClient: GeminiApiClient;
  private errorHandler: ErrorHandler;
  private responseCache: Map<string, CachedResponse> = new Map();
  private config: ResilientApiConfig;
  private isOnline: boolean = true;

  constructor(
    baseClient?: GeminiApiClient,
    errorHandler?: ErrorHandler,
    config?: Partial<ResilientApiConfig>
  ) {
    this.baseClient = baseClient || new DefaultGeminiApiClient();
    this.errorHandler = errorHandler || new ErrorHandler();
    this.config = {
      cacheEnabled: true,
      cacheTtlMs: 300000, // 5 minutes
      fallbackEnabled: true,
      offlineMode: false,
      ...config
    };

    this.setupFallbackStrategies();
  }

  async analyzeText(text: string, prompt: string): Promise<GeminiApiResponse> {
    const context: ErrorContext = {
      operation: 'analyzeText',
      component: 'ResilientGeminiApiClient',
      additionalData: { textLength: text.length, promptLength: prompt.length }
    };

    const cacheKey = this.generateCacheKey('analyzeText', text, prompt);
    
    // Check cache first if enabled
    if (this.config.cacheEnabled) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        logger.debug('Returning cached response for analyzeText', { cacheKey });
        return cached;
      }
    }

    return await this.errorHandler.executeWithResilience(
      async () => {
        const response = await this.baseClient.analyzeText(text, prompt);
        
        // Cache successful response
        if (this.config.cacheEnabled) {
          this.cacheResponse(cacheKey, response);
        }
        
        return response;
      },
      context,
      'analyzeText'
    );
  }

  async generateResponse(prompt: string, context?: string): Promise<GeminiApiResponse> {
    const errorContext: ErrorContext = {
      operation: 'generateResponse',
      component: 'ResilientGeminiApiClient',
      additionalData: { promptLength: prompt.length, hasContext: !!context }
    };

    const cacheKey = this.generateCacheKey('generateResponse', prompt, context || '');
    
    // Check cache first if enabled
    if (this.config.cacheEnabled) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        logger.debug('Returning cached response for generateResponse', { cacheKey });
        return cached;
      }
    }

    return await this.errorHandler.executeWithResilience(
      async () => {
        const response = await this.baseClient.generateResponse(prompt, context);
        
        // Cache successful response
        if (this.config.cacheEnabled) {
          this.cacheResponse(cacheKey, response);
        }
        
        return response;
      },
      errorContext,
      'generateResponse'
    );
  }

  async isHealthy(): Promise<boolean> {
    const context: ErrorContext = {
      operation: 'isHealthy',
      component: 'ResilientGeminiApiClient'
    };

    try {
      return await this.errorHandler.executeWithResilience(
        () => this.baseClient.isHealthy(),
        context
      );
    } catch (error) {
      logger.warn('Health check failed', { error: (error as Error).message });
      this.isOnline = false;
      return false;
    }
  }

  /**
   * Enable offline mode with cached responses only
   */
  enableOfflineMode(): void {
    this.config.offlineMode = true;
    this.isOnline = false;
    logger.info('Offline mode enabled');
  }

  /**
   * Disable offline mode and resume normal operation
   */
  disableOfflineMode(): void {
    this.config.offlineMode = false;
    this.isOnline = true;
    logger.info('Offline mode disabled');
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.responseCache.clear();
    logger.info('Response cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): CacheStatistics {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;

    for (const [key, cached] of this.responseCache.entries()) {
      totalSize += key.length + JSON.stringify(cached.response).length;
      
      if (cached.expirationTime.getTime() > now) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.responseCache.size,
      validEntries,
      expiredEntries,
      totalSizeBytes: totalSize,
      hitRate: this.calculateHitRate()
    };
  }

  private setupFallbackStrategies(): void {
    // Fallback strategy for analyzeText - use cached responses or basic analysis
    this.errorHandler.registerFallbackStrategy('analyzeText', {
      type: 'cache',
      description: 'Use cached response for similar text analysis',
      implementation: async () => {
        // Try to find a similar cached response
        const similarResponse = this.findSimilarCachedResponse('analyzeText');
        if (similarResponse) {
          logger.info('Using similar cached response as fallback');
          return similarResponse;
        }
        throw new Error('No suitable cached response found');
      }
    });

    this.errorHandler.registerFallbackStrategy('analyzeText', {
      type: 'degraded',
      description: 'Basic text analysis without AI',
      implementation: async () => {
        logger.info('Using basic text analysis fallback');
        return this.createBasicAnalysisResponse();
      }
    });

    // Fallback strategy for generateResponse - use templates or cached responses
    this.errorHandler.registerFallbackStrategy('generateResponse', {
      type: 'template',
      description: 'Use predefined response templates',
      implementation: async () => {
        logger.info('Using template-based response fallback');
        return this.createTemplateResponse();
      }
    });

    this.errorHandler.registerFallbackStrategy('generateResponse', {
      type: 'cache',
      description: 'Use cached response for similar prompt',
      implementation: async () => {
        const similarResponse = this.findSimilarCachedResponse('generateResponse');
        if (similarResponse) {
          logger.info('Using similar cached response as fallback');
          return similarResponse;
        }
        throw new Error('No suitable cached response found');
      }
    });
  }

  private generateCacheKey(operation: string, ...params: string[]): string {
    const content = params.join('|');
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${operation}:${hash}`;
  }

  private getCachedResponse(cacheKey: string): GeminiApiResponse | null {
    const cached = this.responseCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    if (cached.expirationTime.getTime() < Date.now()) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    return cached.response;
  }

  private cacheResponse(cacheKey: string, response: GeminiApiResponse): void {
    const expirationTime = new Date(Date.now() + this.config.cacheTtlMs);
    
    this.responseCache.set(cacheKey, {
      response,
      timestamp: new Date(),
      expirationTime
    });

    // Clean up expired entries periodically
    if (this.responseCache.size % 50 === 0) {
      this.cleanupExpiredCache();
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.responseCache.entries()) {
      if (cached.expirationTime.getTime() < now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.responseCache.delete(key));
    
    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  private findSimilarCachedResponse(operation: string): GeminiApiResponse | null {
    // Simple similarity matching - in production, you might use more sophisticated algorithms
    for (const [key, cached] of this.responseCache.entries()) {
      if (key.startsWith(operation) && cached.expirationTime.getTime() > Date.now()) {
        return cached.response;
      }
    }
    return null;
  }

  private createBasicAnalysisResponse(): GeminiApiResponse {
    return {
      content: 'Basic analysis completed. AI-powered analysis is currently unavailable.',
      confidence: 0.3,
      usage: {
        inputTokens: 0,
        outputTokens: 10
      }
    };
  }

  private createTemplateResponse(): GeminiApiResponse {
    const templates = [
      'I understand you need assistance. Let me help you with that.',
      'I\'m currently experiencing some technical difficulties, but I can still provide basic support.',
      'Thank you for your patience. I\'m working with limited capabilities at the moment.',
      'I\'m here to help, though my responses may be more basic than usual right now.'
    ];

    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];

    return {
      content: randomTemplate,
      confidence: 0.4,
      usage: {
        inputTokens: 0,
        outputTokens: randomTemplate.split(' ').length
      }
    };
  }

  private calculateHitRate(): number {
    // This would need to be tracked over time in a real implementation
    // For now, return a placeholder
    return 0.0;
  }
}

export interface CacheStatistics {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  totalSizeBytes: number;
  hitRate: number;
}