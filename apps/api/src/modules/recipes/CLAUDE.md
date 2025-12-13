# Recipes Module - Claude Code Instructions

> AI-powered meal planning with Claude Session Service integration

## Overview

The recipes module handles:
- User meal preferences (cuisines, dietary restrictions, time/effort constraints)
- AI-generated meal suggestions via persistent Claude session
- Multi-step batch wizard for meal planning workflow
- Accepted meals management (meal calendar)
- Recipe-to-shopping-list ingredient integration
- Scheduled weekly suggestion generation
- Recipe history browsing

## Module Structure

```
apps/api/src/modules/recipes/
├── CLAUDE.md                  # This file
├── index.ts                   # Module exports
├── router.ts                  # Main router (7-router pattern)
├── preferences.router.ts      # Preference management
├── suggestions.router.ts      # AI suggestion workflow
├── meals.router.ts            # Accepted meals CRUD
├── shopping.router.ts         # Recipe-to-shopping integration
├── schedule.router.ts         # Weekly schedule management
├── history.router.ts          # Recipe/batch history queries
└── wizard/                    # Multi-step batch wizard (12 files)
    ├── index.ts               # Flat router combining all procedures
    ├── session.router.ts      # start, abandon, getSession
    ├── step1.router.ts        # getCurrentBatchMeals, setMealDispositions, complete
    ├── step2.router.ts        # Combines step2 sub-routers
    ├── step2-queries.router.ts    # getSuggestionProgress, getCurrentSuggestion, etc.
    ├── step2-request.router.ts    # requestMoreSuggestions, fetchMoreHiddenSuggestions
    ├── step2-actions.router.ts    # acceptSuggestion, declineSuggestion, complete
    ├── step3.router.ts        # getShoppingPreview, getExistingLists, complete
    ├── step4.router.ts        # getCompletionSummary, finish
    ├── batches.router.ts      # getActive, getHistory, getById
    ├── helpers.ts             # Shared helper functions
    └── step2-helpers.ts       # Step 2 specific helpers
```

## Router Pattern

This module uses a **7-router pattern**:

```typescript
// router.ts
export const recipesRouter = router({
  preferences: preferencesRouter,  // User preferences
  suggestions: suggestionsRouter,  // AI suggestions (legacy)
  meals: mealsRouter,              // Accepted meals
  shopping: shoppingRouter,        // Ingredient aggregation
  schedule: scheduleRouter,        // Weekly scheduling
  wizard: wizardRouter,            // Multi-step batch wizard
  history: historyRouter,          // Recipe/batch history
});

// Usage:
trpc.recipes.preferences.get.useQuery()
trpc.recipes.suggestions.request.useMutation()
trpc.recipes.meals.getRange.useQuery({ start, end })
trpc.recipes.shopping.getIngredients.useQuery({ start, end })
trpc.recipes.schedule.set.useMutation()
trpc.recipes.wizard.start.useQuery()
trpc.recipes.history.getRecipes.useQuery()
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

## Wizard System

The wizard provides a multi-step workflow for meal batch planning:

### Wizard Steps

| Step | Purpose | Key Procedures |
|------|---------|----------------|
| **1. Manage Batch** | Handle leftover meals from previous batch | `getCurrentBatchMeals`, `setMealDispositions`, `completeStep1` |
| **2. Get Suggestions** | Request AI suggestions, review one-by-one | `requestMoreSuggestions`, `acceptSuggestion`, `declineSuggestion`, `completeStep2` |
| **3. Manage Shopping** | Select ingredients, add to list | `getShoppingPreview`, `getExistingLists`, `completeStep3` |
| **4. Complete** | Summary and finish | `getCompletionSummary`, `finishWizard` |

### Wizard Procedures

```typescript
// Session Management
trpc.recipes.wizard.start.useQuery()           // Start or resume wizard session
trpc.recipes.wizard.abandon.useMutation()      // Cancel wizard
trpc.recipes.wizard.getSession.useQuery()      // Get current session state

// Step 1: Manage Batch
trpc.recipes.wizard.getCurrentBatchMeals.useQuery()       // Get meals from previous batch
trpc.recipes.wizard.setMealDispositions.useMutation()     // Set rollover/complete/discard
trpc.recipes.wizard.completeStep1.useMutation()           // Move to step 2

// Step 2: Get Suggestions
trpc.recipes.wizard.getSuggestionProgress.useQuery()      // { accepted, target, hidden }
trpc.recipes.wizard.getCurrentSuggestion.useQuery()       // Get next pending suggestion
trpc.recipes.wizard.setTargetCount.useMutation()          // Adjust meal count target
trpc.recipes.wizard.requestMoreSuggestions.useMutation()  // Request AI suggestions
trpc.recipes.wizard.fetchMoreHiddenSuggestions.useMutation() // Get from hidden pool
trpc.recipes.wizard.acceptSuggestion.useMutation()        // Accept current suggestion
trpc.recipes.wizard.declineSuggestion.useMutation()       // Decline current suggestion
trpc.recipes.wizard.completeStep2.useMutation()           // Move to step 3

// Step 3: Manage Shopping
trpc.recipes.wizard.getShoppingPreview.useQuery()         // Aggregated ingredients
trpc.recipes.wizard.getExistingLists.useQuery()           // Shopping lists to add to
trpc.recipes.wizard.completeStep3.useMutation()           // Move to step 4

// Step 4: Complete
trpc.recipes.wizard.getCompletionSummary.useQuery()       // Summary stats
trpc.recipes.wizard.finishWizard.useMutation()            // Complete and cleanup

// Batch Management
trpc.recipes.wizard.getActiveBatch.useQuery()             // Current active batch
trpc.recipes.wizard.getBatchHistory.useQuery()            // Past batches
trpc.recipes.wizard.getBatchById.useQuery({ id })         // Specific batch
```

### Wizard Session State

```typescript
interface WizardSession {
  id: string;
  batchId: string;
  currentStep: 1 | 2 | 3 | 4;
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
  targetMealCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### Hidden Suggestion Pool

Step 2 maintains a "hidden pool" of suggestions:
- AI generates more suggestions than needed
- User sees one at a time
- Declined suggestions are replaced from the pool
- Pool can be refilled via `fetchMoreHiddenSuggestions`

## Claude Session Integration

The module uses the persistent Claude Session Service for AI suggestions:

```typescript
// apps/api/src/services/meal-suggestions.ts
import { getClaudeSession } from '../../services/claude-session';

const session = getClaudeSession();

// Method 1: Persistent session (recommended, faster)
const result = await session.runQuery({
  prompt: buildPrompt(preferences, dateRange),
  systemPrompt: mealSuggestionsSystemPrompt,
  onMessage: (message) => {
    // Stream activity to frontend
    if (message.type === 'assistant') {
      activityCallback(extractActivityMessage(message));
    }
  },
});

// Method 2: CLI spawn (fallback)
const proc = spawn('claude', [
  '-p',                          // Print mode (non-interactive)
  '--output-format', 'stream-json',
  '--allowedTools', 'Read',
  '--max-turns', '3',
]);
```

### Activity Streaming

The wizard streams real-time progress messages to the frontend:

```typescript
// During AI suggestion generation
socketEmitter.toUser(userId, 'recipes:activity', {
  message: 'bestie is checking your recipe library...',
  progress: 0.3,
});

// Message categories (420+ variations!):
// - Thinking messages ("contemplating your vibe...")
// - Querying messages ("diving into the recipe archive...")
// - Finalizing messages ("putting the finishing touches...")
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

### History Router

| Procedure | Purpose |
|-----------|---------|
| `getRecipes` | Get all recipes from history.json |
| `searchRecipes` | Search recipes by name/cuisine |
| `getBatches` | Get past batch history |
| `getBatchDetail` | Get full batch with meals |

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
| `recipes:activity` | Server→Client | `{ message, progress? }` |
| `recipes:wizard:step-complete` | Server→Client | `{ step, sessionId }` |

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
