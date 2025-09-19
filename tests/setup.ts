// Test setup and configuration
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.GEMINI_API_KEY = 'test-api-key';
});

afterAll(() => {
  // Cleanup after tests
});