import { GoogleGenerativeAI, GenerativeModel, GenerateContentResult } from '@google/generative-ai';
import { config } from '../config/environment';

export interface GeminiApiResponse {
  content: string;
  confidence: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface GeminiApiClient {
  analyzeText(text: string, prompt: string): Promise<GeminiApiResponse>;
  generateResponse(prompt: string, context?: string): Promise<GeminiApiResponse>;
  isHealthy(): Promise<boolean>;
}

export class DefaultGeminiApiClient implements GeminiApiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey?: string) {
    const key = apiKey || config.geminiApiKey;
    if (!key) {
      throw new Error('Gemini API key is required');
    }
    
    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async analyzeText(text: string, prompt: string): Promise<GeminiApiResponse> {
    try {
      const fullPrompt = `${prompt}\n\nText to analyze: "${text}"`;
      const result = await this.model.generateContent(fullPrompt);
      
      return this.processGeminiResponse(result);
    } catch (error) {
      throw new Error(`Failed to analyze text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateResponse(prompt: string, context?: string): Promise<GeminiApiResponse> {
    try {
      const fullPrompt = context 
        ? `Context: ${context}\n\nPrompt: ${prompt}`
        : prompt;
      
      const result = await this.model.generateContent(fullPrompt);
      
      return this.processGeminiResponse(result);
    } catch (error) {
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const testResult = await this.model.generateContent('Hello, are you working?');
      return testResult.response.text().length > 0;
    } catch (error) {
      return false;
    }
  }

  private processGeminiResponse(result: GenerateContentResult): GeminiApiResponse {
    const response = result.response;
    const text = response.text();
    
    // Extract usage information if available
    const usage = {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0
    };

    // Calculate confidence based on response quality (simplified heuristic)
    const confidence = this.calculateConfidence(text, response);

    return {
      content: text,
      confidence,
      usage
    };
  }

  private calculateConfidence(text: string, response: any): number {
    // Simple heuristic for confidence calculation
    // In a real implementation, this could be more sophisticated
    if (!text || text.length === 0) return 0;
    
    // Base confidence on response length and structure
    let confidence = 0.7; // Base confidence
    
    // Adjust based on response length (longer responses might be more detailed)
    if (text.length > 100) confidence += 0.1;
    if (text.length > 500) confidence += 0.1;
    
    // Check for structured content (lists, specific formatting)
    if (text.includes('\n') || text.includes('•') || text.includes('-')) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }
}