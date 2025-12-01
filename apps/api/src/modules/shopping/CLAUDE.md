# Shopping Module - Claude Code Instructions

> Backend implementation of the Shopping List feature (Epic 2)

## Module Overview

The Shopping module provides a complete shopping list experience with:
- **List Management**: Create, read, update, archive shopping lists
- **Item Management**: Add, edit, check, delete items with categories
- **Real-time Sync**: WebSocket events for multi-user collaboration
- **AI Features**: Item expansion, auto-categorization, suggestions
- **Google Keep Prep**: Schema ready for future Google Keep sync

## Module Architecture

```
apps/api/src/modules/shopping/
├── CLAUDE.md           # This file
├── index.ts            # Module exports
├── router.ts           # Main router (combines sub-routers)
├── lists.router.ts     # List CRUD operations
├── items.router.ts     # Item CRUD operations
└── ai.router.ts        # AI-powered features
```

### Router Structure

The shopping module uses a **3-router pattern** for better organization:

```typescript
// router.ts - Main entry point
export const shoppingRouter = router({
  lists: listsRouter,    // List operations
  items: itemsRouter,    // Item operations
  ai: aiRouter,          // AI features
});
```

**Usage from frontend:**
```typescript
trpc.shopping.lists.getDefault.useQuery();
trpc.shopping.items.add.useMutation();
trpc.shopping.ai.expand.useMutation();
```

## API Reference

### Lists Router (`lists.router.ts`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getAll` | Query | - | Get all non-archived lists |
| `getDefault` | Query | - | Get default list with items (auto-creates if none) |
| `getById` | Query | `{ id }` | Get list by ID with items |
| `create` | Mutation | `{ name }` | Create new list |
| `update` | Mutation | `{ id, name?, googleKeepId?, googleKeepSyncEnabled? }` | Update list |
| `archive` | Mutation | `{ id }` | Archive list (soft delete) |
| `restore` | Mutation | `{ id }` | Restore archived list |
| `getArchived` | Query | - | Get all archived lists |

**Key Behaviors:**
- Default list is auto-created on first `getDefault` call
- Cannot archive the default list
- Items are ordered: unchecked first by `sortOrder`, then checked

### Items Router (`items.router.ts`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getByList` | Query | `{ listId }` | Get all items for a list |
| `add` | Mutation | `{ listId, name, quantity?, unit?, category?, note? }` | Add single item |
| `addBulk` | Mutation | `{ listId, items[] }` | Add multiple items at once |
| `update` | Mutation | `{ id, name?, quantity?, unit?, category?, note? }` | Update item |
| `check` | Mutation | `{ id, checked }` | Check/uncheck item |
| `remove` | Mutation | `{ id }` | Delete item |
| `clearChecked` | Mutation | `{ listId }` | Remove all checked items |
| `reorder` | Mutation | `{ listId, itemIds[] }` | Reorder items |
| `getFrequent` | Query | `{ limit? }` | Get frequently added items for suggestions |

**Key Behaviors:**
- New items get `sortOrder` at end of unchecked items
- Checking an item records `checkedBy` and `checkedAt`
- All mutations update the list's `updatedAt` timestamp
- `trackFrequentItem()` is called on add for AI suggestions

### AI Router (`ai.router.ts`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `expand` | Mutation | `{ itemName, existingItems? }` | Expand vague item (e.g., "taco stuff") |
| `categorize` | Mutation | `{ itemName }` | Get category for single item |
| `suggest` | Query | `{ currentItems[] }` | Get AI suggestions based on patterns |
| `batchCategorize` | Mutation | `{ items[] }` | Categorize multiple items |

**Rate Limiting:**
- 50 calls per hour per user
- Throws `TOO_MANY_REQUESTS` when exceeded

**Current Implementation:**
- Uses rule-based logic (not actual AI yet)
- Hardcoded expansions for common items (tacos, breakfast, pasta, etc.)
- Keyword-based categorization
- Ready for Anthropic SDK integration

## WebSocket Events

All events are emitted via `socketEmitter.toOthers(userId, event, data)` to broadcast to other household members.

### List Events

| Event | Payload | Emitted When |
|-------|---------|--------------|
| `shopping:list:created` | `ShoppingList` | List created or restored |
| `shopping:list:updated` | `ShoppingList` | List name or settings changed |
| `shopping:list:archived` | `{ id }` | List archived |

### Item Events

| Event | Payload | Emitted When |
|-------|---------|--------------|
| `shopping:item:added` | `ShoppingItem` | Single item added |
| `shopping:items:added` | `ShoppingItem[]` | Bulk items added |
| `shopping:item:updated` | `ShoppingItem` | Item edited |
| `shopping:item:checked` | `{ id, listId, checked, checkedBy, checkedAt }` | Item checked/unchecked |
| `shopping:item:removed` | `{ id, listId }` | Item deleted |
| `shopping:items:cleared` | `{ listId, itemIds[] }` | Checked items cleared |
| `shopping:items:reordered` | `{ listId, itemIds[] }` | Items reordered |

## Database Schema

See `apps/api/src/db/schema/shopping.ts` for complete schema.

### Tables

| Table | Purpose |
|-------|---------|
| `shopping_lists` | List metadata, default flag, Google Keep sync fields |
| `shopping_items` | Items with category, check state, user tracking |
| `shopping_frequent_items` | Tracks item usage for suggestions |
| `shopping_sync_log` | Debug log for future Google Keep sync |
| `google_keep_credentials` | Encrypted credentials for Keep sync |

### Key Columns

**shopping_lists:**
- `isDefault` - Only one list can be default
- `isArchived` - Soft delete flag
- `googleKeepId`, `googleKeepSyncEnabled` - Future sync support

**shopping_items:**
- `category` - Typed as `ShoppingCategoryId` (12 categories)
- `checked`, `checkedAt`, `checkedBy` - Check state with audit
- `addedBy` - Who added the item
- `sortOrder` - For manual ordering

## Code Patterns

### Adding Items with Frequency Tracking

```typescript
// Helper function for AI suggestions
async function trackFrequentItem(
  userId: string,
  itemName: string,
  category: ShoppingCategoryId | null
) {
  const normalized = itemName.toLowerCase().trim();

  const existing = await db.query.shoppingFrequentItems.findFirst({
    where: and(
      eq(shoppingFrequentItems.userId, userId),
      eq(shoppingFrequentItems.itemName, normalized)
    ),
  });

  if (existing) {
    await db.update(shoppingFrequentItems)
      .set({
        useCount: existing.useCount + 1,
        lastUsedAt: new Date().toISOString(),
        category: category ?? existing.category,
      })
      .where(eq(shoppingFrequentItems.id, existing.id));
  } else {
    await db.insert(shoppingFrequentItems).values({
      userId,
      itemName: normalized,
      category,
    });
  }
}
```

### Emitting WebSocket Events

```typescript
// In mutation handler
.mutation(async ({ ctx, input }) => {
  const [item] = await ctx.db.insert(shoppingItems)
    .values({ ... })
    .returning();

  // Broadcast to other household members (not the current user)
  socketEmitter.toOthers(ctx.userId, 'shopping:item:added', {
    ...item,
    checkedAt: item.checkedAt,
    googleKeepItemId: item.googleKeepItemId,
  });

  return item;
});
```

### Rate Limiting Pattern

```typescript
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 50;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return;
  }

  if (userLimit.count >= RATE_LIMIT) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Try again in ${Math.ceil((userLimit.resetAt - now) / 60000)} minutes.`,
    });
  }

  userLimit.count++;
}
```

## Zod Schemas

All input schemas are in `packages/shared/src/schemas/shopping.ts`:

| Schema | Used By |
|--------|---------|
| `createShoppingListSchema` | `lists.create` |
| `updateShoppingListSchema` | `lists.update` |
| `createShoppingItemSchema` | `items.add` |
| `updateShoppingItemSchema` | `items.update` |
| `checkShoppingItemSchema` | `items.check` |
| `bulkAddItemsSchema` | `items.addBulk` |
| `reorderItemsSchema` | `items.reorder` |
| `clearCheckedItemsSchema` | `items.clearChecked` |
| `expandItemSchema` | `ai.expand` |
| `categorizeItemSchema` | `ai.categorize` |
| `suggestItemsSchema` | `ai.suggest` |
| `batchCategorizeSchema` | `ai.batchCategorize` |

## Future: AI Integration

The `ai.router.ts` is ready for Anthropic SDK integration:

```typescript
// TODO: Replace aiService with actual Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function expandItem(itemName: string, existingItems: string[]) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Expand "${itemName}" into specific shopping items.
        Existing items to avoid: ${existingItems.join(', ')}.
        Return JSON: { "items": [{ "name": "...", "category": "..." }] }`
    }],
  });

  return JSON.parse(response.content[0].text);
}
```

## Future: Google Keep Sync

Schema is prepared with:
- `googleKeepId` on lists and items
- `googleKeepSyncEnabled` flag
- `lastSyncedAt` timestamp
- `shopping_sync_log` for debugging
- `google_keep_credentials` for auth storage

Implementation pending.

## Testing

```typescript
// Example test
describe('shopping.items.add', () => {
  it('adds item with correct sortOrder', async () => {
    const caller = createCaller({ userId: 'user1' });

    const item1 = await caller.shopping.items.add({
      listId: 'list1',
      name: 'Milk',
    });

    const item2 = await caller.shopping.items.add({
      listId: 'list1',
      name: 'Eggs',
    });

    expect(item2.sortOrder).toBeGreaterThan(item1.sortOrder);
  });

  it('tracks frequent items', async () => {
    const caller = createCaller({ userId: 'user1' });

    await caller.shopping.items.add({ listId: 'list1', name: 'Milk' });
    await caller.shopping.items.add({ listId: 'list1', name: 'Milk' });

    const frequent = await caller.shopping.items.getFrequent({ limit: 10 });
    const milk = frequent.find(f => f.itemName === 'milk');

    expect(milk?.useCount).toBe(2);
  });
});
```

## Files to Reference

- Database schema: `apps/api/src/db/schema/shopping.ts`
- Shared schemas: `packages/shared/src/schemas/shopping.ts`
- Categories: `packages/shared/src/constants/categories.ts`
- WebSocket emitter: `apps/api/src/services/websocket/emitter.ts`
- Feature plan: `docs/epics/2-shopping-list/PLAN.md`
