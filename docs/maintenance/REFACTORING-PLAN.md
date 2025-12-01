# HoneyDo Refactoring Plan

> Identified refactoring opportunities organized by phase and priority.

**Created**: 2025-11-29
**Status**: Planning

---

## Phase 1: Quick Wins (1-2 hours total)

Low effort, high impact changes that reduce code duplication immediately.

### 1.1 Create `haConnectedProcedure` Middleware

**Effort**: 15 min | **Value**: High | **Lines Removed**: ~35

**Problem**: 7 identical connection checks duplicated across `actions.router.ts`:
- Lines 13-17, 37-42, 60-65, 77-82, 100-106, 135-141, 170-176

**Solution**: Create a tRPC middleware procedure.

```typescript
// apps/api/src/modules/home/procedures.ts
import { protectedProcedure } from '../../trpc/procedures';
import { TRPCError } from '@trpc/server';
import { isHAConnected } from '../../services/homeassistant';

export const haConnectedProcedure = protectedProcedure.use(async ({ next }) => {
  if (!isHAConnected()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Not connected to Home Assistant',
    });
  }
  return next();
});
```

**Files to Update**:
- Create `apps/api/src/modules/home/procedures.ts`
- Update `apps/api/src/modules/home/actions.router.ts` - replace 7 checks

---

### 1.2 Create `updateListTimestamp` Helper

**Effort**: 10 min | **Value**: Medium | **Lines Removed**: ~28

**Problem**: 7 identical timestamp update blocks in `items.router.ts`:
- Lines 99-103, 150-153, 195-199, 237-240, 271-275, 313-317, 342-346

**Solution**: Extract to helper function.

```typescript
// apps/api/src/modules/shopping/helpers.ts
import { eq } from 'drizzle-orm';
import { shoppingLists } from '../../db/schema';
import type { DB } from '../../db';

export async function updateListTimestamp(db: DB, listId: string) {
  await db
    .update(shoppingLists)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(shoppingLists.id, listId));
}
```

**Files to Update**:
- Create `apps/api/src/modules/shopping/helpers.ts`
- Update `apps/api/src/modules/shopping/items.router.ts` - replace 7 blocks

---

### 1.3 Extract `extractDomain` Helper

**Effort**: 5 min | **Value**: Low | **Lines Removed**: ~5

**Problem**: `entityId.split('.')[0]` repeated 5 times in `actions.router.ts`:
- Lines 67, 84, 109, 143, 178

**Solution**: Create simple helper.

```typescript
// apps/api/src/modules/home/helpers.ts
export function extractDomain(entityId: string): string {
  return entityId.split('.')[0];
}
```

**Files to Update**:
- Create `apps/api/src/modules/home/helpers.ts`
- Update `apps/api/src/modules/home/actions.router.ts` - replace 5 occurrences

---

### 1.4 Move Item Expansions to External File

**Effort**: 15 min | **Value**: Low | **Improves**: Maintainability

**Problem**: 50+ lines of hardcoded item expansions inside `ai.router.ts` (lines 61-116).

**Solution**: Move to dedicated data file.

```typescript
// apps/api/src/modules/shopping/expansions.ts
import type { ShoppingCategoryId } from '@honeydo/shared';

interface ExpansionItem {
  name: string;
  quantity?: number;
  unit?: string;
  category: ShoppingCategoryId;
}

export const ITEM_EXPANSIONS: Record<string, ExpansionItem[]> = {
  taco: [
    { name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' },
    { name: 'Taco shells', quantity: 1, unit: 'box', category: 'pantry' },
    // ... rest of expansions
  ],
  // ... other expansions
};

export const EXPANDABLE_PATTERNS = Object.keys(ITEM_EXPANSIONS);
```

**Files to Update**:
- Create `apps/api/src/modules/shopping/expansions.ts`
- Update `apps/api/src/modules/shopping/ai.router.ts` - import and use

---

## Phase 2: Event System Improvements (2-3 hours total)

Improve maintainability of the WebSocket event system.

### 2.1 Create Shared Event Constants

**Effort**: 45 min | **Value**: High | **Prevents**: Typos, improves refactoring

**Problem**: Event names are magic strings scattered across:
- Backend emitters: `socketEmitter.toOthers(userId, 'shopping:item:added', ...)`
- Frontend listeners: `useSocketEvent('shopping:item:added', handler)`

**Solution**: Centralize event name constants.

```typescript
// packages/shared/src/events.ts

// Shopping Events
export const SHOPPING_EVENTS = {
  // Lists
  LIST_CREATED: 'shopping:list:created',
  LIST_UPDATED: 'shopping:list:updated',
  LIST_ARCHIVED: 'shopping:list:archived',
  // Items
  ITEM_ADDED: 'shopping:item:added',
  ITEMS_ADDED: 'shopping:items:added',
  ITEM_UPDATED: 'shopping:item:updated',
  ITEM_REMOVED: 'shopping:item:removed',
  ITEM_CHECKED: 'shopping:item:checked',
  ITEMS_CLEARED: 'shopping:items:cleared',
  ITEMS_REORDERED: 'shopping:items:reordered',
} as const;

// Home Automation Events
export const HOME_EVENTS = {
  CONNECTION_STATUS: 'home:connection:status',
  ENTITY_STATE_CHANGED: 'home:entity:state-changed',
  ACTION_EXECUTED: 'home:action:executed',
  SCENE_ACTIVATED: 'home:scene:activated',
  SCENE_CREATED: 'home:scene:created',
  SCENE_UPDATED: 'home:scene:updated',
  SCENE_DELETED: 'home:scene:deleted',
} as const;

// Recipes Events
export const RECIPES_EVENTS = {
  SUGGESTIONS_RECEIVED: 'recipes:suggestions:received',
  SUGGESTIONS_EXPIRED: 'recipes:suggestions:expired',
  MEAL_ACCEPTED: 'recipes:meal:accepted',
  MEAL_UPDATED: 'recipes:meal:updated',
  MEAL_REMOVED: 'recipes:meal:removed',
  PREFERENCES_UPDATED: 'recipes:preferences:updated',
} as const;

// Type helpers
export type ShoppingEvent = typeof SHOPPING_EVENTS[keyof typeof SHOPPING_EVENTS];
export type HomeEvent = typeof HOME_EVENTS[keyof typeof HOME_EVENTS];
export type RecipesEvent = typeof RECIPES_EVENTS[keyof typeof RECIPES_EVENTS];
```

**Files to Update**:
- Create `packages/shared/src/events.ts`
- Export from `packages/shared/src/index.ts`
- Update all backend emitters (shopping, home, recipes modules)
- Update all frontend listeners (use-shopping-sync, use-home-sync, use-recipes-sync)

---

### 2.2 Create Event Payload Types

**Effort**: 30 min | **Value**: Medium | **Improves**: Type safety

**Problem**: Event payloads are typed inline at each usage site.

**Solution**: Define payload types alongside event constants.

```typescript
// packages/shared/src/events.ts (continued)

import type { ShoppingItem, ShoppingList, HAScene } from './types';

// Shopping Payloads
export interface ShoppingEventPayloads {
  [SHOPPING_EVENTS.LIST_CREATED]: ShoppingList;
  [SHOPPING_EVENTS.LIST_UPDATED]: ShoppingList;
  [SHOPPING_EVENTS.LIST_ARCHIVED]: { id: string };
  [SHOPPING_EVENTS.ITEM_ADDED]: ShoppingItem;
  [SHOPPING_EVENTS.ITEMS_ADDED]: ShoppingItem[];
  [SHOPPING_EVENTS.ITEM_UPDATED]: ShoppingItem;
  [SHOPPING_EVENTS.ITEM_REMOVED]: { id: string; listId: string };
  [SHOPPING_EVENTS.ITEM_CHECKED]: {
    id: string;
    listId: string;
    checked: boolean;
    checkedBy: string | null;
    checkedAt: string | null;
  };
  [SHOPPING_EVENTS.ITEMS_CLEARED]: { listId: string; itemIds: string[] };
  [SHOPPING_EVENTS.ITEMS_REORDERED]: { listId: string; itemIds: string[] };
}

// Home Payloads
export interface HomeEventPayloads {
  [HOME_EVENTS.CONNECTION_STATUS]: { connected: boolean; error?: string };
  [HOME_EVENTS.ENTITY_STATE_CHANGED]: {
    entityId: string;
    oldState: string;
    newState: string;
    attributes: Record<string, unknown>;
  };
  // ... etc
}
```

---

## Phase 3: Code Consolidation (3-4 hours total)

Larger refactoring efforts to reduce boilerplate.

### 3.1 Create WebSocket Sync Hook Factory

**Effort**: 2 hours | **Value**: High | **Lines Removed**: ~150

**Problem**: Three sync hooks follow identical patterns:
- `apps/web/src/modules/shopping/hooks/use-shopping-sync.ts` (194 lines)
- `apps/web/src/modules/home/hooks/use-home-sync.ts` (~120 lines)
- `apps/web/src/modules/recipes/hooks/use-recipes-sync.ts` (~90 lines)

Each follows this pattern:
1. Create `useCallback` handlers
2. Call `useSocketEvent` for each handler
3. Return invalidation helpers

**Solution**: Create a generic hook factory.

```typescript
// apps/web/src/hooks/use-create-sync-hook.ts
import { useCallback, useMemo } from 'react';
import { useSocketEvent } from '@/services/socket/hooks';

type EventHandler<T = unknown> = (data: T) => void;

interface EventConfig<T = unknown> {
  event: string;
  handler: (utils: unknown, data: T) => void;
  enabled?: boolean;
}

export function useCreateSyncHook<TUtils>(
  utils: TUtils,
  events: EventConfig[],
  deps: unknown[] = []
) {
  const handlers = useMemo(() =>
    events.map(config => ({
      event: config.event,
      handler: useCallback(
        (data: unknown) => config.handler(utils, data),
        [utils, ...deps]
      ),
      enabled: config.enabled ?? true,
    })),
    [utils, events, ...deps]
  );

  handlers.forEach(({ event, handler, enabled }) => {
    if (enabled) {
      useSocketEvent(event, handler);
    }
  });
}
```

**Then simplify each module's sync hook**:

```typescript
// apps/web/src/modules/shopping/hooks/use-shopping-sync.ts
import { useCreateSyncHook } from '@/hooks/use-create-sync-hook';
import { SHOPPING_EVENTS } from '@honeydo/shared';

export function useShoppingSync({ listId }: { listId?: string } = {}) {
  const utils = trpc.useUtils();

  useCreateSyncHook(utils, [
    {
      event: SHOPPING_EVENTS.ITEM_ADDED,
      handler: (utils, item: ShoppingItem) => {
        if (!listId || item.listId !== listId) return;
        utils.shopping.items.getByList.setData({ listId }, old =>
          old ? [...old, item] : [item]
        );
      },
    },
    // ... other events
  ], [listId]);

  return {
    invalidateList: () => { /* ... */ },
    invalidateAll: () => { /* ... */ },
  };
}
```

---

### 3.2 Extract Skill Input Builder

**Effort**: 45 min | **Value**: Medium | **Lines Removed**: ~100

**Problem**: Skill input building logic duplicated in `suggestions.router.ts`:
- `request` procedure: lines 43-112
- `retry` procedure: lines 477-545

**Solution**: Extract to helper function.

```typescript
// apps/api/src/modules/recipes/helpers.ts
import type { SkillInput } from './types';

interface BuildSkillInputParams {
  userId: string;
  db: DB;
  dateRange: { startDate: string; endDate: string };
  mealTypes: string[];
}

export async function buildSkillInput({
  userId,
  db,
  dateRange,
  mealTypes,
}: BuildSkillInputParams): Promise<SkillInput> {
  // Fetch preferences
  const prefs = await db.query.mealPreferences.findFirst({
    where: eq(mealPreferences.userId, userId),
  });

  // Fetch ingredients
  const ingredients = await db.query.ingredientPreferences.findMany({
    where: eq(ingredientPreferences.userId, userId),
  });

  // Fetch notes
  const notes = await db.query.freeformNotes.findMany({
    where: eq(freeformNotes.userId, userId),
  });

  // Fetch recent meals
  const recentMeals = await db.query.acceptedMeals.findMany({
    where: and(
      eq(acceptedMeals.userId, userId),
      gte(acceptedMeals.date, /* 14 days ago */)
    ),
    orderBy: desc(acceptedMeals.date),
    limit: 21,
  });

  // Build and return skill input
  return {
    dateRange,
    mealTypes,
    cuisinePreferences: prefs?.cuisinePreferences ?? [],
    dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
    // ... rest of transformation
  };
}
```

**Files to Update**:
- Create/update `apps/api/src/modules/recipes/helpers.ts`
- Update `apps/api/src/modules/recipes/suggestions.router.ts` - use helper in both procedures

---

### 3.3 Fix Async Error Handling in Suggestions

**Effort**: 30 min | **Value**: High | **Prevents**: Silent failures

**Problem**: Background operations use `.then().catch()` that doesn't catch all errors:
- `suggestions.router.ts` lines 118-175, 548-590
- If DB update inside `.then()` fails, it's unhandled

**Solution**: Refactor to proper async/await with try/catch.

```typescript
// Before (problematic)
mealSuggestionsService.getSuggestions(skillInput)
  .then(async (output) => {
    await ctx.db.update(...); // If this throws, unhandled!
    socketEmitter.toUser(...);
  })
  .catch(async (error) => {
    await ctx.db.update(...);
  });

// After (correct)
const processSuggestions = async () => {
  try {
    const output = await mealSuggestionsService.getSuggestions(skillInput);
    await ctx.db.update(mealSuggestions)
      .set({ status: 'received', suggestions: output.suggestions })
      .where(eq(mealSuggestions.id, suggestion.id));
    socketEmitter.toUser(userId, RECIPES_EVENTS.SUGGESTIONS_RECEIVED, { ... });
  } catch (error) {
    console.error('[Recipes] Suggestion failed:', error);
    await ctx.db.update(mealSuggestions)
      .set({ status: 'expired', error: String(error) })
      .where(eq(mealSuggestions.id, suggestion.id));
    socketEmitter.toUser(userId, RECIPES_EVENTS.SUGGESTIONS_EXPIRED, { ... });
  }
};

// Fire and forget (intentional)
processSuggestions();
```

---

## Phase 4: Type Safety Improvements (1-2 hours total)

### 4.1 Add Zod Validation for JSON Fields

**Effort**: 30 min | **Value**: Medium | **Prevents**: Runtime errors

**Problem**: Unsafe type casting when reading JSON from database:
- `suggestions.router.ts:126`: `suggestion.suggestions as MealSuggestionItem[]`
- Similar patterns in lines 245, 313, 354, 410

**Solution**: Validate with Zod before use.

```typescript
// packages/shared/src/schemas/recipes.ts
export const mealSuggestionItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  prepTime: z.number(),
  cookTime: z.number(),
  servings: z.number(),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.string(),
    unit: z.string().optional(),
  })),
  instructions: z.array(z.string()),
  // ... etc
});

export const mealSuggestionsArraySchema = z.array(mealSuggestionItemSchema);
```

```typescript
// Usage in router
import { mealSuggestionsArraySchema } from '@honeydo/shared';

const parseResult = mealSuggestionsArraySchema.safeParse(suggestion.suggestions);
if (!parseResult.success) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Invalid suggestion data format',
  });
}
const meals = parseResult.data;
```

---

## Summary

| Phase | Effort | Items | Impact |
|-------|--------|-------|--------|
| **Phase 1** | 1-2 hours | 4 items | ~70 lines removed, better organization |
| **Phase 2** | 2-3 hours | 2 items | Type-safe events, no magic strings |
| **Phase 3** | 3-4 hours | 3 items | ~250 lines removed, better error handling |
| **Phase 4** | 1-2 hours | 1 item | Runtime error prevention |

**Total Estimated Effort**: 7-11 hours

---

## Checklist

### Phase 1 ✅
- [x] 1.1 Create `haConnectedProcedure` middleware
- [x] 1.2 Create `updateListTimestamp` helper
- [x] 1.3 Extract `extractDomain` helper
- [x] 1.4 Move item expansions to external file

### Phase 2
- [ ] 2.1 Create shared event constants
- [ ] 2.2 Create event payload types

### Phase 3
- [ ] 3.1 Create WebSocket sync hook factory
- [ ] 3.2 Extract skill input builder
- [ ] 3.3 Fix async error handling in suggestions

### Phase 4
- [ ] 4.1 Add Zod validation for JSON fields
