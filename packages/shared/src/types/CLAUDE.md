# Shared Types - Claude Code Instructions

> TypeScript type definitions shared between API and Web apps

## Overview

The `types/` directory is the **single source of truth** for TypeScript interfaces used across the monorepo. Most types are re-exported from Zod schemas to ensure runtime validation and static typing stay in sync.

## File Structure

```
packages/shared/src/types/
├── CLAUDE.md     # This file
└── index.ts      # All type exports
```

## Type Categories

### 1. Core App Types

Simple types defined directly (not from Zod):

```typescript
export type Theme = 'light' | 'dark' | 'system';
export type UserRole = 'admin' | 'member' | 'guest';
```

### 2. Re-exported from Schemas

Most types are inferred from Zod schemas:

```typescript
// Shopping types
export type {
  ShoppingList,
  ShoppingItem,
  CreateShoppingItemInput,
  // ...
} from '../schemas/shopping';

// Home automation types
export type {
  HAEntity,
  HAScene,
  ServiceCallInput,
  // ...
} from '../schemas/home-automation';

// Recipe types
export type {
  MealPreferences,
  AcceptedMeal,
  SkillInput,
  WizardSession,
  // ...
} from '../schemas/recipes';
```

### 3. Extended Types

Types that extend schema types with additional properties:

```typescript
export interface ShoppingListWithItems extends ShoppingList {
  items: ShoppingItem[];
}
```

### 4. User & Settings Types

```typescript
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  preferences: UserPreferences | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: Theme;
  accentColor?: string;
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  enabled: boolean;
  push: boolean;
  sound: boolean;
}
```

### 5. Module Types

```typescript
export interface Module {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface UserModule {
  userId: string;
  moduleId: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}
```

### 6. WebSocket Event Types

Typed Socket.io events for real-time communication:

```typescript
export interface ServerToClientEvents {
  // System
  pong: (data: { timestamp: number }) => void;
  'system:notification': (data: NotificationEvent) => void;

  // Shopping
  'shopping:item:added': (data: ShoppingItem) => void;
  'shopping:item:checked': (data: { id: string; checked: boolean }) => void;

  // Home
  'home:entity:state-changed': (data: StateChangedEvent) => void;

  // Recipes
  'recipes:meal:accepted': (data: { mealId: string; date: string; mealType: MealType }) => void;
  'recipes:activity': (data: { message: string; progress: number }) => void;
  'recipes:wizard:step-completed': (data: { step: number }) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  whoami: () => void;
}
```

## Usage

### Importing Types

```typescript
// From shared package
import type { User, ShoppingList, AcceptedMeal } from '@honeydo/shared';

// Or from types subpath
import type { User } from '@honeydo/shared/types';
```

### Type Guards

```typescript
import type { MealType } from '@honeydo/shared';

function isMealType(value: string): value is MealType {
  return ['breakfast', 'lunch', 'dinner', 'snack'].includes(value);
}
```

## Adding New Types

### From Zod Schema (Preferred)

1. Define schema in `schemas/<module>.ts`
2. Re-export type from `types/index.ts`:

```typescript
// In schemas/my-module.ts
export const myDataSchema = z.object({...});
export type MyData = z.infer<typeof myDataSchema>;

// In types/index.ts
export type { MyData } from '../schemas/my-module';
```

### Standalone Types

For types that don't need runtime validation:

```typescript
// In types/index.ts
export type ViewMode = 'list' | 'grid' | 'calendar';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}
```

## Best Practices

### 1. Schema-First for API Types

Any type used in API input/output should have a Zod schema:

```typescript
// Good - validated at runtime
const result = mySchema.safeParse(input);
if (result.success) {
  // result.data is typed
}

// Risky - no runtime validation
const data = input as MyType;  // Could be wrong at runtime
```

### 2. Keep Types Flat When Possible

```typescript
// Good - easy to extend
export interface Meal {
  id: string;
  date: string;
  mealType: MealType;
  recipeData: RecipeData;
}

// Avoid - deeply nested
export interface MealContainer {
  meal: {
    meta: {
      id: string;
      date: string;
    };
    content: {
      recipe: RecipeData;
    };
  };
}
```

### 3. Use Type Unions for Variants

```typescript
export type MealDisposition = 'rollover' | 'complete' | 'discard';

export interface MealDispositionRecord {
  mealId: string;
  action: MealDisposition;
}
```

### 4. Document Complex Types

```typescript
/**
 * Input for the meal suggestions AI service.
 * Contains all context needed for Claude to generate appropriate suggestions.
 */
export interface SkillInput {
  /** Target date range for meal suggestions */
  dateRange: { start: string; end: string };
  /** Meal types to suggest (e.g., ['dinner']) */
  mealTypes: MealType[];
  // ...
}
```

## Related Files

- Zod schemas: `../schemas/`
- Main export: `../index.ts`
- API database types: `apps/api/src/db/schema/`
