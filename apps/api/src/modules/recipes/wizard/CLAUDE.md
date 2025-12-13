# HoneyDo Wizard System - Claude Code Instructions

> Multi-step workflow for meal batch planning

## Overview

The wizard system guides users through a 4-step workflow for planning their weekly meals:

1. **Step 1: Manage Current Batch** - Handle leftover meals from previous batch
2. **Step 2: Get Suggestions** - Request AI suggestions, manually pick recipes, accept/decline
3. **Step 3: Manage Shopping** - Select ingredients and add to shopping list
4. **Step 4: Complete** - View summary and finish

## Directory Structure

```
apps/api/src/modules/recipes/wizard/
├── CLAUDE.md                   # This file
├── index.ts                    # Flat router combining all procedures
├── helpers.ts                  # Shared helper functions
├── step2-helpers.ts            # Step 2 specific helpers
├── session.router.ts           # Session management (start, abandon, goBack)
├── session.router.test.ts      # Session tests
├── step1.router.ts             # Step 1: Manage current batch
├── step2.router.ts             # Step 2: Combines step2 sub-routers
├── step2-queries.router.ts     # Step 2: Query procedures
├── step2-request.router.ts     # Step 2: AI suggestion requests
├── step2-actions.router.ts     # Step 2: Accept/decline actions
├── step2-manual.router.ts      # Step 2: Manual recipe picks
├── step3.router.ts             # Step 3: Shopping list generation
├── step4.router.ts             # Step 4: Completion summary
└── batches.router.ts           # Batch history queries
```

## Router Architecture

The wizard uses a **flat router structure** for API simplicity:

```typescript
// All procedures accessible at wizard.* level
trpc.recipes.wizard.start
trpc.recipes.wizard.completeStep1
trpc.recipes.wizard.acceptSuggestion
// etc.

// Implementation split across files for maintainability:
export const wizardRouter = router({
  start: sessionRouter.start,
  completeStep1: step1Router.complete,
  acceptSuggestion: step2Router.acceptSuggestion,
  // ...
});
```

## Session State

```typescript
interface WizardSession {
  id: string;              // Session ID
  batchId: string;         // Associated batch ID
  currentStep: 1 | 2 | 3 | 4;
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
  targetMealCount: number; // How many meals to plan
  createdAt: string;
  updatedAt: string;
}
```

## Step-by-Step Guide

### Session Management

```typescript
// Start/resume wizard session
trpc.recipes.wizard.start.useQuery();
// Returns: { session: WizardSession, previousBatch: Batch | null }

// Abandon current session
trpc.recipes.wizard.abandon.useMutation();

// Get current session state
trpc.recipes.wizard.getSession.useQuery();

// Go back to previous step
trpc.recipes.wizard.goBack.useMutation();
```

### Step 1: Manage Current Batch

Handle meals from the previous batch that weren't completed.

```typescript
// Get meals from current batch
trpc.recipes.wizard.getCurrentBatchMeals.useQuery();
// Returns: AcceptedMeal[] with previous batch meals

// Set what to do with each meal
trpc.recipes.wizard.setMealDispositions.useMutation({
  dispositions: [
    { mealId: 'meal1', action: 'rollover' },  // Keep for next batch
    { mealId: 'meal2', action: 'complete' },  // Mark as cooked
    { mealId: 'meal3', action: 'discard' },   // Remove
  ],
});

// Complete step 1 and move to step 2
trpc.recipes.wizard.completeStep1.useMutation();
```

**Disposition Actions:**
- `rollover` - Move meal to new batch
- `complete` - Mark as cooked/completed
- `discard` - Remove from batch

### Step 2a: Plan Batch

Configure how many meals to plan.

```typescript
// Set meal counts by type
trpc.recipes.wizard.setMealCounts.useMutation({
  counts: {
    breakfast: 0,
    lunch: 3,
    dinner: 7,
    snack: 2,
  },
});
```

### Step 2b: Manual Picks

Manually select recipes from the library.

```typescript
// Add a manual pick
trpc.recipes.wizard.addManualPick.useMutation({
  recipeId: 'recipe123',
  date: '2024-01-15',
  mealType: 'dinner',
  servings: 4,
});

// Remove a manual pick
trpc.recipes.wizard.removeManualPick.useMutation({
  pickId: 'pick123',
});

// Get current manual picks
trpc.recipes.wizard.getManualPicks.useQuery();

// Finish manual picks, move to AI suggestions
trpc.recipes.wizard.completeManualPicks.useMutation();
```

### Step 2c: AI Suggestions

Request and review AI-generated suggestions.

```typescript
// Get suggestion progress
trpc.recipes.wizard.getSuggestionProgress.useQuery();
// Returns: { accepted: number, target: number, hidden: number }

// Get current suggestion to review
trpc.recipes.wizard.getCurrentSuggestion.useQuery();
// Returns: MealSuggestion | null

// Request more AI suggestions
trpc.recipes.wizard.requestMoreSuggestions.useMutation({
  count: 3,  // How many to generate
});

// Fetch from hidden pool (already generated but not shown)
trpc.recipes.wizard.fetchMoreHiddenSuggestions.useMutation();

// Accept current suggestion
trpc.recipes.wizard.acceptSuggestion.useMutation({
  suggestionId: 'sugg123',
  servings: 4,  // Optional override
});

// Decline current suggestion
trpc.recipes.wizard.declineSuggestion.useMutation({
  suggestionId: 'sugg123',
  reason: 'not_in_mood',  // Optional feedback
});

// Adjust target count
trpc.recipes.wizard.setTargetCount.useMutation({
  count: 7,
});

// Complete step 2 and move to step 3
trpc.recipes.wizard.completeStep2.useMutation();
```

**Hidden Pool System:**
- AI generates more suggestions than requested
- Extra suggestions stored in "hidden pool"
- When user declines, next from pool is shown
- Pool can be refilled via `fetchMoreHiddenSuggestions`

### Step 3: Manage Shopping List

Select ingredients and add to shopping list.

```typescript
// Get aggregated ingredients from accepted meals
trpc.recipes.wizard.getShoppingPreview.useQuery();
// Returns: AggregatedIngredient[] grouped by category

// Get existing shopping lists to add to
trpc.recipes.wizard.getExistingLists.useQuery();
// Returns: ShoppingList[]

// Complete step 3, add ingredients to list
trpc.recipes.wizard.completeStep3.useMutation({
  listId: 'list123',  // Target shopping list
  selectedIngredients: ['ing1', 'ing2'],  // Which to add
  skipShopping: false,  // true to skip adding to list
});
```

### Step 4: Complete

View summary and finish wizard.

```typescript
// Get completion summary
trpc.recipes.wizard.getCompletionSummary.useQuery();
// Returns: {
//   acceptedMeals: AcceptedMeal[],
//   ingredientsAdded: number,
//   shoppingListId: string | null,
//   batchStats: { total, breakfast, lunch, dinner, snack }
// }

// Finish wizard, close session
trpc.recipes.wizard.finishWizard.useMutation();
```

### Batch Management

Query batch history outside of wizard flow.

```typescript
// Get active batch
trpc.recipes.wizard.getActiveBatch.useQuery();
// Returns: Batch | null

// Get batch history
trpc.recipes.wizard.getBatchHistory.useQuery({ limit: 10 });
// Returns: Batch[]

// Get specific batch
trpc.recipes.wizard.getBatchById.useQuery({ id: 'batch123' });
// Returns: Batch with meals
```

## Helper Functions

### helpers.ts

Shared utilities used across wizard steps:

```typescript
import {
  getWizardSession,
  requireWizardSession,
  validateStep,
  createBatch,
} from './helpers';

// Get session or null
const session = await getWizardSession(ctx.userId);

// Get session or throw error
const session = await requireWizardSession(ctx.userId);

// Validate we're on expected step
await validateStep(session, 2);
```

### step2-helpers.ts

Step 2 specific utilities:

```typescript
import {
  calculateRemainingNeeded,
  pickNextSuggestionFromPool,
  moveToAccepted,
} from './step2-helpers';

// How many more suggestions needed
const remaining = calculateRemainingNeeded(session, acceptedCount);

// Get next suggestion from hidden pool
const next = await pickNextSuggestionFromPool(batchId);

// Move suggestion to accepted meals
await moveToAccepted(suggestionId, userId, servings);
```

## Database Tables

The wizard uses these tables from `db/schema/recipes.ts`:

| Table | Purpose |
|-------|---------|
| `wizard_sessions` | Active wizard session state |
| `meal_batches` | Batch metadata and status |
| `batch_meals` | Meals assigned to a batch |
| `meal_suggestions` | AI-generated suggestions with status |
| `manual_picks` | User's manual recipe selections |
| `accepted_meals` | Confirmed meals for the calendar |

## WebSocket Events

The wizard emits events for real-time UI updates:

| Event | When | Payload |
|-------|------|---------|
| `recipes:wizard:step-complete` | Step completed | `{ step, sessionId }` |
| `recipes:activity` | During AI generation | `{ message, progress? }` |
| `recipes:suggestions:received` | New suggestions ready | `{ batchId, count }` |

## Error Handling

Common error scenarios:

```typescript
// No active session
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'No active wizard session',
});

// Wrong step
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: 'Must complete step 1 before step 2',
});

// AI generation failed
throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Failed to generate suggestions',
});
```

## Frontend Integration

The wizard frontend lives at `apps/web/src/modules/recipes/components/wizard/`:

| Component | Purpose |
|-----------|---------|
| `NewBatchWizard.tsx` | Main wizard controller |
| `WizardProgress.tsx` | Step progress indicator |
| `steps/ManageBatchStep.tsx` | Step 1 UI |
| `steps/PlanBatchStep.tsx` | Step 2a UI |
| `steps/ManualPicksStep.tsx` | Step 2b UI |
| `steps/GetSuggestionsStep.tsx` | Step 2c UI |
| `steps/ManageShoppingStep.tsx` | Step 3 UI |
| `steps/CompletionStep.tsx` | Step 4 UI |

## Testing

```typescript
// session.router.test.ts
describe('wizard session', () => {
  it('starts a new session', async () => {
    const result = await caller.recipes.wizard.start();
    expect(result.session.currentStep).toBe(1);
  });

  it('persists across requests', async () => {
    await caller.recipes.wizard.start();
    const session = await caller.recipes.wizard.getSession();
    expect(session).not.toBeNull();
  });
});
```

## Files to Reference

- Main recipes router: `../router.ts`
- Database schema: `../../db/schema/recipes.ts`
- Meal suggestions service: `../../../services/meal-suggestions.ts`
- Claude session: `../../../services/claude-session.ts`
- Frontend wizard: `apps/web/src/modules/recipes/components/wizard/`
