# HoneyDo API - Claude Code Instructions

> Fastify backend with tRPC, Drizzle ORM, and Socket.io

## Quick Reference

| Task | Command/Location |
|------|------------------|
| Start dev server | `pnpm dev` |
| Add tRPC route | `src/modules/<module>/router.ts` |
| Add DB table | `src/db/schema/<module>.ts` |
| Run migrations | `pnpm db:migrate` |
| Generate migrations | `pnpm db:generate` |
| Open DB GUI | `pnpm db:studio` |
| Seed database | `pnpm db:seed` |

## Architecture Overview

```
apps/api/src/
├── server.ts           # Fastify entry point
├── trpc/
│   ├── index.ts       # tRPC exports
│   ├── router.ts      # Root router (combine all module routers here)
│   ├── context.ts     # Request context (db, userId, user)
│   └── procedures.ts  # Procedure types (public, protected, admin)
├── db/
│   ├── index.ts       # Database client export
│   ├── seed.ts        # Seeding script
│   └── schema/        # Drizzle table definitions
├── modules/           # Feature modules (each has router.ts)
│   ├── shopping/      # Shopping List module
│   ├── home/          # Home Automation module
│   └── recipes/       # Recipes & Meal Planning module
│       ├── wizard/    # Multi-step batch wizard (12 files)
│       └── *.router.ts
├── services/          # Shared services
│   ├── websocket/     # Socket.io server & emitter
│   ├── homeassistant/ # Home Assistant integration
│   ├── claude-session.ts  # Persistent Claude session service
│   ├── meal-suggestions.ts # AI meal suggestion service
│   └── recipe-history.ts   # Recipe history JSON management
├── routes/            # Non-tRPC routes (webhooks)
└── middleware/        # Fastify middleware
```

## tRPC Patterns

### Creating a New Router

```typescript
// src/modules/shopping-list/router.ts
import { router, protectedProcedure, adminProcedure } from '../../trpc';
import { z } from 'zod';
import { createListSchema } from '@honeydo/shared/schemas';

export const shoppingListRouter = router({
  // Query - for reading data
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.householdId, ctx.user.householdId),
      orderBy: desc(shoppingLists.updatedAt),
    });
  }),

  // Query with input
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input.id),
      });
    }),

  // Mutation - for creating/updating/deleting
  create: protectedProcedure
    .input(createListSchema)
    .mutation(async ({ ctx, input }) => {
      const [list] = await ctx.db.insert(shoppingLists).values({
        name: input.name,
        createdBy: ctx.userId,
      }).returning();

      // Emit WebSocket event
      emitToHousehold(ctx.user.householdId, 'shopping:list:created', list);

      return list;
    }),

  // Admin-only procedure
  deleteAll: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(shoppingLists);
  }),
});
```

### Registering Router

```typescript
// src/trpc/router.ts
import { shoppingListRouter } from '../modules/shopping-list/router';

export const appRouter = router({
  user: userRouter,
  settings: settingsRouter,
  shoppingList: shoppingListRouter,  // Add here
});
```

### Procedure Types

| Type | Auth Required | Use For |
|------|--------------|---------|
| `publicProcedure` | No | Health checks, public data |
| `protectedProcedure` | Yes | All user-facing operations |
| `adminProcedure` | Yes + admin role | Admin operations |

### Context Available

```typescript
ctx.db        // Drizzle database client
ctx.userId    // Clerk user ID (string, protected routes only)
ctx.user      // Full user object from database (protected routes only)
```

## Database Patterns

### Defining a Table

```typescript
// src/db/schema/shopping-list.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users';

export const shoppingLists = sqliteTable('shopping_lists', {
  // Always use nanoid for IDs
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // Basic fields
  name: text('name').notNull(),
  description: text('description'),

  // Foreign keys
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Timestamps as ISO strings
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),

  // JSON data (store as text, parse in app)
  metadata: text('metadata', { mode: 'json' }).$type<{
    color?: string;
    icon?: string;
  }>(),

  // Booleans as integers (SQLite)
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),

  // Enums as text with type constraint
  status: text('status').$type<'active' | 'completed' | 'archived'>().default('active'),
});

// Export relations for Drizzle query API
export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  creator: one(users, {
    fields: [shoppingLists.createdBy],
    references: [users.id],
  }),
  items: many(shoppingItems),
}));
```

### Export Schema

```typescript
// src/db/schema/index.ts
export * from './users';
export * from './settings';
export * from './modules';
export * from './shopping-list';  // Add new schemas here
```

### Query Patterns

```typescript
// Simple select
const lists = await db.query.shoppingLists.findMany();

// With filter
const list = await db.query.shoppingLists.findFirst({
  where: eq(shoppingLists.id, listId),
});

// With relations
const listWithItems = await db.query.shoppingLists.findFirst({
  where: eq(shoppingLists.id, listId),
  with: {
    items: true,
    creator: true,
  },
});

// Insert
const [newList] = await db.insert(shoppingLists)
  .values({ name: 'Groceries', createdBy: userId })
  .returning();

// Update
await db.update(shoppingLists)
  .set({ name: 'Updated Name', updatedAt: new Date().toISOString() })
  .where(eq(shoppingLists.id, listId));

// Delete
await db.delete(shoppingLists)
  .where(eq(shoppingLists.id, listId));

// Complex query with multiple conditions
const items = await db.query.shoppingItems.findMany({
  where: and(
    eq(shoppingItems.listId, listId),
    eq(shoppingItems.checked, false),
  ),
  orderBy: [asc(shoppingItems.sortOrder), desc(shoppingItems.createdAt)],
});
```

## WebSocket Patterns

### Emitting Events

```typescript
// src/services/websocket/emitter.ts
import { io } from './index';

// Emit to specific user
export function emitToUser(userId: string, event: string, data: unknown) {
  io.to(`user:${userId}`).emit(event, data);
}

// Emit to household (both users)
export function emitToHousehold(householdId: string, event: string, data: unknown) {
  io.to(`household:${householdId}`).emit(event, data);
}

// Emit to all connected clients
export function emitToAll(event: string, data: unknown) {
  io.emit(event, data);
}
```

### Event Naming Convention

```
module:entity:action

Examples:
- shopping:list:created
- shopping:item:checked
- home:device:state-changed
- recipes:recipe:saved
```

### Using in tRPC

```typescript
import { emitToHousehold } from '../../services/websocket/emitter';

// In a mutation
.mutation(async ({ ctx, input }) => {
  const item = await db.insert(shoppingItems).values(input).returning();

  // Broadcast to household
  emitToHousehold(ctx.user.householdId, 'shopping:item:added', item[0]);

  return item[0];
});
```

## Validation

Always use Zod schemas from `@honeydo/shared`:

```typescript
import { createListSchema, updateListSchema } from '@honeydo/shared/schemas';

// In tRPC procedure
.input(createListSchema)
.mutation(async ({ ctx, input }) => {
  // input is fully typed and validated
});
```

If you need API-specific validation (not shared with frontend):

```typescript
const internalSchema = z.object({
  // API-only fields
});
```

## Error Handling

```typescript
import { TRPCError } from '@trpc/server';

// Not found
if (!item) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Item not found',
  });
}

// Forbidden
if (item.createdBy !== ctx.userId && ctx.user.role !== 'admin') {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'You do not have permission to modify this item',
  });
}

// Bad request
if (items.length >= MAX_ITEMS) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Cannot have more than ${MAX_ITEMS} items`,
  });
}
```

## Services

### Home Assistant Service (✅ Implemented)

Located in `src/services/homeassistant/`. See `apps/api/src/modules/home/CLAUDE.md` for details.

```typescript
import { callService, toggleEntity, isHAConnected, getCachedEntities } from '../../services/homeassistant';
```

### Claude Session Service (✅ Implemented)

Located in `src/services/claude-session.ts`. Provides a persistent Claude Code session using `@anthropic-ai/claude-agent-sdk`.

**Key Features:**
- Session warmup on server startup (eliminates cold start)
- Queue-based request handling (one request at a time)
- Session resumption across requests
- Streaming message callbacks for real-time progress

```typescript
import { getClaudeSession, type QueryResult } from '../../services/claude-session';

// Get singleton instance
const session = getClaudeSession();

// Warmup on server startup
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

// Check session status
session.getStatus(); // 'idle' | 'warming_up' | 'ready' | 'busy' | 'error' | 'closed'
session.getQueryCount();
session.getUptime();
```

### Meal Suggestions Service (✅ Implemented)

Located in `src/services/meal-suggestions.ts`. Two methods available:

**Method 1: Persistent Session (Recommended)**
```typescript
import { mealSuggestionsService } from '../../services/meal-suggestions';

// Uses ClaudeSessionService for faster response
const output = await mealSuggestionsService.getSuggestionsWithSession({
  preferences,
  dateRange: { start: '2024-01-15', end: '2024-01-21' },
  activityCallback: (message) => {
    // Real-time "girly pop" progress messages (420+ variations!)
    socketEmitter.toUser(userId, 'recipes:activity', { message });
  },
});
```

**Method 2: CLI Spawn (Fallback)**
```typescript
// Spawns Claude CLI for each request
const output = await mealSuggestionsService.getSuggestions(skillInput);
// output: { suggestions: [], reasoning: string }
```

See `apps/api/src/modules/recipes/CLAUDE.md` for full integration details.

### WebSocket Service (✅ Implemented)

Located in `src/services/websocket/`. Handles real-time updates via Socket.io.

```typescript
import { socketEmitter } from '../../services/websocket/emitter';

// Emit to specific user
socketEmitter.toUser(userId, 'event:name', data);

// Emit to all except sender
socketEmitter.toOthers(userId, 'event:name', data);

// Broadcast to all clients
socketEmitter.broadcast('event:name', data);
```

### Recipe History Service (✅ Implemented)

Located in `src/services/recipe-history.ts`. Manages the JSON-based recipe history file.

```typescript
import { recipeHistoryService } from '../../services/recipe-history';

// Get all recipes
const recipes = await recipeHistoryService.getAll();

// Search by name
const results = await recipeHistoryService.search('pasta');

// Add a new recipe to history
await recipeHistoryService.add(newRecipe);
```

## Testing

```typescript
// src/modules/shopping-list/__tests__/router.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestContext } from '../../../test/utils';

describe('shoppingListRouter', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  it('creates a list', async () => {
    const caller = ctx.createCaller();
    const list = await caller.shoppingList.create({ name: 'Test List' });

    expect(list.name).toBe('Test List');
    expect(list.createdBy).toBe(ctx.userId);
  });
});
```

## Environment Variables

Required in `apps/api/.env`:

```bash
# Server
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info

# Database
DATABASE_URL=./data/honeydo.db

# Auth (Clerk)
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# AI (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Home Assistant
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=...
```

## Common Tasks

### Add a New Module

1. Create schema in `src/db/schema/<module>.ts`
2. Export from `src/db/schema/index.ts`
3. Run `pnpm db:generate` then `pnpm db:migrate`
4. Create router in `src/modules/<module>/router.ts`
5. Register in `src/trpc/router.ts`
6. Add WebSocket events to shared types
7. Create Zod schemas in `packages/shared`

### Add a New Webhook

```typescript
// src/routes/webhooks/example.ts
import { FastifyInstance } from 'fastify';

export async function exampleWebhook(app: FastifyInstance) {
  app.post('/webhooks/example', async (request, reply) => {
    // Handle webhook
    return { success: true };
  });
}
```

Register in `server.ts`:
```typescript
import { exampleWebhook } from './routes/webhooks/example';
await app.register(exampleWebhook);
```

## Files to Reference

- Master plan: `docs/PLAN.md`
- Feature specs: `docs/epics/*/features/*/PLAN.md`
- Shared types: `packages/shared/src/types/index.ts`
- Shared schemas: `packages/shared/src/schemas/index.ts`
- DB schema reference: `src/db/schema/`
