# Testing - Claude Code Instructions

> Vitest test setup, utilities, and fixtures

## Quick Reference

| Task | Command |
|------|---------|
| Run all tests | `pnpm test` |
| Run with watch | `pnpm test:watch` |
| Run with coverage | `pnpm test:coverage` |
| Run single file | `pnpm test src/services/recipe-data.test.ts` |

## Directory Structure

```
src/test/
├── setup.ts       # Global test setup (runs before all tests)
└── fixtures/
    └── recipes.json  # Test data fixtures
```

## Test Configuration

From `vitest.config.ts`:

```typescript
{
  test: {
    globals: true,           // No need to import describe, it, expect
    environment: 'node',     // Node.js environment
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000,      // 10 second timeout
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
}
```

## Global Setup

`setup.ts` runs before all tests:

```typescript
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = ':memory:';
  process.env.ANTHROPIC_API_KEY = 'test-api-key';
});

afterEach(() => {
  vi.clearAllMocks();  // Clear mocks between tests
});

afterAll(() => {
  vi.restoreAllMocks();  // Restore original implementations
});
```

## Writing Tests

### Basic Test Structure

```typescript
// src/services/my-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myService } from './my-service';

describe('myService', () => {
  beforeEach(() => {
    // Reset state before each test
  });

  it('should do something', () => {
    const result = myService.doSomething();
    expect(result).toBe('expected');
  });

  it('should handle errors', async () => {
    await expect(myService.failingMethod()).rejects.toThrow('Error message');
  });
});
```

### Mocking

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('./dependency', () => ({
  dependency: vi.fn(() => 'mocked value'),
}));

// Mock a function
const mockFn = vi.fn();
mockFn.mockReturnValue('value');
mockFn.mockResolvedValue('async value');
mockFn.mockRejectedValue(new Error('error'));

// Spy on object method
const spy = vi.spyOn(object, 'method');
expect(spy).toHaveBeenCalledWith('arg');
```

### Using Fixtures

```typescript
import recipes from '../test/fixtures/recipes.json';

describe('recipeService', () => {
  it('should parse recipes', () => {
    const result = parseRecipes(recipes);
    expect(result).toHaveLength(recipes.length);
  });
});
```

## Test Patterns

### Testing tRPC Routers

```typescript
import { createCallerFactory } from '../../trpc';
import { appRouter } from '../../trpc/router';

const createCaller = createCallerFactory(appRouter);

describe('myRouter', () => {
  it('should query data', async () => {
    const caller = createCaller({
      db: mockDb,
      userId: 'test-user',
      user: mockUser,
    });

    const result = await caller.myModule.getAll();
    expect(result).toHaveLength(2);
  });
});
```

### Testing Services

```typescript
describe('mealSuggestionsService', () => {
  it('should generate suggestions', async () => {
    vi.mock('../services/claude-session', () => ({
      getClaudeSession: () => ({
        runQuery: vi.fn().mockResolvedValue({
          success: true,
          result: { suggestions: [] },
        }),
      }),
    }));

    const result = await mealSuggestionsService.getSuggestionsWithSession({
      preferences: mockPreferences,
      dateRange: { start: '2024-01-01', end: '2024-01-07' },
    });

    expect(result.suggestions).toBeDefined();
  });
});
```

### Testing with Database

```typescript
import { db } from '../../db';
import { myTable } from '../../db/schema';

describe('with database', () => {
  beforeEach(async () => {
    // Clear table before each test
    await db.delete(myTable);
  });

  it('should insert and query', async () => {
    await db.insert(myTable).values({ name: 'test' });
    const results = await db.query.myTable.findMany();
    expect(results).toHaveLength(1);
  });
});
```

## Fixtures

Located in `src/test/fixtures/`:

| File | Content |
|------|---------|
| `recipes.json` | Sample recipe data for testing recipe-related services |

**Adding New Fixtures:**
```typescript
// src/test/fixtures/shopping-items.json
[
  { "id": "1", "name": "Milk", "category": "dairy" },
  { "id": "2", "name": "Bread", "category": "bakery" }
]
```

## Test File Naming

| Pattern | Use For |
|---------|---------|
| `*.test.ts` | Unit tests |
| `*.spec.ts` | Integration/behavior tests |
| `__tests__/*.ts` | Test directory (alternative) |

## Coverage

Run coverage report:
```bash
pnpm test:coverage
```

Coverage excludes:
- Test files (`*.test.ts`, `*.spec.ts`)
- Node modules
- Dist folder
- Test utilities (`src/test/**`)

## Related Files

- Vitest config: `vitest.config.ts`
- Package scripts: `package.json`
- E2E tests: `../../e2e/` (Playwright, at project root)
