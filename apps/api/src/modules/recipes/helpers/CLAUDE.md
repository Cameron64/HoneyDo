# Recipe Helpers - Claude Code Instructions

> Shared utility functions for the recipes module

## Overview

The `helpers/` directory contains consolidated utility functions used across the recipes module routers. These were extracted to avoid code duplication.

## Directory Structure

```
apps/api/src/modules/recipes/helpers/
├── CLAUDE.md           # This file
├── index.ts            # Exports all helpers
└── skill-input.ts      # SkillInput builder for Claude
```

## skill-input.ts

Builds the `SkillInput` object for the meal suggestions service. Consolidates data fetching from multiple tables into a single structured input for Claude.

### Usage

```typescript
import { buildSkillInput } from './helpers';

const skillInput = await buildSkillInput(ctx.db, {
  userId: ctx.userId,
  dateRange: { start: '2024-01-15', end: '2024-01-21' },
  mealTypes: ['dinner'],
  suggestionsCount: 7,  // Optional, defaults to 7
  additionalNotes: [],  // Optional extra notes
  additionalRecentMeals: [],  // Optional, to avoid duplicates
});
```

### Options

```typescript
interface BuildSkillInputOptions {
  userId: string;
  dateRange: { start: string; end: string };
  mealTypes: MealType[];
  suggestionsCount?: number;  // Default: 7
  additionalNotes?: Array<{
    type: 'general' | 'avoid' | 'include' | 'rule';
    content: string;
  }>;
  additionalRecentMeals?: Array<{
    date: string;
    mealType: string;
    recipeName: string;
    cuisine: string;
  }>;
}
```

### What It Fetches

The function queries these tables in parallel:
1. `mealPreferences` - User's cuisine, time, effort preferences
2. `ingredientPreferences` - Love/hate ingredients
3. `mealPreferenceNotes` - Freeform rules (active only)
4. `acceptedMeals` - Recent meals (last 14 days) to avoid repetition

### Output Structure

Returns a `SkillInput` object matching the shared schema:

```typescript
interface SkillInput {
  dateRange: { start: string; end: string };
  mealTypes: MealType[];
  servings: number;
  suggestionsCount: number;
  recentMeals: Array<{
    date: string;
    mealType: string;
    recipeName: string;
    cuisine: string;
  }>;
  preferences: {
    cuisinePreferences: Record<string, { maxPerWeek: number; preference: string }>;
    dietaryRestrictions: Array<{ name: string; scope: string; mealsPerWeek?: number }>;
    weeknightMaxMinutes: number;
    weekendMaxMinutes: number;
    weeknightMaxEffort: number;
    weekendMaxEffort: number;
  };
  ingredientPreferences: Array<{
    ingredient: string;
    preference: string;
    notes: string | null;
  }>;
  notes: Array<{ type: string; content: string }>;
  context: {
    season: string;
    currentDate: string;
  };
}
```

### Use Cases

**In suggestions.router.ts:**
```typescript
const skillInput = await buildSkillInput(ctx.db, {
  userId: ctx.userId,
  dateRange: input.dateRange,
  mealTypes: input.mealTypes || ['dinner'],
});
const result = await mealSuggestionsService.getSuggestionsWithSession(skillInput);
```

**In meals.router.ts (audible/swap):**
```typescript
const skillInput = await buildSkillInput(ctx.db, {
  userId: ctx.userId,
  dateRange: { start: meal.date, end: meal.date },
  mealTypes: [meal.mealType],
  suggestionsCount: 1,
  additionalNotes: [{ type: 'avoid', content: `User wants to replace: ${meal.recipeName}` }],
});
```

**In wizard step2-request.router.ts:**
```typescript
const skillInput = await buildSkillInput(ctx.db, {
  userId: ctx.userId,
  dateRange: batch.dateRange,
  mealTypes: ['dinner'],
  suggestionsCount: requestCount,
  additionalRecentMeals: existingSuggestions.map(s => ({
    date: s.date,
    mealType: s.mealType,
    recipeName: s.recipeName,
    cuisine: s.cuisine,
  })),
});
```

## Adding New Helpers

When adding shared utilities:

1. Create a new file or add to existing one
2. Export from `index.ts`
3. Document the function's purpose and usage
4. Keep database queries efficient (use `Promise.all`)

```typescript
// helpers/index.ts
export { buildSkillInput } from './skill-input';
export { newHelper } from './new-helper';  // Add new exports here
```

## Related Files

- Meal suggestions service: `../../../services/meal-suggestions.ts`
- Shared SkillInput type: `packages/shared/src/schemas/recipes.ts`
- Database schema: `../../../db/schema/recipes.ts`
