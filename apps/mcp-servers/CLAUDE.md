# HoneyDo MCP Servers - Claude Code Instructions

> Model Context Protocol servers for Claude Code integration

## Overview

MCP (Model Context Protocol) servers provide tools that Claude Code can use during conversations. These servers expose specific functionality that Claude can call to perform actions or retrieve information.

## Directory Structure

```
apps/mcp-servers/
├── CLAUDE.md              # This file
└── meals/                 # Meals MCP server
    ├── package.json       # Server dependencies
    ├── tsconfig.json      # TypeScript config
    └── src/
        ├── index.ts       # Entry point
        ├── server.ts      # MCP server definition
        ├── types.ts       # Type definitions
        ├── services/      # Service layer
        │   └── recipe-lookup.ts
        └── tools/         # Tool implementations
            ├── query-recipes.ts
            └── submit-selections.ts
```

## Meals MCP Server

The meals server provides recipe querying and selection tools for the meal planning wizard.

### Available Tools

| Tool | Purpose |
|------|---------|
| `query_recipes` | Search recipes by criteria |
| `submit_selections` | Submit selected meals to batch |

### Tool Definitions

#### query_recipes

Searches the recipe library with filters:

```typescript
// Input schema
{
  query: string;              // Search text (name, cuisine, tags)
  cuisine?: string;           // Filter by cuisine
  maxTime?: number;           // Max total time in minutes
  maxEffort?: number;         // Max effort level (1-5)
  excludeRecent?: boolean;    // Exclude recently made recipes
  limit?: number;             // Max results (default: 10)
}

// Output
{
  recipes: RecipeData[];      // Matching recipes
  total: number;              // Total matches
}
```

#### submit_selections

Submits selected meals to the current wizard batch:

```typescript
// Input schema
{
  selections: {
    recipeId: string;         // Recipe ID from query
    date: string;             // Target date (YYYY-MM-DD)
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    servings?: number;        // Override default servings
  }[];
}

// Output
{
  success: boolean;
  acceptedCount: number;
  errors?: string[];
}
```

### Server Implementation

```typescript
// src/server.ts
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { queryRecipesTool } from './tools/query-recipes';
import { submitSelectionsTool } from './tools/submit-selections';

export function createMealsServer() {
  return createSdkMcpServer({
    name: 'meals',
    version: '1.0.0',
    tools: [
      queryRecipesTool,
      submitSelectionsTool,
    ],
  });
}
```

### Tool Definition Pattern

```typescript
// src/tools/query-recipes.ts
import { z } from 'zod';
import { recipeLookup } from '../services/recipe-lookup';

export const queryRecipesTool = {
  name: 'query_recipes',
  description: 'Search recipes by name, cuisine, time, or effort level',
  inputSchema: z.object({
    query: z.string().describe('Search text'),
    cuisine: z.string().optional(),
    maxTime: z.number().optional(),
    maxEffort: z.number().min(1).max(5).optional(),
    excludeRecent: z.boolean().optional().default(true),
    limit: z.number().optional().default(10),
  }),
  execute: async (input) => {
    const results = await recipeLookup.search(input);
    return {
      recipes: results,
      total: results.length,
    };
  },
};
```

## Using MCP Servers with Claude Session

```typescript
import { getClaudeSession } from '../services/claude-session';
import { createMealsServer } from '../../mcp-servers/meals/src/server';

const session = getClaudeSession();
const mealsServer = createMealsServer();

// Include server in query
const result = await session.runQuery({
  prompt: 'Find easy dinner recipes under 30 minutes',
  mcpServers: { meals: mealsServer },
});
```

## Creating a New MCP Server

### 1. Create Directory Structure

```bash
mkdir -p apps/mcp-servers/new-server/src/{tools,services}
```

### 2. Create package.json

```json
{
  "name": "@honeydo/mcp-new-server",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.61",
    "@honeydo/shared": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0"
  }
}
```

### 3. Create Server

```typescript
// src/server.ts
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { myTool } from './tools/my-tool';

export function createNewServer() {
  return createSdkMcpServer({
    name: 'new-server',
    version: '1.0.0',
    tools: [myTool],
  });
}
```

### 4. Define Tools

```typescript
// src/tools/my-tool.ts
import { z } from 'zod';

export const myTool = {
  name: 'my_tool',
  description: 'What this tool does',
  inputSchema: z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional(),
  }),
  execute: async (input) => {
    // Implementation
    return { result: 'success' };
  },
};
```

### 5. Export Server

```typescript
// src/index.ts
export { createNewServer } from './server';
export * from './types';
```

## Best Practices

### Tool Design

1. **Clear Names**: Use snake_case, descriptive names
2. **Good Descriptions**: Claude uses descriptions to decide which tool to use
3. **Input Validation**: Use Zod schemas with `.describe()` for each field
4. **Error Handling**: Return errors in a structured format
5. **Idempotent**: Tools should be safe to retry

### Performance

1. **Batch Operations**: When possible, accept arrays to reduce tool calls
2. **Caching**: Cache expensive lookups
3. **Timeouts**: Set reasonable timeouts for external calls

### Security

1. **Input Validation**: Always validate input with Zod
2. **Authorization**: Check permissions before executing actions
3. **Rate Limiting**: Prevent abuse of expensive operations

## Debugging MCP Servers

### Enable Logging

```typescript
export const myTool = {
  // ...
  execute: async (input) => {
    console.log('[MCP:my_tool] Input:', JSON.stringify(input));
    try {
      const result = await doSomething(input);
      console.log('[MCP:my_tool] Result:', result);
      return result;
    } catch (error) {
      console.error('[MCP:my_tool] Error:', error);
      throw error;
    }
  },
};
```

### Test Tools Directly

```typescript
import { myTool } from './tools/my-tool';

// Test execution
const result = await myTool.execute({
  param1: 'test',
  param2: 42,
});
console.log(result);
```

## Files to Reference

- Claude session service: `apps/api/src/services/claude-session.ts`
- Shared types: `packages/shared/src/schemas/recipes.ts`
- Meal suggestions service: `apps/api/src/services/meal-suggestions.ts`
