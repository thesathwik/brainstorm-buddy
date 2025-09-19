import { describe, it, expect, beforeEach } from 'vitest';
import { validateEnvironment } from '../../src/config';

describe('Environment Configuration', () => {
  beforeEach(() => {
    // Reset environment for each test
    delete process.env.GEMINI_API_KEY;
  });

  it('should validate required environment variables', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should throw error for missing required variables', () => {
    expect(() => validateEnvironment()).toThrow('Missing required environment variables: GEMINI_API_KEY');
  });
});