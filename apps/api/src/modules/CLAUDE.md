# HoneyDo Modules - Claude Code Instructions

> Guide for creating and maintaining backend modules

## Module Philosophy

HoneyDo uses a **modular architecture** where each feature area (shopping list, recipes, home automation) is a self-contained module. Modules:

- Have their own database tables (prefixed by module name)
- Have their own tRPC router
- Communicate via WebSocket events
- Share the AI service
- **Do NOT import directly from other modules** - use events instead

## Current Modules

| Module | Status | Location | Details |
|--------|--------|----------|---------|
| **user** | ✅ Done | `user/` | User CRUD, Clerk sync |
| **settings** | ✅ Done | `settings/` | User preferences |
| **shopping** | ✅ Done | `shopping/` | See `shopping/CLAUDE.md` |
| **home** | ✅ Done | `home/` | See `home/CLAUDE.md` |
| **recipes** | ✅ Done | `recipes/` | See `recipes/CLAUDE.md` |

## Module Structure

```
apps/api/src/modules/
├── CLAUDE.md              # This file
├── index.ts               # Module registry
├── user/                  # User module (built-in)
│   └── router.ts
├── settings/              # Settings module (built-in)
│   └── router.ts
├── shopping/              # Shopping List module (Epic 2) ✅
│   ├── CLAUDE.md          # Module-specific instructions
│   ├── router.ts          # Main router (3-router pattern)
│   ├── lists.router.ts    # List CRUD operations
│   ├── items.router.ts    # Item CRUD operations
│   └── ai.router.ts       # AI-powered features
├── home/                  # Home Automation module (Epic 3) ✅
│   ├── CLAUDE.md          # Module-specific instructions
│   ├── router.ts          # Main router (5-router pattern)
│   ├── config.router.ts   # HA connection config
│   ├── entities.router.ts # Entity queries
│   ├── actions.router.ts  # Service calls
│   ├── favorites.router.ts # User favorites
│   └── scenes.router.ts   # Custom scenes
└── recipes/               # Recipes module (Epic 4) ✅
    ├── CLAUDE.md          # Module-specific instructions
    ├── router.ts          # Main router (7-router pattern)
    ├── preferences.router.ts # User preferences
    ├── suggestions.router.ts # AI suggestions (legacy)
    ├── meals.router.ts    # Accepted meals
    ├── shopping.router.ts # Ingredient aggregation
    ├── schedule.router.ts # Auto-suggestion scheduling
    ├── history.router.ts  # Recipe/batch history
    └── wizard/            # Multi-step batch wizard (12 files)
        ├── index.ts       # Flat router combining all procedures
        ├── session.router.ts  # start, abandon, getSession
        ├── step1.router.ts    # Manage previous batch
        ├── step2.router.ts    # AI suggestions (combines sub-routers)
        ├── step3.router.ts    # Shopping integration
        ├── step4.router.ts    # Completion summary
        ├── batches.router.ts  # Batch history
        └── helpers.ts         # Shared utilities
```

## Real Example: Shopping Module

The shopping module demonstrates the **3-router pattern** for larger modules:

```typescript
// shopping/router.ts - Main entry point
export const shoppingRouter = router({
  lists: listsRouter,    // List CRUD
  items: itemsRouter,    // Item operations
  ai: aiRouter,          // AI features
});

// Usage:
trpc.shopping.lists.getDefault.useQuery();
trpc.shopping.items.add.useMutation();
trpc.shopping.ai.expand.useMutation();
```

**For complete shopping module documentation, see `shopping/CLAUDE.md`.**

## Creating a New Module

### Step 1: Plan the Module

Check `docs/epics/<epic>/PLAN.md` for the module plan. Understand:
- Data models
- API requirements
- Real-time events
- AI features

### Step 2: Create Database Schema

```typescript
// apps/api/src/db/schema/shopping-list.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users';

// Main table
export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  description: text('description'),
  householdId: text('household_id').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Related table
export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: integer('quantity'),
  unit: text('unit'),
  category: text('category'),
  checked: integer('checked', { mode: 'boolean' }).default(false),
  checkedBy: text('checked_by').references(() => users.id),
  checkedAt: text('checked_at'),
  sortOrder: integer('sort_order').default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Relations (for Drizzle query API)
export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  creator: one(users, { fields: [shoppingLists.createdBy], references: [users.id] }),
  items: many(shoppingItems),
}));

export const shoppingItemsRelations = relations(shoppingItems, ({ one }) => ({
  list: one(shoppingLists, { fields: [shoppingItems.listId], references: [shoppingLists.id] }),
  checkedByUser: one(users, { fields: [shoppingItems.checkedBy], references: [users.id] }),
}));
```

Export from schema index:
```typescript
// apps/api/src/db/schema/index.ts
export * from './users';
export * from './settings';
export * from './modules';
export * from './shopping-list';  // Add this
```

Run migrations:
```bash
pnpm --filter @honeydo/api db:generate
pnpm --filter @honeydo/api db:migrate
```

### Step 3: Add Shared Types and Schemas

```typescript
// packages/shared/src/types/index.ts
export interface ShoppingList {
  id: string;
  name: string;
  description: string | null;
  householdId: string;
  createdBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
// packages/shared/src/schemas/index.ts
export const createShoppingListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const createShoppingItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const updateShoppingItemSchema = createShoppingItemSchema
  .omit({ listId: true })
  .partial();

export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
```

### Step 4: Create Service Layer

```typescript
// apps/api/src/modules/shopping-list/service.ts
import { db } from '../../db';
import { shoppingLists, shoppingItems } from '../../db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import type { CreateShoppingListInput, CreateShoppingItemInput } from '@honeydo/shared';

export const shoppingListService = {
  // Lists
  async getAllLists(householdId: string) {
    return db.query.shoppingLists.findMany({
      where: and(
        eq(shoppingLists.householdId, householdId),
        eq(shoppingLists.isArchived, false)
      ),
      orderBy: desc(shoppingLists.updatedAt),
    });
  },

  async getListById(id: string) {
    return db.query.shoppingLists.findFirst({
      where: eq(shoppingLists.id, id),
      with: { items: { orderBy: [asc(shoppingItems.sortOrder)] } },
    });
  },

  async createList(input: CreateShoppingListInput & { householdId: string; createdBy: string }) {
    const [list] = await db.insert(shoppingLists).values(input).returning();
    return list;
  },

  async deleteList(id: string) {
    await db.delete(shoppingLists).where(eq(shoppingLists.id, id));
  },

  // Items
  async addItem(input: CreateShoppingItemInput) {
    const maxOrder = await db.query.shoppingItems.findFirst({
      where: eq(shoppingItems.listId, input.listId),
      orderBy: desc(shoppingItems.sortOrder),
    });
    const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;

    const [item] = await db.insert(shoppingItems)
      .values({ ...input, sortOrder })
      .returning();
    return item;
  },

  async checkItem(itemId: string, checked: boolean, userId: string) {
    const [item] = await db.update(shoppingItems)
      .set({
        checked,
        checkedBy: checked ? userId : null,
        checkedAt: checked ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(shoppingItems.id, itemId))
      .returning();
    return item;
  },

  async deleteItem(itemId: string) {
    await db.delete(shoppingItems).where(eq(shoppingItems.id, itemId));
  },
};
```

### Step 5: Create tRPC Router

```typescript
// apps/api/src/modules/shopping-list/router.ts
import { router, protectedProcedure } from '../../trpc';
import { z } from 'zod';
import {
  createShoppingListSchema,
  createShoppingItemSchema,
  updateShoppingItemSchema,
} from '@honeydo/shared/schemas';
import { shoppingListService } from './service';
import { emitToHousehold } from '../../services/websocket/emitter';
import { TRPCError } from '@trpc/server';

export const shoppingListRouter = router({
  // === Lists ===
  getLists: protectedProcedure.query(async ({ ctx }) => {
    return shoppingListService.getAllLists(ctx.user.householdId);
  }),

  getList: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const list = await shoppingListService.getListById(input.id);
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });
      }
      return list;
    }),

  createList: protectedProcedure
    .input(createShoppingListSchema)
    .mutation(async ({ ctx, input }) => {
      const list = await shoppingListService.createList({
        ...input,
        householdId: ctx.user.householdId,
        createdBy: ctx.userId,
      });

      emitToHousehold(ctx.user.householdId, 'shopping:list:created', list);
      return list;
    }),

  deleteList: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await shoppingListService.deleteList(input.id);
      emitToHousehold(ctx.user.householdId, 'shopping:list:deleted', { id: input.id });
    }),

  // === Items ===
  addItem: protectedProcedure
    .input(createShoppingItemSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await shoppingListService.addItem(input);
      emitToHousehold(ctx.user.householdId, 'shopping:item:added', item);
      return item;
    }),

  checkItem: protectedProcedure
    .input(z.object({ itemId: z.string(), checked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const item = await shoppingListService.checkItem(
        input.itemId,
        input.checked,
        ctx.userId
      );
      emitToHousehold(ctx.user.householdId, 'shopping:item:checked', {
        itemId: input.itemId,
        checked: input.checked,
        checkedBy: ctx.userId,
      });
      return item;
    }),

  deleteItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await shoppingListService.deleteItem(input.itemId);
      emitToHousehold(ctx.user.householdId, 'shopping:item:deleted', { id: input.itemId });
    }),
});
```

### Step 6: Register Router

```typescript
// apps/api/src/trpc/router.ts
import { router } from './index';
import { userRouter } from '../modules/user/router';
import { settingsRouter } from '../modules/settings/router';
import { shoppingListRouter } from '../modules/shopping-list/router';  // Add

export const appRouter = router({
  user: userRouter,
  settings: settingsRouter,
  shoppingList: shoppingListRouter,  // Add
});

export type AppRouter = typeof appRouter;
```

### Step 7: Add WebSocket Events (Optional)

```typescript
// apps/api/src/modules/shopping-list/events.ts
import { Server, Socket } from 'socket.io';

export function registerShoppingListEvents(io: Server, socket: Socket) {
  // Subscribe to list updates
  socket.on('shopping:subscribe', ({ listId }) => {
    socket.join(`shopping:list:${listId}`);
  });

  socket.on('shopping:unsubscribe', ({ listId }) => {
    socket.leave(`shopping:list:${listId}`);
  });
}
```

Register in WebSocket handlers:
```typescript
// apps/api/src/services/websocket/handlers.ts
import { registerShoppingListEvents } from '../../modules/shopping-list/events';

export function registerHandlers(io: Server, socket: Socket) {
  // ... existing handlers
  registerShoppingListEvents(io, socket);
}
```

### Step 8: Add AI Features (Optional)

```typescript
// apps/api/src/modules/shopping-list/ai.ts
import { aiService } from '../../services/ai';

export const shoppingListAI = {
  async expandItem(itemName: string, existingItems: string[]) {
    const prompt = `
      The user wants to add "${itemName}" to their shopping list.
      Existing items: ${existingItems.join(', ')}

      If this is a vague item like "taco stuff" or "breakfast", expand it into specific ingredients.
      If it's already specific, return it as-is.

      Return JSON: { "items": ["item1", "item2", ...] }
    `;

    return aiService.json<{ items: string[] }>(prompt);
  },

  async categorizeItems(items: string[]) {
    const prompt = `
      Categorize these shopping items into store sections:
      ${items.join(', ')}

      Return JSON: { "categorized": { "category": ["item1", ...], ... } }
    `;

    return aiService.json<{ categorized: Record<string, string[]> }>(prompt);
  },

  async suggestItems(recentItems: string[], currentList: string[]) {
    const prompt = `
      Based on recent purchases: ${recentItems.join(', ')}
      Current list: ${currentList.join(', ')}

      Suggest 3-5 items they might have forgotten.
      Return JSON: { "suggestions": ["item1", ...] }
    `;

    return aiService.json<{ suggestions: string[] }>(prompt);
  },
};
```

## Inter-Module Communication

Modules should NOT import from each other directly. Use events:

```typescript
// In shopping-list module - emit event when list is completed
import { eventBus } from '../../services/events';

async function completeList(listId: string) {
  // ... complete list logic
  eventBus.emit('shopping:list:completed', { listId, items });
}

// In recipes module - listen for shopping list events
eventBus.on('shopping:list:completed', async ({ listId, items }) => {
  // Maybe update meal plan status or suggest recipes
});
```

## Module Checklist

When creating a new module:

- [ ] Database schema in `apps/api/src/db/schema/`
- [ ] Export schema from `apps/api/src/db/schema/index.ts`
- [ ] Run migrations (`db:generate`, `db:migrate`)
- [ ] Types in `packages/shared/src/types/`
- [ ] Zod schemas in `packages/shared/src/schemas/`
- [ ] Service layer in `apps/api/src/modules/<module>/service.ts`
- [ ] tRPC router in `apps/api/src/modules/<module>/router.ts`
- [ ] Register router in `apps/api/src/trpc/router.ts`
- [ ] WebSocket events in `apps/api/src/modules/<module>/events.ts` (if needed)
- [ ] AI features in `apps/api/src/modules/<module>/ai.ts` (if needed)
- [ ] Update documentation

## Files to Reference

- Master plan: `docs/PLAN.md`
- Module plans: `docs/epics/<n>-<module>/PLAN.md`
- Feature specs: `docs/epics/<n>-<module>/features/*/PLAN.md`
- Shopping module (real example): `apps/api/src/modules/shopping/CLAUDE.md`
- Existing modules: `apps/api/src/modules/user/`, `apps/api/src/modules/settings/`
- DB patterns: `apps/api/src/db/CLAUDE.md`
- Shared schemas: `packages/shared/src/schemas/CLAUDE.md`
- Shared constants: `packages/shared/src/constants/CLAUDE.md`
