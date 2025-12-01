# Zod Schemas - Claude Code Instructions

> Validation schemas shared between API and frontend

## Overview

This directory contains Zod schemas that are:
- **Single source of truth** for validation
- **Used by tRPC** for input validation
- **Used by React Hook Form** for form validation
- **Type-generating** via `z.infer<>`

## Directory Structure

```
packages/shared/src/schemas/
├── CLAUDE.md           # This file
├── index.ts            # Re-exports all schemas
├── shopping.ts         # Shopping module schemas (Epic 2)
├── home-automation.ts  # Home Automation schemas (Epic 3)
└── recipes.ts          # Recipes/meal planning schemas (Epic 4)
```

## Shopping Schemas (`shopping.ts`)

### List Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `shoppingListSchema` | Full list object | Response typing |
| `createShoppingListSchema` | Create new list | `trpc.shopping.lists.create` |
| `updateShoppingListSchema` | Update list | `trpc.shopping.lists.update` |

```typescript
// Create input
export const createShoppingListSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
});

// Update input (includes id, fields optional)
export const updateShoppingListSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  googleKeepId: z.string().nullable().optional(),
  googleKeepSyncEnabled: z.boolean().optional(),
});
```

### Item Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `shoppingItemSchema` | Full item object | Response typing |
| `createShoppingItemSchema` | Add item | `trpc.shopping.items.add` |
| `updateShoppingItemSchema` | Edit item | `trpc.shopping.items.update` |
| `checkShoppingItemSchema` | Check/uncheck | `trpc.shopping.items.check` |
| `bulkAddItemsSchema` | Add multiple | `trpc.shopping.items.addBulk` |
| `reorderItemsSchema` | Reorder items | `trpc.shopping.items.reorder` |
| `clearCheckedItemsSchema` | Clear checked | `trpc.shopping.items.clearChecked` |

```typescript
// Create input
export const createShoppingItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1, 'Item name is required').max(200, 'Item name too long'),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  category: shoppingCategorySchema.optional(),
  note: z.string().max(500).optional(),
});

// Update input (id required, others optional)
export const updateShoppingItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  category: shoppingCategorySchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// Check/uncheck
export const checkShoppingItemSchema = z.object({
  id: z.string(),
  checked: z.boolean(),
});

// Bulk add (1-50 items)
export const bulkAddItemsSchema = z.object({
  listId: z.string(),
  items: z.array(z.object({
    name: z.string().min(1).max(200),
    quantity: z.number().positive().optional(),
    unit: z.string().max(50).optional(),
    category: shoppingCategorySchema.optional(),
  })).min(1).max(50),
});

// Reorder
export const reorderItemsSchema = z.object({
  listId: z.string(),
  itemIds: z.array(z.string()).min(1),
});

// Clear checked
export const clearCheckedItemsSchema = z.object({
  listId: z.string(),
});
```

### AI Feature Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `expandItemSchema` | Expand vague item | `trpc.shopping.ai.expand` |
| `categorizeItemSchema` | Categorize item | `trpc.shopping.ai.categorize` |
| `suggestItemsSchema` | Get suggestions | `trpc.shopping.ai.suggest` |
| `batchCategorizeSchema` | Batch categorize | `trpc.shopping.ai.batchCategorize` |

```typescript
// Expand "taco stuff" into ingredients
export const expandItemSchema = z.object({
  itemName: z.string().min(1).max(200),
  existingItems: z.array(z.string()).optional(),
});

export const expandItemResponseSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    category: shoppingCategorySchema.optional(),
  })),
});

// Single item categorization
export const categorizeItemSchema = z.object({
  itemName: z.string().min(1).max(200),
});

// Suggestions based on current list
export const suggestItemsSchema = z.object({
  currentItems: z.array(z.string()),
});

// Batch categorization (1-50 items)
export const batchCategorizeSchema = z.object({
  items: z.array(z.string()).min(1).max(50),
});
```

### Category Schema

Built from constants for type safety:

```typescript
import { SHOPPING_CATEGORIES, type ShoppingCategoryId } from '../constants/categories';

// Create enum schema from constants
const categoryIds = SHOPPING_CATEGORIES.map((c) => c.id) as unknown as readonly [ShoppingCategoryId, ...ShoppingCategoryId[]];
export const shoppingCategorySchema = z.enum(categoryIds);
// Results in: z.enum(['produce', 'bakery', 'deli', ...])
```

### Inferred Types

All types are inferred from schemas:

```typescript
// List types
export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
export type UpdateShoppingListInput = z.infer<typeof updateShoppingListSchema>;

// Item types
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type CheckShoppingItemInput = z.infer<typeof checkShoppingItemSchema>;
export type BulkAddItemsInput = z.infer<typeof bulkAddItemsSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type ClearCheckedItemsInput = z.infer<typeof clearCheckedItemsSchema>;

// AI types
export type ExpandItemInput = z.infer<typeof expandItemSchema>;
export type ExpandItemResponse = z.infer<typeof expandItemResponseSchema>;
// ... etc
```

## Home Automation Schemas (`home-automation.ts`)

### Entity & Domain Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `haDomainSchema` | Valid HA domains (light, switch, etc.) | Entity queries |
| `haEntitySchema` | Full entity object | Entity display |
| `serviceCallSchema` | Generic service call | `trpc.home.actions.callService` |
| `toggleEntitySchema` | Quick toggle | `trpc.home.actions.toggle` |

### Favorites & Scenes

| Schema | Purpose | Used By |
|--------|---------|---------|
| `addFavoriteSchema` | Add entity to favorites | `trpc.home.favorites.add` |
| `updateFavoriteSchema` | Update favorite display | `trpc.home.favorites.update` |
| `createSceneSchema` | Create custom scene | `trpc.home.scenes.create` |
| `sceneActionSchema` | Single action in scene | Scene management |

### Constants

```typescript
export const CONTROLLABLE_DOMAINS = ['light', 'switch', 'fan', 'climate', 'lock', 'cover'];
export const READONLY_DOMAINS = ['sensor', 'binary_sensor'];
export const SENSITIVE_DOMAINS = ['lock', 'cover'];
```

## Recipes Schemas (`recipes.ts`)

### Preference Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `cuisinePreferencesSchema` | Cuisine frequency limits | Preferences management |
| `dietaryRestrictionSchema` | Dietary restrictions | Preferences management |
| `ingredientPreferenceSchema` | Ingredient love/hate | Preferences management |
| `mealPreferenceNoteSchema` | Freeform rules | Preferences management |
| `updatePreferencesSchema` | Update preferences | `trpc.recipes.preferences.update` |

### Suggestion Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `requestSuggestionsSchema` | Request AI suggestions | `trpc.recipes.suggestions.request` |
| `acceptMealSchema` | Accept a suggestion | `trpc.recipes.suggestions.acceptMeal` |
| `mealSuggestionItemSchema` | Single suggested meal | Suggestion display |

### Calendar & Shopping Schemas

| Schema | Purpose | Used By |
|--------|---------|---------|
| `dateRangeSchema` | Date range for queries | Meals, shopping |
| `acceptedMealSchema` | Accepted meal object | Meal calendar |
| `aggregatedIngredientSchema` | Aggregated ingredient | Shopping generation |
| `addIngredientsToListSchema` | Add to shopping list | `trpc.recipes.shopping.addToList` |

### Claude Skill Schemas

| Schema | Purpose |
|--------|---------|
| `skillInputSchema` | Input structure for Claude CLI |
| `skillOutputSchema` | Output validation from Claude CLI |
| `recipeDataSchema` | Full recipe structure |

## Schema Patterns

### Required vs Optional Fields

```typescript
// Required string with validation
name: z.string().min(1, 'Required').max(100)

// Optional string
name: z.string().min(1).max(100).optional()

// Nullable (can be explicitly null)
name: z.string().nullable()

// Optional AND nullable
name: z.string().nullable().optional()
```

### Numeric Validation

```typescript
// Positive number (> 0)
quantity: z.number().positive()

// Non-negative (>= 0)
quantity: z.number().nonnegative()

// Integer only
sortOrder: z.number().int()

// With range
limit: z.number().min(1).max(50)
```

### Array Validation

```typescript
// Array with length constraints
items: z.array(z.string()).min(1).max(50)

// Array of objects
items: z.array(z.object({
  name: z.string(),
  value: z.number(),
}))
```

### Datetime Strings

```typescript
// ISO datetime string
createdAt: z.string().datetime()

// Nullable datetime
checkedAt: z.string().datetime().nullable()
```

### Custom Error Messages

```typescript
name: z.string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or less')
  .regex(/^[a-zA-Z0-9\s-]+$/, 'Name can only contain letters, numbers, spaces, and hyphens')
```

## Usage Examples

### tRPC Input Validation

```typescript
// apps/api/src/modules/shopping/items.router.ts
import { createShoppingItemSchema } from '@honeydo/shared';

add: protectedProcedure
  .input(createShoppingItemSchema)  // Validates automatically
  .mutation(async ({ ctx, input }) => {
    // input is typed as CreateShoppingItemInput
    const { listId, name, quantity, unit, category, note } = input;
    // ...
  }),
```

### React Hook Form

```typescript
// apps/web/src/modules/shopping/components/AddItemForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createShoppingItemSchema, type CreateShoppingItemInput } from '@honeydo/shared';

function AddItemForm({ listId }: { listId: string }) {
  const form = useForm<CreateShoppingItemInput>({
    resolver: zodResolver(createShoppingItemSchema),
    defaultValues: {
      listId,
      name: '',
    },
  });

  // form.formState.errors has typed error messages
}
```

### Manual Validation

```typescript
import { createShoppingItemSchema } from '@honeydo/shared';

// safeParse - doesn't throw
const result = createShoppingItemSchema.safeParse(userInput);
if (result.success) {
  // result.data is typed
} else {
  // result.error.issues contains errors
}

// parse - throws on invalid
try {
  const data = createShoppingItemSchema.parse(userInput);
} catch (error) {
  if (error instanceof z.ZodError) {
    // Handle validation errors
  }
}
```

## Adding New Schemas

### 1. Create Schema

```typescript
// packages/shared/src/schemas/new-feature.ts
import { z } from 'zod';

export const newFeatureSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  // ...
});

export const createNewFeatureSchema = newFeatureSchema.omit({
  id: true,
});

export type NewFeature = z.infer<typeof newFeatureSchema>;
export type CreateNewFeatureInput = z.infer<typeof createNewFeatureSchema>;
```

### 2. Export from Index

```typescript
// packages/shared/src/schemas/index.ts
export * from './shopping';
export * from './new-feature';  // Add this
```

### 3. Use in tRPC

```typescript
// apps/api/src/modules/new-feature/router.ts
import { createNewFeatureSchema } from '@honeydo/shared';

create: protectedProcedure
  .input(createNewFeatureSchema)
  .mutation(async ({ input }) => {
    // ...
  }),
```

## Files to Reference

- Constants: `packages/shared/src/constants/`
- Types index: `packages/shared/src/types/index.ts`
- Usage in API: `apps/api/src/modules/shopping/`
- Usage in frontend: `apps/web/src/modules/shopping/`
