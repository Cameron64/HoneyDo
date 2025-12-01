# Recipes Module - Claude Code Instructions

> AI-powered meal planning with Claude Code headless integration

## Overview

The recipes module handles:
- User meal preferences (cuisines, dietary restrictions, time/effort constraints)
- AI-generated meal suggestions via Claude Code headless mode
- Accepted meals management (meal calendar)
- Recipe-to-shopping-list ingredient integration
- Scheduled weekly suggestion generation

## Module Structure

```
apps/api/src/modules/recipes/
├── CLAUDE.md                  # This file
├── index.ts                   # Module exports
├── router.ts                  # Main router (combines sub-routers)
├── preferences.router.ts      # Preference management
├── suggestions.router.ts      # AI suggestion workflow
├── meals.router.ts            # Accepted meals CRUD
├── shopping.router.ts         # Recipe-to-shopping integration
└── schedule.router.ts         # Weekly schedule management
```

## Router Pattern

This module uses a **5-router pattern**:

```typescript
// router.ts
export const recipesRouter = router({
  preferences: preferencesRouter,  // User preferences
  suggestions: suggestionsRouter,  // AI suggestions
  meals: mealsRouter,              // Accepted meals
  shopping: shoppingRouter,        // Ingredient aggregation
  schedule: scheduleRouter,        // Weekly scheduling
});

// Usage:
trpc.recipes.preferences.get.useQuery()
trpc.recipes.suggestions.request.useMutation()
trpc.recipes.meals.getRange.useQuery({ start, end })
trpc.recipes.shopping.getIngredients.useQuery({ start, end })
trpc.recipes.schedule.set.useMutation()
```

## Database Schema

Located in `apps/api/src/db/schema/recipes.ts`:

| Table | Purpose |
|-------|---------|
| `meal_preferences` | User's cuisine, dietary, time preferences |
| `ingredient_preferences` | Like/dislike for specific ingredients |
| `meal_preference_notes` | Freeform rules ("vegetarian Mondays") |
| `meal_suggestions` | AI-generated suggestions with review status |
| `accepted_meals` | Confirmed meals for the calendar |
| `suggestion_schedules` | Weekly auto-trigger configuration |

## Key Procedures

### Preferences Router

| Procedure | Purpose |
|-----------|---------|
| `get` | Get user's meal preferences (creates default if none) |
| `update` | Update cuisine/dietary/time preferences |
| `getIngredients` | List ingredient preferences |
| `setIngredient` | Add/update ingredient love/hate |
| `removeIngredient` | Delete ingredient preference |
| `getNotes` | List freeform rules/notes |
| `addNote` | Add freeform rule |
| `updateNote` | Modify note content or active status |
| `deleteNote` | Remove note |
| `exportAll` | Bundle all preferences for skill consumption |

### Suggestions Router

| Procedure | Purpose |
|-----------|---------|
| `request` | Trigger AI suggestion generation |
| `getCurrent` | Get most recent received suggestions |
| `getAll` | List suggestion history |
| `getById` | Get specific suggestion set |
| `acceptMeal` | Accept a suggested meal |
| `rejectMeal` | Reject a suggested meal |
| `setServings` | Override servings for a meal |
| `acceptAll` | Accept all unreviewed meals |
| `retry` | Retry a failed suggestion request |

### Meals Router

| Procedure | Purpose |
|-----------|---------|
| `getRange` | Get meals in date range (grouped by date) |
| `getByDate` | Get meals for specific date |
| `getById` | Get single meal detail |
| `markCompleted` | Mark meal as cooked (toggle completed status) |
| `remove` | Remove accepted meal |
| `getUpcoming` | Get next N days of meals |
| `getPendingShoppingCount` | Count meals pending shopping list |
| `audible` | Request AI replacement for a meal (swap feature) |

### Shopping Router

| Procedure | Purpose |
|-----------|---------|
| `getIngredients` | Aggregate ingredients from date range |
| `getAvailableLists` | Get shopping lists for selection |
| `addToList` | Add selected ingredients to shopping list |

### Schedule Router

| Procedure | Purpose |
|-----------|---------|
| `get` | Get user's schedule settings |
| `set` | Configure day/time/daysAhead |
| `disable` | Pause automatic suggestions |
| `enable` | Resume automatic suggestions |
| `triggerNow` | Manual trigger with schedule's daysAhead |

## Claude Code Integration

The module uses Claude Code in headless mode (`-p` flag) to generate meal suggestions:

```typescript
// apps/api/src/services/meal-suggestions.ts
const proc = spawn('claude', [
  '-p',                          // Print mode (non-interactive)
  '--output-format', 'json',     // Structured response
  '--allowedTools', 'Read',      // Only read history.json
  '--max-turns', '3',
  '--append-system-prompt', systemPrompt,
  userPrompt,
]);
```

### System Prompt

Located at `apps/api/src/prompts/meal-suggestions.md`. Instructs Claude to:
- Read `data/recipes/history.json` for available recipes
- Consider user preferences and constraints
- Return structured JSON with suggestions and reasoning

### Skill Input/Output

```typescript
// SkillInput - sent to Claude
interface SkillInput {
  dateRange: { start: string; end: string };
  mealTypes: MealType[];
  servings: number;
  recentMeals: { date, mealType, recipeName, cuisine }[];
  preferences: { cuisinePreferences, dietaryRestrictions, ... };
  ingredientPreferences: { ingredient, preference, notes }[];
  notes: { type, content }[];
  context: { season, currentDate };
}

// SkillOutput - received from Claude
interface SkillOutput {
  suggestions: {
    date: string;
    mealType: string;
    recipe: RecipeData;
  }[];
  reasoning: string;
}
```

## Ingredient Aggregation

The shopping router aggregates ingredients from accepted meals:

```typescript
// Combines same ingredients across multiple recipes
// Scales by servings
// Groups by category

const aggregated = aggregateIngredients(meals);
// Returns: { key, name, totalAmount, unit, category, fromMeals[], selected }
```

Features:
- Normalizes ingredient names (singular, lowercase)
- Combines compatible units (cups + tbsp)
- Tracks which meals contributed each ingredient
- Handles unit mismatches with `additionalAmounts`

## WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:suggestions:received` | Server→Client | `{ suggestionId }` |
| `recipes:suggestions:error` | Server→Client | `{ suggestionId, error }` |
| `recipes:suggestions:updated` | Server→Client | `{ suggestionId }` |
| `recipes:meal:accepted` | Server→Client | `{ mealId, date, mealType }` |
| `recipes:meal:removed` | Server→Client | `{ date, mealType }` |
| `recipes:meal:completed` | Server→Client | `{ mealId, date, mealType, completed }` |
| `recipes:shopping:generated` | Server→Client | `{ listId, itemCount }` |

## Recipe History

Claude reads from `data/recipes/history.json`:

```json
{
  "recipes": [
    {
      "name": "Lemon Herb Chicken",
      "source": "NYT Cooking",
      "sourceUrl": "https://...",
      "cuisine": "Mediterranean",
      "prepTimeMinutes": 15,
      "cookTimeMinutes": 45,
      "totalTimeMinutes": 60,
      "effort": 3,
      "defaultServings": 4,
      "ingredients": [...],
      "instructions": [...],
      "tags": ["weeknight", "one-pan"],
      "rating": 5,
      "timesMade": 8,
      "lastMade": "2024-12-15"
    }
  ],
  "metadata": {
    "lastUpdated": "2025-01-15",
    "totalRecipes": 50
  }
}
```

## Zod Schemas

All in `packages/shared/src/schemas/recipes.ts`:

| Schema | Purpose |
|--------|---------|
| `mealTypeSchema` | breakfast/lunch/dinner/snack |
| `cuisinePreferencesSchema` | Cuisine frequency limits |
| `recipeDataSchema` | Full recipe structure |
| `requestSuggestionsSchema` | Input for requesting suggestions |
| `acceptMealSchema` | Input for accepting a meal |
| `dateRangeSchema` | Start/end date range |
| `setScheduleSchema` | Schedule configuration |
| `addIngredientsToListSchema` | Shopping list addition |
| `skillInputSchema` | Full Claude input |
| `skillOutputSchema` | Claude response validation |

## Error Handling

| Scenario | Handling |
|----------|----------|
| Claude timeout (>3 min) | Store error, allow retry |
| Invalid JSON output | Validate schema, store error |
| Claude CLI not found | Clear error message |
| No history.json | Claude handles gracefully |

## Effort Scale

Used in `recipeDataSchema`:
1. Minimal (assemble, no cooking)
2. Easy (one pot, minimal prep)
3. Moderate (some prep, single technique)
4. Involved (multiple components)
5. Complex (advanced techniques)

## Files to Reference

- Database schema: `apps/api/src/db/schema/recipes.ts`
- Shared schemas: `packages/shared/src/schemas/recipes.ts`
- Shared types: `packages/shared/src/types/index.ts`
- Meal suggestions service: `apps/api/src/services/meal-suggestions.ts`
- System prompt: `apps/api/src/prompts/meal-suggestions.md`
- Recipe history: `data/recipes/history.json`
- Epic 4 plan: `docs/epics/4-recipes/PLAN.md`
- Feature plans: `docs/epics/4-recipes/features/*/PLAN.md`
