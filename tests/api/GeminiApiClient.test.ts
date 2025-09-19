import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultGeminiApiClient } from '../../src/api/GeminiApiClient';

// Mock the Google Generative AI module
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn(() => ({
    generateContent: mockGenerateContent
  }));
  
  return {
    GoogleGenerativeAI: vi.fn(() => ({
      getGenerativeModel: mockGetGenerativeModel
    })),
    mockGenerateContent,
    mockGetGenerativeModel
  };
});

describe('DefaultGeminiApiClient', () => {
  let client: DefaultGeminiApiClient;
  let mockGenerateContent: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { mockGenerateContent: mockGenContent } = await import('@google/generative-ai');
    mockGenerateContent = mockGenContent;
    
    // Mock successful response
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Test response',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20
        }
      }
    });
    
    client = new DefaultGeminiApiClient('test-api-key');
  });

  describe('constructor', () => {
    it('should throw error when no API key is provided', () => {
      expect(() => new DefaultGeminiApiClient('')).toThrow('Gemini API key is required');
    });

    it('should initialize with provided API key', () => {
      expect(() => new DefaultGeminiApiClient('valid-key')).not.toThrow();
    });
  });

  describe('analyzeText', () => {
    it('should analyze text with given prompt', async () => {
      const result = await client.analyzeText('test text', 'analyze this');
      
      expect(mockGenerateContent).toHaveBeenCalledWith('analyze this\n\nText to analyze: "test text"');
      expect(result).toEqual({
        content: 'Test response',
        confidence: expect.any(Number),
        usage: {
          inputTokens: 10,
          outputTokens: 20
        }
      });
    });

    it('should handle API errors gracefully', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));
      
      await expect(client.analyzeText('test', 'prompt')).rejects.toThrow('Failed to analyze text: API Error');
    });

    it('should calculate confidence based on response quality', async () => {
      // Test with longer, structured response
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'This is a longer response with\n• structured content\n• multiple points',
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20
          }
        }
      });

      const result = await client.analyzeText('test', 'prompt');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('generateResponse', () => {
    it('should generate response with prompt only', async () => {
      const result = await client.generateResponse('test prompt');
      
      expect(mockGenerateContent).toHaveBeenCalledWith('test prompt');
      expect(result.content).toBe('Test response');
    });

    it('should generate response with context', async () => {
      const result = await client.generateResponse('test prompt', 'test context');
      
      expect(mockGenerateContent).toHaveBeenCalledWith('Context: test context\n\nPrompt: test prompt');
      expect(result.content).toBe('Test response');
    });

    it('should handle generation errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Generation failed'));
      
      await expect(client.generateResponse('prompt')).rejects.toThrow('Failed to generate response: Generation failed');
    });
  });

  describe('isHealthy', () => {
    it('should return true when API is working', async () => {
      const result = await client.isHealthy();
      expect(result).toBe(true);
    });

    it('should return false when API fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API down'));
      
      const result = await client.isHealthy();
      expect(result).toBe(false);
    });

    it('should return false when response is empty', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '',
          usageMetadata: {}
        }
      });

      const result = await client.isHealthy();
      expect(result).toBe(false);
    });
  });

  describe('confidence calculation', () => {
    it('should return 0 confidence for empty responses', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '',
          usageMetadata: {}
        }
      });

      const result = await client.analyzeText('test', 'prompt');
      expect(result.confidence).toBe(0);
    });

    it('should increase confidence for longer responses', async () => {
      const longResponse = 'A'.repeat(600);
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => longResponse,
          usageMetadata: {}
        }
      });

      const result = await client.analyzeText('test', 'prompt');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should cap confidence at 1.0', async () => {
      const veryLongStructuredResponse = 'A'.repeat(1000) + '\n• structured\n• content';
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => veryLongStructuredResponse,
          usageMetadata: {}
        }
      });

      const result = await client.analyzeText('test', 'prompt');
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});