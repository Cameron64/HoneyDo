/**
 * Global test setup for Vitest
 *
 * This file is loaded before all tests run.
 * Use it for:
 * - Global mocks
 * - Environment setup
 * - Test utilities
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = ':memory:';
  process.env.ANTHROPIC_API_KEY = 'test-api-key';
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global cleanup
afterAll(() => {
  vi.restoreAllMocks();
});
