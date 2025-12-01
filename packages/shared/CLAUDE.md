# HoneyDo Shared Package - Claude Code Instructions

> Shared types, Zod schemas, constants, and utilities used by both `@honeydo/api` and `@honeydo/web`

## Purpose

This package is the **single source of truth** for:
- TypeScript interfaces and types
- Zod validation schemas
- Shared constants (categories, units)
- Shared utilities (future)

Changes here affect both frontend and backend, so be deliberate.

## Package Structure

```
packages/shared/src/
├── index.ts               # Main export (re-exports all)
├── types/
│   └── index.ts           # TypeScript type definitions
├── schemas/
│   ├── CLAUDE.md          # Schema-specific instructions
│   ├── index.ts           # Schema exports
│   ├── shopping.ts        # Shopping module schemas (Epic 2) ✅
│   ├── home-automation.ts # Home Automation schemas (Epic 3) ✅
│   └── recipes.ts         # Recipes/meal planning schemas (Epic 4) ✅
├── constants/
│   ├── CLAUDE.md          # Constants-specific instructions
│   ├── index.ts           # Constants exports
│   └── categories.ts      # Shopping categories and units (Epic 2) ✅
└── utils/                 # Shared utilities (future)
```

## Current Contents

| Area | Status | Contents |
|------|--------|----------|
| **Types** | ✅ Done | User, UserRole, UserPreferences, Module, WebSocket events, module types |
| **Schemas (Core)** | ✅ Done | User, preferences, module schemas |
| **Schemas (Shopping)** | ✅ Done | List, item, AI feature schemas |
| **Schemas (Home Automation)** | ✅ Done | Entity, service call, favorites, scenes schemas |
| **Schemas (Recipes)** | ✅ Done | Preferences, suggestions, meals, shopping, skill input/output schemas |
| **Constants (Shopping)** | ✅ Done | Categories (12), units (19) |

## Import Paths

```typescript
// From API or Web apps:
import { User, UserRole } from '@honeydo/shared';
import { userSchema, createListSchema } from '@honeydo/shared/schemas';
import type { ShoppingList } from '@honeydo/shared/types';

// Shopping-specific imports
import {
  // Types
  ShoppingList,
  ShoppingItem,
  ShoppingCategoryId,
  QuantityUnit,

  // Schemas
  createShoppingListSchema,
  createShoppingItemSchema,
  checkShoppingItemSchema,
  expandItemSchema,

  // Constants
  SHOPPING_CATEGORIES,
  CATEGORY_MAP,
  QUANTITY_UNITS,
  DEFAULT_CATEGORY,
} from '@honeydo/shared';
```

## Type Definitions

### Adding New Types

```typescript
// packages/shared/src/types/index.ts

// 1. Simple type aliases
export type ItemStatus = 'pending' | 'checked' | 'removed';

// 2. Interfaces for objects
export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// 3. Generic utility types
export type WithTimestamps<T> = T & {
  createdAt: string;
  updatedAt: string;
};

// 4. Pick/Omit for variations
export type ShoppingItemCreate = Omit<ShoppingItem, 'id' | 'createdAt' | 'updatedAt' | 'checkedAt' | 'checkedBy'>;
export type ShoppingItemUpdate = Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category' | 'notes'>>;
```

### Existing Types

| Type | Purpose |
|------|---------|
| `Theme` | `'light' \| 'dark' \| 'system'` |
| `UserRole` | `'admin' \| 'member' \| 'guest'` |
| `User` | Complete user object |
| `UserPreferences` | User preferences (theme, notifications) |
| `NotificationPreferences` | Notification settings |
| `Module` | Module definition |
| `UserModule` | Per-user module settings |
| `ServerToClientEvents` | Socket.io events (server → client) |
| `ClientToServerEvents` | Socket.io events (client → server) |
| `NotificationEvent` | Real-time notification payload |

## Zod Schemas

### Why Zod?

- **Runtime validation** - Validates data at runtime, not just compile time
- **Type inference** - Generate TypeScript types from schemas
- **Shared** - Same schema validates API input and form data
- **Composable** - Build complex schemas from simple ones

### Creating Schemas

```typescript
// packages/shared/src/schemas/index.ts
import { z } from 'zod';

// 1. Basic schema
export const shoppingItemSchema = z.object({
  id: z.string(),
  listId: z.string(),
  name: z.string().min(1, 'Name is required').max(200),
  quantity: z.number().positive().nullable(),
  unit: z.string().max(50).nullable(),
  category: z.string().max(100).nullable(),
  checked: z.boolean(),
  checkedAt: z.string().datetime().nullable(),
  checkedBy: z.string().nullable(),
  sortOrder: z.number().int(),
  notes: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// 2. Input schema (for creating)
export const createShoppingItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

// 3. Update schema (partial, all optional)
export const updateShoppingItemSchema = createShoppingItemSchema
  .omit({ listId: true })
  .partial();

// 4. Infer TypeScript types from schemas
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
```

### Schema Patterns

#### Enums
```typescript
export const statusSchema = z.enum(['active', 'completed', 'archived']);
export type Status = z.infer<typeof statusSchema>;
```

#### Arrays
```typescript
export const itemIdsSchema = z.array(z.string()).min(1);
```

#### Nested Objects
```typescript
export const listWithItemsSchema = shoppingListSchema.extend({
  items: z.array(shoppingItemSchema),
});
```

#### Refinements
```typescript
export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).refine(
  (data) => new Date(data.start) < new Date(data.end),
  { message: 'Start date must be before end date' }
);
```

#### Transforms
```typescript
export const trimmedStringSchema = z.string().transform(s => s.trim());

export const lowercaseEmailSchema = z.string()
  .email()
  .transform(s => s.toLowerCase());
```

### Existing Schemas

| Schema | Purpose |
|--------|---------|
| `themeSchema` | Theme enum |
| `userRoleSchema` | Role enum |
| `notificationPreferencesSchema` | Notification settings |
| `userPreferencesSchema` | Full user preferences |
| `updateUserPreferencesSchema` | Partial update |
| `userSchema` | Complete user |
| `moduleSchema` | Module definition |
| `userModuleSchema` | User-module mapping |
| `toggleModuleInputSchema` | Module toggle input |
| `updateModuleConfigInputSchema` | Module config update |

## WebSocket Event Types

### Server → Client Events

```typescript
export interface ServerToClientEvents {
  // System events
  pong: (data: { timestamp: number }) => void;
  'whoami:response': (data: { userId: string; rooms: string[] }) => void;
  'system:settings:updated': (data: { preferences: UserPreferences }) => void;
  'system:notification': (data: NotificationEvent) => void;

  // Shopping events (add when implementing)
  'shopping:list:created': (data: ShoppingList) => void;
  'shopping:list:updated': (data: ShoppingList) => void;
  'shopping:list:deleted': (data: { id: string }) => void;
  'shopping:item:added': (data: ShoppingItem) => void;
  'shopping:item:updated': (data: ShoppingItem) => void;
  'shopping:item:checked': (data: { itemId: string; checked: boolean; checkedBy: string }) => void;
  'shopping:item:deleted': (data: { id: string }) => void;

  // Home Automation events (add when implementing)
  'home:device:state-changed': (data: DeviceState) => void;

  // Recipe events (add when implementing)
  'recipes:recipe:saved': (data: Recipe) => void;
}
```

### Client → Server Events

```typescript
export interface ClientToServerEvents {
  ping: () => void;
  whoami: () => void;

  // Shopping (add when implementing)
  'shopping:subscribe': (data: { listId: string }) => void;
  'shopping:unsubscribe': (data: { listId: string }) => void;
}
```

## Best Practices

### 1. Schema-First Design

Define Zod schema first, then infer the type:

```typescript
// Good - single source of truth
export const recipeSchema = z.object({...});
export type Recipe = z.infer<typeof recipeSchema>;

// Avoid - duplicated definitions that can drift
export interface Recipe {...}
export const recipeSchema = z.object({...});
```

### 2. Separate Input Schemas

Create separate schemas for create/update operations:

```typescript
// Full schema (for responses)
export const recipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Create input (no id, timestamps)
export const createRecipeSchema = recipeSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Update input (all optional except id)
export const updateRecipeSchema = createRecipeSchema.partial().extend({
  id: z.string(),
});
```

### 3. Meaningful Error Messages

```typescript
export const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or less')
  .regex(/^[a-zA-Z0-9\s-]+$/, 'Name can only contain letters, numbers, spaces, and hyphens');
```

### 4. Export Everything from Index

```typescript
// packages/shared/src/schemas/index.ts
export * from './user';
export * from './shopping';
export * from './recipes';
```

### 5. Keep Types in Sync with DB Schema

When you add a Drizzle table, add corresponding types/schemas here:

```typescript
// apps/api/src/db/schema/shopping-list.ts (Drizzle)
export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // ...
});

// packages/shared/src/types/index.ts (Type)
export interface ShoppingList {
  id: string;
  name: string;
  // ...
}

// packages/shared/src/schemas/index.ts (Zod)
export const shoppingListSchema = z.object({
  id: z.string(),
  name: z.string(),
  // ...
});
```

## Adding a New Module's Types

When implementing a new module (e.g., Shopping List):

1. **Add types** to `packages/shared/src/types/index.ts`:
   ```typescript
   // Shopping List types
   export interface ShoppingList {...}
   export interface ShoppingItem {...}
   export type ShoppingListWithItems = ShoppingList & { items: ShoppingItem[] };
   ```

2. **Add schemas** to `packages/shared/src/schemas/index.ts`:
   ```typescript
   // Shopping List schemas
   export const shoppingListSchema = z.object({...});
   export const createShoppingListSchema = ...;
   export const shoppingItemSchema = z.object({...});
   export const createShoppingItemSchema = ...;
   ```

3. **Add WebSocket events** to `ServerToClientEvents` and `ClientToServerEvents`

4. **Export from index** to make them available:
   ```typescript
   // packages/shared/src/index.ts
   export * from './types';
   export * from './schemas';
   ```

## Testing Schemas

```typescript
import { createShoppingItemSchema } from '@honeydo/shared/schemas';

// Valid input
const validInput = {
  listId: 'abc123',
  name: 'Milk',
  quantity: 2,
};
const result = createShoppingItemSchema.safeParse(validInput);
// result.success === true

// Invalid input
const invalidInput = {
  listId: 'abc123',
  name: '',  // Too short
};
const result2 = createShoppingItemSchema.safeParse(invalidInput);
// result2.success === false
// result2.error.issues[0].message === 'Name is required'
```

## Detailed Documentation

For detailed patterns and examples:
- **Schemas**: See `src/schemas/CLAUDE.md`
- **Constants**: See `src/constants/CLAUDE.md`

## Files to Reference

- Types: `src/types/index.ts`
- Schemas: `src/schemas/index.ts` and `src/schemas/shopping.ts`
- Constants: `src/constants/index.ts` and `src/constants/categories.ts`
- Main export: `src/index.ts`
- API DB schema: `apps/api/src/db/schema/`
- Feature plans: `docs/epics/*/features/*/PLAN.md`
