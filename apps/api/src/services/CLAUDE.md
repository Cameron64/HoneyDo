# HoneyDo Services - Claude Code Instructions

> Shared services for the API backend

## Overview

Services are shared utilities used across multiple modules. Unlike modules (which are feature-specific), services provide cross-cutting functionality.

## Service Structure

```
apps/api/src/services/
├── CLAUDE.md                  # This file
├── claude-session.ts          # Persistent Claude Code session
├── meal-suggestions.ts        # AI meal suggestion service
├── recipe-data.ts             # Recipe data utilities
├── recipe-history.ts          # Recipe history JSON management
├── recipe-scraper.ts          # Recipe URL scraping
├── homeassistant/             # Home Assistant integration
│   ├── index.ts               # Main HA client
│   ├── connection.ts          # WebSocket connection
│   └── entities.ts            # Entity management
├── websocket/                 # Socket.io server
│   ├── index.ts               # Server initialization
│   ├── auth.ts                # Socket authentication
│   ├── emitter.ts             # Event emission helpers
│   └── handlers.ts            # Event handlers
└── meal-suggestions/          # (Alternative suggestion approach)
```

## Claude Session Service

`claude-session.ts` - Persistent Claude Code session using `@anthropic-ai/claude-agent-sdk`.

### Key Features

- **Session Persistence**: Maintains a Claude session that can be resumed across requests
- **Queue-Based**: Processes one request at a time to avoid conflicts
- **Warmup**: Can pre-warm on server startup to eliminate cold start
- **MCP Support**: Supports Model Context Protocol servers

### Status States

| Status | Description |
|--------|-------------|
| `idle` | No session active |
| `warming_up` | Session initialization in progress |
| `ready` | Session ready for requests |
| `busy` | Currently processing a request |
| `error` | Last operation failed |
| `closed` | Session closed |

### Usage

```typescript
import { getClaudeSession, type QueryResult } from '../services/claude-session';

// Get singleton instance
const session = getClaudeSession();

// Warmup on server startup (optional but recommended)
await session.warmup();

// Run a query with streaming callbacks
const result: QueryResult = await session.runQuery({
  prompt: 'Generate meal suggestions for next week...',
  systemPrompt: mealSuggestionsPrompt,
  onMessage: (message) => {
    // Stream activity to frontend
    if (message.type === 'assistant') {
      socketEmitter.toUser(userId, 'recipes:activity', {
        message: extractActivityMessage(message),
      });
    }
  },
});

// Check status
session.getStatus();      // 'idle' | 'warming_up' | 'ready' | 'busy' | 'error' | 'closed'
session.getQueryCount();  // Number of queries processed
session.getUptime();      // Session uptime in ms
session.getSessionId();   // Current session ID or null
```

### Configuration

```typescript
const session = getClaudeSession({
  model: 'claude-sonnet-4-20250514',     // Default model
  cwd: '/path/to/project',               // Working directory
  warmupPrompt: 'You are ready...',      // Initial prompt
  allowedTools: ['Read', 'Grep'],        // Allowed tools
  mcpServers: { meals: mealsServer },    // MCP servers
});
```

### With MCP Servers

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Create MCP server
const mealsServer = createSdkMcpServer({
  name: 'meals',
  version: '1.0.0',
  tools: [...],
});

// Use in query
const result = await session.runQuery({
  prompt: 'Find recipes matching my preferences',
  mcpServers: { meals: mealsServer },
});
```

## Meal Suggestions Service

`meal-suggestions.ts` - AI-powered meal suggestion generation.

### Two Approaches

**1. Session-based (Recommended)**:
```typescript
import { mealSuggestionsService } from '../services/meal-suggestions';

const output = await mealSuggestionsService.getSuggestionsWithSession({
  preferences,
  dateRange: { start: '2024-01-15', end: '2024-01-21' },
  activityCallback: (message) => {
    socketEmitter.toUser(userId, 'recipes:activity', { message });
  },
});
```

**2. CLI Spawn (Fallback)**:
```typescript
const output = await mealSuggestionsService.getSuggestions(skillInput);
// output: { suggestions: [], reasoning: string }
```

### Activity Messages

The service streams "girly pop" activity messages during generation:
- "bestie is checking your recipe library..."
- "manifesting the perfect dinner..."
- "putting the finishing touches..."

420+ variations across categories: thinking, querying, finalizing.

### ⚠️ IMPORTANT: Environment Flags

**Common debugging issue:** The meal suggestions service has environment flags that can bypass Claude entirely.

| Flag | Default | Effect |
|------|---------|--------|
| `MOCK_MEAL_SUGGESTIONS` | `false` | When `true`, returns mock suggestions from recipe history without calling Claude |
| `DEV_BYPASS_AUTH` | `false` | When `true`, skips Clerk auth (uses `dev-test-user`) |
| `USE_LEGACY_CLAUDE_CLI` | `false` | When `true`, spawns CLI instead of using persistent session |

**Troubleshooting steps when suggestions aren't working:**

1. **Check `apps/api/.env`** for `MOCK_MEAL_SUGGESTIONS=true`
   - If `true`, Claude is NOT being called - you're getting mock data
   - Set to `false` to use real Claude integration

2. **After testing, always reset:**
   ```bash
   # In apps/api/.env
   MOCK_MEAL_SUGGESTIONS=false
   DEV_BYPASS_AUTH=false  # Unless actively testing
   ```

3. **Restart the API** after changing `.env` flags

**Note for Claude Code:** The `DEV_BYPASS_AUTH=true` flag allows you to test API endpoints without authentication. Remember to set `MOCK_MEAL_SUGGESTIONS=false` when testing the actual Claude integration, and set both flags back to `false` when done testing.

## WebSocket Service

`websocket/` - Real-time communication via Socket.io.

### Initialization

```typescript
// In server.ts
import { initializeWebSocket, socketEmitter } from './services/websocket';

const httpServer = await app.listen({ port: 3001, host: '0.0.0.0' });
initializeWebSocket(httpServer);
```

### Event Emission

```typescript
import { socketEmitter } from './services/websocket/emitter';

// Emit to specific user
socketEmitter.toUser(userId, 'event:name', data);

// Emit to all except sender
socketEmitter.toOthers(userId, 'event:name', data);

// Broadcast to all clients
socketEmitter.broadcast('event:name', data);

// Emit to household (all authenticated users)
socketEmitter.toHousehold('event:name', data);
```

### Rooms

| Room | Members | Use For |
|------|---------|---------|
| `user:{userId}` | Single user | Personal notifications |
| `household` | All users | Shared data updates |

### Authentication

Sockets authenticate via Clerk JWT in the `auth.token` field:

```typescript
// Client sends
const socket = io(apiUrl, {
  auth: { token: await getToken() },
});

// Server validates in auth.ts middleware
```

## Home Assistant Service

`homeassistant/` - Integration with Home Assistant for device control.

### Connection

```typescript
import { connectToHA, isHAConnected, getConnection } from '../services/homeassistant';

// Connect with token
await connectToHA('http://homeassistant.local:8123', 'your-token');

// Check status
if (isHAConnected()) {
  const connection = getConnection();
}
```

### Service Calls

```typescript
import { callService, toggleEntity } from '../services/homeassistant';

// Toggle a light
await toggleEntity('light.living_room');

// Call specific service
await callService('light', 'turn_on', {
  entity_id: 'light.living_room',
  brightness: 128,
});
```

### Entity Management

```typescript
import { subscribeToStateChanges, getCachedEntities } from '../services/homeassistant';

// Get cached entities
const entities = getCachedEntities();

// Subscribe to state changes
subscribeToStateChanges((event) => {
  socketEmitter.broadcast('home:entity:state-changed', {
    entityId: event.entity_id,
    newState: event.new_state,
  });
});
```

## Recipe History Service

`recipe-history.ts` - Manages the JSON-based recipe history file.

### Usage

```typescript
import { recipeHistoryService } from '../services/recipe-history';

// Get all recipes
const recipes = await recipeHistoryService.getAll();

// Search by name
const results = await recipeHistoryService.search('pasta');

// Add a new recipe
await recipeHistoryService.add(newRecipe);

// Update recipe
await recipeHistoryService.update(recipeId, updates);
```

### File Location

Recipe history is stored at `data/recipes/history.json`.

## Recipe Scraper Service

`recipe-scraper.ts` - Extracts recipe data from URLs.

### Usage

```typescript
import { scrapeRecipe } from '../services/recipe-scraper';

const recipe = await scrapeRecipe('https://example.com/recipe');
// Returns: { name, ingredients, instructions, prepTime, ... }
```

Supports JSON-LD schema extraction for structured recipe data.

## Best Practices

1. **Use Services for Cross-Cutting Concerns**
   - Services are for functionality used by multiple modules
   - Don't put module-specific logic in services

2. **Singleton Pattern for Stateful Services**
   ```typescript
   let instance: MyService | null = null;
   export function getMyService(): MyService {
     if (!instance) {
       instance = new MyService();
     }
     return instance;
   }
   ```

3. **Error Handling**
   - Services should throw errors, let callers handle them
   - Log errors with context for debugging

4. **Environment Variables**
   - Services read config from `process.env`
   - Don't hardcode URLs or tokens

## Files to Reference

- Claude session: `claude-session.ts`
- Meal suggestions: `meal-suggestions.ts`
- WebSocket index: `websocket/index.ts`
- WebSocket emitter: `websocket/emitter.ts`
- HA client: `homeassistant/index.ts`
- Recipe history: `recipe-history.ts`
