# New Batch Wizard - Feature Plan

## Overview

The New Batch Wizard is a multi-step workflow that guides users through transitioning from one meal planning cycle to the next. It handles the lifecycle of the current batch (rollover, archival, history), generates fresh AI suggestions, and creates a new shopping list from accepted recipes.

## User Story

> As a household member, I want to start a new batch of meal plans so that I can transition smoothly from one planning period to the next, keeping meals I want to repeat, archiving completed history, and getting fresh suggestions.

## Wizard Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEW BATCH WIZARD                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Manage Current Batch                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  Review existing meals:                                             │    │
│  │  - Completed meals → auto-archive to history                        │    │
│  │  - Rollover meals → keep for next batch (mark as "shopped")         │    │
│  │  - Discard meals → archive to history (unless audible)              │    │
│  │  - Audibles → discard without archiving                             │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                              ↓                                              │
│  Step 2: Get New Suggestions                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  - Set target count (e.g., 7 dinners)                               │    │
│  │  - Request AI suggestions                                           │    │
│  │  - Accept/Decline suggestions until target reached                  │    │
│  │  - Can request more if declining too many                           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                              ↓                                              │
│  Step 3: Manage Shopping List                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  - Show aggregated ingredients from accepted meals                  │    │
│  │  - Rollover meals marked as "already shopped" (excluded)            │    │
│  │  - Select/deselect ingredients as needed                            │    │
│  │  - Discard old shopping list (optional confirmation)                │    │
│  │  - Create new shopping list with selected ingredients               │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                              ↓                                              │
│  Step 4: Complete                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  - Summary of what was created                                      │    │
│  │  - Quick links to meal plan and shopping list                       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Batch
A logical grouping of meals for a planning period. Currently, meals are individual records without explicit grouping. This feature introduces a `batchId` to group related meals together.

```typescript
// New field on acceptedMeals table
batchId: text('batch_id').notNull()
```

### Meal Disposition (Step 1)

| Status | Action | History | Notes |
|--------|--------|---------|-------|
| **Completed** | Auto-archive | Yes | Already cooked, adds to recipe history |
| **Rollover** | Keep | No | User wants to cook this in next batch |
| **Discard** | Archive | Yes | User didn't cook it, still useful for history |
| **Audible** | Discard | No | Was a replacement swap, original already in history |

### Rollover Meals
- Meals the user wants to keep for the next batch
- Marked with `isRollover: true` flag
- Shopping ingredients already purchased → `shoppingListGenerated: true`
- Excluded from new batch shopping aggregation
- Moved to new batch with same recipe data

### Audible Detection
An "audible" is a meal that was swapped via the audible feature. Detection:
- `suggestionId` points to a suggestion with `isAudible: true` (new field)
- OR meal was created to replace another meal (tracked via new `replacedMealId` field)

### Recipe History Integration
When meals are archived (completed or discarded), the recipe data is added to `data/recipes/history.json`:
- Increment `timesMade` count
- Update `lastMade` timestamp
- Update `rating` if user provided one
- Add any user notes

---

## Database Schema Changes

### Modified: `accepted_meals` Table

```typescript
// apps/api/src/db/schema/recipes.ts

export const acceptedMeals = sqliteTable('accepted_meals', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  suggestionId: text('suggestion_id').references(() => mealSuggestions.id, { onDelete: 'set null' }),
  suggestionIndex: integer('suggestion_index'),

  // NEW: Batch grouping
  batchId: text('batch_id').notNull(),

  // Scheduling
  date: text('date').notNull(), // YYYY-MM-DD
  mealType: text('meal_type').$type<MealType>().notNull(),

  // Recipe data (denormalized for independence)
  recipeName: text('recipe_name').notNull(),
  recipeData: text('recipe_data', { mode: 'json' }).$type<RecipeData>().notNull(),
  servings: integer('servings').notNull().default(4),

  // Status tracking
  shoppingListGenerated: integer('shopping_list_generated', { mode: 'boolean' }).notNull().default(false),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: text('completed_at'),

  // NEW: Rollover tracking
  isRollover: integer('is_rollover', { mode: 'boolean' }).notNull().default(false),
  rolloverFromBatchId: text('rollover_from_batch_id'),

  // NEW: Audible tracking
  isAudible: integer('is_audible', { mode: 'boolean' }).notNull().default(false),
  replacedMealId: text('replaced_meal_id'),

  // NEW: User rating for history
  rating: integer('rating'), // 1-5 stars, null if not rated
  userNotes: text('user_notes'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  userDateIdx: index('idx_accepted_meals_user_date').on(table.userId, table.date),
  batchIdx: index('idx_accepted_meals_batch').on(table.batchId),
}));
```

### New: `batches` Table

```typescript
// apps/api/src/db/schema/recipes.ts

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Batch metadata
  name: text('name'), // Optional user-defined name, e.g., "Week of Jan 15"
  dateRangeStart: text('date_range_start').notNull(), // YYYY-MM-DD
  dateRangeEnd: text('date_range_end').notNull(), // YYYY-MM-DD

  // Status
  status: text('status').$type<BatchStatus>().notNull().default('active'),
  // 'active' - current batch
  // 'archived' - closed via wizard
  // 'abandoned' - user started new batch without completing wizard

  // Statistics (computed when archived)
  totalMeals: integer('total_meals'),
  completedMeals: integer('completed_meals'),
  rolledOverMeals: integer('rolled_over_meals'),
  discardedMeals: integer('discarded_meals'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  archivedAt: text('archived_at'),
}, (table) => ({
  userStatusIdx: index('idx_batches_user_status').on(table.userId, table.status),
}));

// Type for status
export type BatchStatus = 'active' | 'archived' | 'abandoned';
```

### New: `wizard_sessions` Table (Optional)

Track wizard progress for resumability:

```typescript
export const wizardSessions = sqliteTable('wizard_sessions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Wizard state
  currentStep: integer('current_step').notNull().default(1), // 1-4

  // Step 1 data: meal dispositions
  mealDispositions: text('meal_dispositions', { mode: 'json' }).$type<MealDisposition[]>(),

  // Step 2 data: suggestion tracking
  targetMealCount: integer('target_meal_count'),
  acceptedSuggestionIds: text('accepted_suggestion_ids', { mode: 'json' }).$type<string[]>(),
  currentSuggestionRequestId: text('current_suggestion_request_id'),

  // Step 3 data: shopping selections
  selectedIngredients: text('selected_ingredients', { mode: 'json' }).$type<string[]>(),
  targetListId: text('target_list_id'),

  // Batch being created
  newBatchId: text('new_batch_id'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Type for meal disposition
interface MealDisposition {
  mealId: string;
  disposition: 'completed' | 'rollover' | 'discard';
}
```

---

## API Design

### New Router: `wizard.router.ts`

```typescript
// apps/api/src/modules/recipes/wizard.router.ts

export const wizardRouter = router({
  // Session management
  start: protectedProcedure
    .mutation(async ({ ctx }) => {
      // 1. Check for existing active wizard session
      // 2. If exists, return it (resumable)
      // 3. Otherwise, create new session
      // 4. Load current batch meals for Step 1
      // Returns: WizardSession with currentBatch meals
    }),

  abandon: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Delete wizard session without completing
      // Mark any in-progress batch as abandoned
    }),

  // Step 1: Manage Current Batch
  getCurrentBatchMeals: protectedProcedure
    .query(async ({ ctx }) => {
      // Get all meals from active batch
      // Include: completed status, isAudible flag
      // Returns: AcceptedMeal[] with disposition suggestions
    }),

  setMealDispositions: protectedProcedure
    .input(setMealDispositionsSchema)
    .mutation(async ({ ctx, input }) => {
      // Save user's choices for each meal
      // Validate all meals accounted for
      // Update wizard session
    }),

  completeStep1: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Process all dispositions:
      // - Completed → archive to history
      // - Rollover → prepare for new batch
      // - Discard (non-audible) → archive to history
      // - Discard (audible) → just delete
      // Archive old batch
      // Create new batch
      // Move rollovers to new batch
      // Advance wizard to step 2
    }),

  // Step 2: Get New Suggestions
  getSuggestionProgress: protectedProcedure
    .query(async ({ ctx }) => {
      // Returns: { targetCount, acceptedCount, pendingSuggestions }
    }),

  setTargetCount: protectedProcedure
    .input(z.object({ count: z.number().min(1).max(21) }))
    .mutation(async ({ ctx, input }) => {
      // Update wizard session with target meal count
    }),

  requestMoreSuggestions: protectedProcedure
    .input(requestSuggestionsSchema)
    .mutation(async ({ ctx, input }) => {
      // Similar to existing suggestions.request
      // But tracks within wizard context
      // Excludes rollover meals from date range
    }),

  acceptSuggestion: protectedProcedure
    .input(acceptMealSchema)
    .mutation(async ({ ctx, input }) => {
      // Accept meal into new batch
      // Update accepted count
      // Check if target reached
    }),

  declineSuggestion: protectedProcedure
    .input(z.object({ suggestionId: z.string(), mealIndex: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Mark suggestion as declined
      // Doesn't count toward target
    }),

  completeStep2: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Validate target count reached
      // Advance to step 3
    }),

  // Step 3: Manage Shopping List
  getShoppingPreview: protectedProcedure
    .query(async ({ ctx }) => {
      // Aggregate ingredients from new batch meals
      // Exclude rollover meals (already shopped)
      // Group by category
      // Returns: AggregatedIngredient[]
    }),

  getExistingLists: protectedProcedure
    .query(async ({ ctx }) => {
      // Get current shopping lists
      // Mark which will be discarded/replaced
    }),

  completeStep3: protectedProcedure
    .input(completeShoppingSchema)
    .mutation(async ({ ctx, input }) => {
      // input: { selectedIngredients, listAction: 'replace' | 'append' | 'new', listId? }
      // If replace: clear existing list items, add new
      // If append: add to existing list
      // If new: create new list
      // Mark meals as shoppingListGenerated
      // Advance to step 4
    }),

  // Step 4: Complete
  getCompletionSummary: protectedProcedure
    .query(async ({ ctx }) => {
      // Returns summary of wizard actions:
      // - Meals archived to history
      // - Meals rolled over
      // - New meals accepted
      // - Shopping items created
      // - Links to meal plan and shopping list
    }),

  finishWizard: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Clean up wizard session
      // Final WebSocket events
      // Returns: { batchId, listId }
    }),
});
```

### Updated Main Router

```typescript
// apps/api/src/modules/recipes/router.ts

export const recipesRouter = router({
  preferences: preferencesRouter,
  suggestions: suggestionsRouter,
  meals: mealsRouter,
  shopping: shoppingRouter,
  schedule: scheduleRouter,
  wizard: wizardRouter,  // NEW
  batches: batchesRouter, // NEW - for batch management outside wizard
});
```

### Zod Schemas

```typescript
// packages/shared/src/schemas/recipes.ts

// Batch status
export const batchStatusSchema = z.enum(['active', 'archived', 'abandoned']);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

// Meal disposition
export const mealDispositionSchema = z.enum(['completed', 'rollover', 'discard']);
export type MealDisposition = z.infer<typeof mealDispositionSchema>;

// Set meal dispositions input
export const setMealDispositionsSchema = z.object({
  dispositions: z.array(z.object({
    mealId: z.string(),
    disposition: mealDispositionSchema,
  })),
});

// Complete shopping step input
export const completeShoppingSchema = z.object({
  selectedIngredients: z.array(z.string()), // ingredient keys
  listAction: z.enum(['replace', 'append', 'new']),
  listId: z.string().optional(), // required for replace/append
  newListName: z.string().optional(), // required for new
});

// Wizard session schema
export const wizardSessionSchema = z.object({
  id: z.string(),
  currentStep: z.number().min(1).max(4),
  mealDispositions: z.array(z.object({
    mealId: z.string(),
    disposition: mealDispositionSchema,
  })).optional(),
  targetMealCount: z.number().optional(),
  acceptedMealIds: z.array(z.string()).optional(),
  newBatchId: z.string().optional(),
});
export type WizardSession = z.infer<typeof wizardSessionSchema>;

// Batch schema
export const batchSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  status: batchStatusSchema,
  totalMeals: z.number().nullable(),
  completedMeals: z.number().nullable(),
  rolledOverMeals: z.number().nullable(),
  discardedMeals: z.number().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Batch = z.infer<typeof batchSchema>;
```

---

## Recipe History Service

### History Update Logic

```typescript
// apps/api/src/services/recipe-history.ts

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

interface RecipeHistoryEntry {
  name: string;
  source: string;
  sourceUrl: string | null;
  cuisine: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  rating: number | null;
  timesMade: number;
  lastMade: string | null; // ISO date
  notes: string[];
}

interface RecipeHistory {
  recipes: RecipeHistoryEntry[];
  metadata: {
    lastUpdated: string;
    totalRecipes: number;
  };
}

const HISTORY_PATH = join(process.cwd(), 'data', 'recipes', 'history.json');

export async function archiveMealToHistory(
  meal: AcceptedMeal,
  disposition: 'completed' | 'discard'
): Promise<void> {
  const history = await loadHistory();

  // Find existing recipe by name (normalized)
  const normalizedName = meal.recipeName.toLowerCase().trim();
  let existingIndex = history.recipes.findIndex(
    r => r.name.toLowerCase().trim() === normalizedName
  );

  if (existingIndex >= 0) {
    // Update existing entry
    const existing = history.recipes[existingIndex];
    existing.timesMade += disposition === 'completed' ? 1 : 0;
    existing.lastMade = disposition === 'completed' ? meal.date : existing.lastMade;
    if (meal.rating && (!existing.rating || meal.rating > existing.rating)) {
      existing.rating = meal.rating;
    }
    if (meal.userNotes) {
      existing.notes = [...(existing.notes || []), meal.userNotes];
    }
  } else {
    // Add new entry from meal's recipeData
    const newEntry: RecipeHistoryEntry = {
      name: meal.recipeName,
      source: meal.recipeData.source || 'Unknown',
      sourceUrl: meal.recipeData.sourceUrl || null,
      cuisine: meal.recipeData.cuisine || 'Unknown',
      prepTimeMinutes: meal.recipeData.prepTimeMinutes,
      cookTimeMinutes: meal.recipeData.cookTimeMinutes,
      totalTimeMinutes: meal.recipeData.totalTimeMinutes,
      effort: meal.recipeData.effort,
      defaultServings: meal.recipeData.defaultServings,
      servingsUnit: meal.recipeData.servingsUnit || 'servings',
      ingredients: meal.recipeData.ingredients,
      instructions: meal.recipeData.instructions,
      tags: meal.recipeData.tags || [],
      rating: meal.rating || null,
      timesMade: disposition === 'completed' ? 1 : 0,
      lastMade: disposition === 'completed' ? meal.date : null,
      notes: meal.userNotes ? [meal.userNotes] : [],
    };
    history.recipes.push(newEntry);
  }

  // Update metadata
  history.metadata.lastUpdated = new Date().toISOString().split('T')[0];
  history.metadata.totalRecipes = history.recipes.length;

  await saveHistory(history);
}

async function loadHistory(): Promise<RecipeHistory> {
  try {
    const content = await readFile(HISTORY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { recipes: [], metadata: { lastUpdated: '', totalRecipes: 0 } };
  }
}

async function saveHistory(history: RecipeHistory): Promise<void> {
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
}
```

---

## Frontend Components

### Wizard Page Structure

```
apps/web/src/modules/recipes/components/wizard/
├── NewBatchWizard.tsx           # Main wizard container
├── WizardProgress.tsx           # Step indicator (1/4, 2/4, etc.)
├── steps/
│   ├── ManageBatchStep.tsx      # Step 1: Review existing meals
│   ├── MealDispositionCard.tsx  # Individual meal with disposition controls
│   ├── GetSuggestionsStep.tsx   # Step 2: Accept/decline suggestions
│   ├── SuggestionProgress.tsx   # Target counter (3/7 accepted)
│   ├── ManageShoppingStep.tsx   # Step 3: Ingredient selection
│   └── CompletionStep.tsx       # Step 4: Summary and links
├── hooks/
│   └── use-wizard.ts            # Wizard state management
└── dialogs/
    ├── ConfirmDiscardListDialog.tsx
    └── RatingDialog.tsx         # Quick rating before archive
```

### Main Wizard Component

```tsx
// apps/web/src/modules/recipes/components/wizard/NewBatchWizard.tsx

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { WizardProgress } from './WizardProgress';
import { ManageBatchStep } from './steps/ManageBatchStep';
import { GetSuggestionsStep } from './steps/GetSuggestionsStep';
import { ManageShoppingStep } from './steps/ManageShoppingStep';
import { CompletionStep } from './steps/CompletionStep';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/alert-dialog';

export function NewBatchWizard() {
  const utils = trpc.useUtils();

  // Start or resume wizard session
  const { data: session, isLoading } = trpc.recipes.wizard.start.useQuery();

  const abandonMutation = trpc.recipes.wizard.abandon.useMutation({
    onSuccess: () => {
      // Navigate back to recipes home
    },
  });

  if (isLoading) {
    return <WizardSkeleton />;
  }

  if (!session) {
    return <WizardError />;
  }

  const renderStep = () => {
    switch (session.currentStep) {
      case 1:
        return <ManageBatchStep session={session} />;
      case 2:
        return <GetSuggestionsStep session={session} />;
      case 3:
        return <ManageShoppingStep session={session} />;
      case 4:
        return <CompletionStep session={session} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">New Batch</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAbandonDialog(true)}
          >
            Cancel
          </Button>
        </div>
        <WizardProgress currentStep={session.currentStep} totalSteps={4} />
      </header>

      <main className="flex-1 overflow-auto">
        {renderStep()}
      </main>

      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        {/* Confirm abandon wizard */}
      </AlertDialog>
    </div>
  );
}
```

### Step 1: Manage Current Batch

```tsx
// apps/web/src/modules/recipes/components/wizard/steps/ManageBatchStep.tsx

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { MealDispositionCard } from './MealDispositionCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MealWithDisposition {
  meal: AcceptedMeal;
  suggestedDisposition: 'completed' | 'rollover' | 'discard';
  currentDisposition: 'completed' | 'rollover' | 'discard' | null;
}

export function ManageBatchStep({ session }: { session: WizardSession }) {
  const { data: meals } = trpc.recipes.wizard.getCurrentBatchMeals.useQuery();
  const setDispositions = trpc.recipes.wizard.setMealDispositions.useMutation();
  const completeStep = trpc.recipes.wizard.completeStep1.useMutation();

  const [dispositions, setLocalDispositions] = useState<Record<string, string>>({});

  // Initialize with suggested dispositions
  useEffect(() => {
    if (meals) {
      const initial: Record<string, string> = {};
      meals.forEach(m => {
        // Auto-suggest based on status
        if (m.completed) {
          initial[m.id] = 'completed';
        } else if (m.isAudible) {
          initial[m.id] = 'discard'; // Audibles should be discarded
        } else {
          initial[m.id] = 'discard'; // Default to discard, user can change
        }
      });
      setLocalDispositions(initial);
    }
  }, [meals]);

  const handleContinue = async () => {
    // Save dispositions and advance
    await setDispositions.mutateAsync({
      dispositions: Object.entries(dispositions).map(([mealId, disposition]) => ({
        mealId,
        disposition: disposition as MealDisposition,
      })),
    });
    await completeStep.mutateAsync();
  };

  const allSet = meals?.every(m => dispositions[m.id]);

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Review Current Meals</h2>
        <p className="text-sm text-muted-foreground">
          Choose what to do with each meal from your current batch.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllCompleted()}
        >
          Mark all completed
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => discardAll()}
        >
          Discard all
        </Button>
      </div>

      {/* Meal list */}
      <div className="space-y-3">
        {meals?.map(meal => (
          <MealDispositionCard
            key={meal.id}
            meal={meal}
            disposition={dispositions[meal.id]}
            onDispositionChange={(d) => {
              setLocalDispositions(prev => ({ ...prev, [meal.id]: d }));
            }}
            isAudible={meal.isAudible}
          />
        ))}
      </div>

      {/* Continue button */}
      <div className="sticky bottom-0 bg-background border-t p-4 -mx-4 -mb-4">
        <Button
          className="w-full"
          disabled={!allSet || completeStep.isPending}
          onClick={handleContinue}
        >
          {completeStep.isPending ? 'Processing...' : 'Continue to Suggestions'}
        </Button>
      </div>
    </div>
  );
}
```

### Step 2: Get Suggestions

```tsx
// apps/web/src/modules/recipes/components/wizard/steps/GetSuggestionsStep.tsx

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { SuggestionProgress } from './SuggestionProgress';
import { MealSuggestionCard } from '../../suggestions/MealSuggestionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function GetSuggestionsStep({ session }: { session: WizardSession }) {
  const utils = trpc.useUtils();

  const { data: progress } = trpc.recipes.wizard.getSuggestionProgress.useQuery();
  const { data: currentSuggestion } = trpc.recipes.suggestions.getCurrent.useQuery();

  const setTarget = trpc.recipes.wizard.setTargetCount.useMutation();
  const requestMore = trpc.recipes.wizard.requestMoreSuggestions.useMutation();
  const acceptMeal = trpc.recipes.wizard.acceptSuggestion.useMutation();
  const declineMeal = trpc.recipes.wizard.declineSuggestion.useMutation();
  const completeStep = trpc.recipes.wizard.completeStep2.useMutation();

  const [targetCount, setTargetCount] = useState(session.targetMealCount ?? 7);
  const [hasSetTarget, setHasSetTarget] = useState(!!session.targetMealCount);

  // Listen for suggestion updates via WebSocket
  useRecipesSync();

  const handleSetTarget = async () => {
    await setTarget.mutateAsync({ count: targetCount });
    setHasSetTarget(true);
    // Automatically request first batch of suggestions
    await requestMore.mutateAsync({
      dateRangeStart: getNextWeekStart(),
      dateRangeEnd: getNextWeekEnd(),
      mealTypes: ['dinner'],
    });
  };

  const pendingSuggestions = currentSuggestion?.suggestions?.filter(
    s => s.accepted === null
  ) ?? [];

  const canContinue = (progress?.acceptedCount ?? 0) >= targetCount;

  if (!hasSetTarget) {
    return (
      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">How Many Meals?</h2>
          <p className="text-sm text-muted-foreground">
            Choose how many meals you want for your new batch.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target">Number of meals</Label>
          <Input
            id="target"
            type="number"
            min={1}
            max={21}
            value={targetCount}
            onChange={(e) => setTargetCount(parseInt(e.target.value) || 7)}
          />
          <p className="text-xs text-muted-foreground">
            Typically 7 for a week of dinners.
          </p>
        </div>

        <Button className="w-full" onClick={handleSetTarget}>
          Get Suggestions
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SuggestionProgress
        accepted={progress?.acceptedCount ?? 0}
        target={targetCount}
      />

      {currentSuggestion?.status === 'pending' && (
        <div className="text-center py-8">
          <Spinner />
          <p className="text-sm text-muted-foreground mt-2">
            Getting suggestions...
          </p>
        </div>
      )}

      {pendingSuggestions.length > 0 && (
        <div className="space-y-3">
          {pendingSuggestions.map((suggestion, index) => (
            <MealSuggestionCard
              key={`${currentSuggestion.id}-${index}`}
              suggestion={suggestion}
              onAccept={() => acceptMeal.mutate({
                suggestionId: currentSuggestion.id,
                mealIndex: index,
              })}
              onDecline={() => declineMeal.mutate({
                suggestionId: currentSuggestion.id,
                mealIndex: index,
              })}
            />
          ))}
        </div>
      )}

      {pendingSuggestions.length === 0 && !canContinue && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Need more options? Request additional suggestions.
          </p>
          <Button
            variant="outline"
            onClick={() => requestMore.mutate({
              dateRangeStart: getNextAvailableDate(),
              dateRangeEnd: getNextWeekEnd(),
              mealTypes: ['dinner'],
            })}
            disabled={requestMore.isPending}
          >
            Get More Suggestions
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 bg-background border-t p-4 -mx-4 -mb-4">
        <Button
          className="w-full"
          disabled={!canContinue || completeStep.isPending}
          onClick={() => completeStep.mutate()}
        >
          {canContinue
            ? 'Continue to Shopping'
            : `Accept ${targetCount - (progress?.acceptedCount ?? 0)} more`}
        </Button>
      </div>
    </div>
  );
}
```

### Step 3: Manage Shopping

```tsx
// apps/web/src/modules/recipes/components/wizard/steps/ManageShoppingStep.tsx

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { IngredientList } from '../../shopping/IngredientList';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { AlertDialog } from '@/components/ui/alert-dialog';

export function ManageShoppingStep({ session }: { session: WizardSession }) {
  const { data: ingredients } = trpc.recipes.wizard.getShoppingPreview.useQuery();
  const { data: lists } = trpc.recipes.wizard.getExistingLists.useQuery();
  const completeShopping = trpc.recipes.wizard.completeStep3.useMutation();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listAction, setListAction] = useState<'replace' | 'new'>('replace');
  const [targetListId, setTargetListId] = useState<string | undefined>();
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // Initialize with all ingredients selected
  useEffect(() => {
    if (ingredients) {
      setSelected(new Set(ingredients.map(i => i.key)));
    }
  }, [ingredients]);

  const handleComplete = async () => {
    if (listAction === 'replace' && targetListId) {
      setShowConfirmReplace(true);
      return;
    }
    await doComplete();
  };

  const doComplete = async () => {
    await completeShopping.mutateAsync({
      selectedIngredients: Array.from(selected),
      listAction,
      listId: targetListId,
      newListName: listAction === 'new' ? `Week of ${formatDate(new Date())}` : undefined,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Shopping List</h2>
        <p className="text-sm text-muted-foreground">
          Review ingredients from your new meals. Rollover meals are excluded
          (already shopped).
        </p>
      </div>

      {/* Select all / none */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelected(new Set(ingredients?.map(i => i.key)))}
        >
          Select all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelected(new Set())}
        >
          Select none
        </Button>
      </div>

      {/* Ingredient list */}
      <IngredientList
        ingredients={ingredients ?? []}
        selected={selected}
        onToggle={(key) => {
          const next = new Set(selected);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          setSelected(next);
        }}
      />

      {/* List action */}
      <div className="space-y-2">
        <Label>Shopping List</Label>
        <Select value={listAction} onValueChange={setListAction}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="replace">Replace existing list</SelectItem>
            <SelectItem value="new">Create new list</SelectItem>
          </SelectContent>
        </Select>

        {listAction === 'replace' && lists && (
          <Select value={targetListId} onValueChange={setTargetListId}>
            <SelectTrigger>
              <SelectValue placeholder="Select list to replace" />
            </SelectTrigger>
            <SelectContent>
              {lists.map(list => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name} ({list.itemCount} items)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="sticky bottom-0 bg-background border-t p-4 -mx-4 -mb-4">
        <Button
          className="w-full"
          disabled={selected.size === 0 || completeShopping.isPending}
          onClick={handleComplete}
        >
          Create Shopping List ({selected.size} items)
        </Button>
      </div>

      <AlertDialog open={showConfirmReplace} onOpenChange={setShowConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Shopping List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all existing items from the selected list
              and replace them with the new ingredients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doComplete}>
              Replace List
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

### Step 4: Completion

```tsx
// apps/web/src/modules/recipes/components/wizard/steps/CompletionStep.tsx

import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, Calendar, ShoppingCart } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export function CompletionStep({ session }: { session: WizardSession }) {
  const { data: summary } = trpc.recipes.wizard.getCompletionSummary.useQuery();
  const finishWizard = trpc.recipes.wizard.finishWizard.useMutation();

  const handleFinish = async () => {
    await finishWizard.mutateAsync();
    // Navigate to meal plan
  };

  return (
    <div className="p-4 space-y-6">
      <div className="text-center py-6">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold">All Done!</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your new batch is ready to go.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{summary?.newMeals} new meals</p>
              <p className="text-sm text-muted-foreground">
                {summary?.rollovers} rolled over from previous batch
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <ShoppingCart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{summary?.shoppingItems} shopping items</p>
              <p className="text-sm text-muted-foreground">
                Added to {summary?.listName}
              </p>
            </div>
          </div>
        </Card>

        {summary?.archivedToHistory > 0 && (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">
              {summary.archivedToHistory} recipes archived to history
            </p>
          </Card>
        )}
      </div>

      {/* Quick links */}
      <div className="grid gap-2">
        <Button asChild className="w-full">
          <Link to="/recipes/plan">
            View Meal Plan
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/shopping">
            Go to Shopping List
          </Link>
        </Button>
      </div>

      <Button
        variant="ghost"
        className="w-full"
        onClick={handleFinish}
      >
        Close Wizard
      </Button>
    </div>
  );
}
```

---

## WebSocket Events

New events for wizard:

| Event | Emitter | Payload |
|-------|---------|---------|
| `recipes:wizard:step-completed` | completeStep1/2/3 | `{ step, nextStep }` |
| `recipes:wizard:finished` | finishWizard | `{ batchId, listId }` |
| `recipes:batch:created` | completeStep1 | `{ batchId, name, dateRange }` |
| `recipes:batch:archived` | completeStep1 | `{ batchId, stats }` |

---

## Migration Plan

### Database Migration

```typescript
// apps/api/src/db/migrations/XXXX_add_batch_support.ts

import { sql } from 'drizzle-orm';

export async function up(db: Database) {
  // Create batches table
  await db.run(sql`
    CREATE TABLE batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      date_range_start TEXT NOT NULL,
      date_range_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      total_meals INTEGER,
      completed_meals INTEGER,
      rolled_over_meals INTEGER,
      discarded_meals INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    )
  `);

  await db.run(sql`
    CREATE INDEX idx_batches_user_status ON batches(user_id, status)
  `);

  // Add columns to accepted_meals
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN batch_id TEXT
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN is_rollover INTEGER NOT NULL DEFAULT 0
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN rollover_from_batch_id TEXT
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN is_audible INTEGER NOT NULL DEFAULT 0
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN replaced_meal_id TEXT
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN rating INTEGER
  `);
  await db.run(sql`
    ALTER TABLE accepted_meals ADD COLUMN user_notes TEXT
  `);

  await db.run(sql`
    CREATE INDEX idx_accepted_meals_batch ON accepted_meals(batch_id)
  `);

  // Create wizard_sessions table
  await db.run(sql`
    CREATE TABLE wizard_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_step INTEGER NOT NULL DEFAULT 1,
      meal_dispositions TEXT,
      target_meal_count INTEGER,
      accepted_suggestion_ids TEXT,
      current_suggestion_request_id TEXT,
      selected_ingredients TEXT,
      target_list_id TEXT,
      new_batch_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrate existing meals to a default batch
  await db.run(sql`
    INSERT INTO batches (id, user_id, name, date_range_start, date_range_end, status)
    SELECT
      'legacy-' || user_id,
      user_id,
      'Pre-wizard meals',
      MIN(date),
      MAX(date),
      'active'
    FROM accepted_meals
    GROUP BY user_id
  `);

  await db.run(sql`
    UPDATE accepted_meals
    SET batch_id = 'legacy-' || user_id
    WHERE batch_id IS NULL
  `);

  // Make batch_id NOT NULL after migration
  -- Note: SQLite doesn't support ALTER COLUMN, so this requires table recreation
  -- For simplicity, we'll allow NULL temporarily
}

export async function down(db: Database) {
  await db.run(sql`DROP TABLE IF EXISTS wizard_sessions`);
  await db.run(sql`DROP TABLE IF EXISTS batches`);
  -- Note: Cannot easily remove columns in SQLite
}
```

---

## Testing Considerations

### Unit Tests

```typescript
// apps/api/src/modules/recipes/__tests__/wizard.test.ts

describe('Wizard Router', () => {
  describe('start', () => {
    it('creates new session when none exists', async () => {});
    it('returns existing session if in progress', async () => {});
    it('loads current batch meals for step 1', async () => {});
  });

  describe('completeStep1', () => {
    it('archives completed meals to history', async () => {});
    it('keeps rollover meals for new batch', async () => {});
    it('discards non-audible meals to history', async () => {});
    it('discards audible meals without archiving', async () => {});
    it('creates new batch with rollovers', async () => {});
    it('archives old batch with stats', async () => {});
  });

  describe('getSuggestionProgress', () => {
    it('returns correct accepted count', async () => {});
    it('excludes rollover dates from suggestions', async () => {});
  });

  describe('completeStep3', () => {
    it('replaces existing list items', async () => {});
    it('creates new list when requested', async () => {});
    it('excludes rollover meal ingredients', async () => {});
    it('marks new meals as shopping generated', async () => {});
  });
});

describe('Recipe History Service', () => {
  it('increments timesMade for completed meals', async () => {});
  it('updates lastMade timestamp', async () => {});
  it('preserves existing recipe data', async () => {});
  it('adds new recipes to history', async () => {});
  it('handles ratings correctly', async () => {});
});
```

### E2E Tests

```typescript
// apps/web/e2e/wizard.spec.ts

test.describe('New Batch Wizard', () => {
  test('complete wizard flow with rollovers', async ({ page }) => {
    // Start wizard
    // Mark some meals as rollover
    // Mark some as completed
    // Proceed to suggestions
    // Accept target number of meals
    // Generate shopping list
    // Verify completion
  });

  test('handles audible meals correctly', async ({ page }) => {
    // Verify audible meals can only be discarded
    // Verify they don't go to history
  });

  test('can resume abandoned wizard', async ({ page }) => {
    // Start wizard
    // Close browser
    // Reopen
    // Verify wizard resumes at same step
  });
});
```

---

## Edge Cases

1. **No existing meals**: Skip step 1, go directly to step 2
2. **All meals are audibles**: No history archive needed for step 1
3. **User declines all suggestions**: Allow requesting more indefinitely
4. **User changes target mid-wizard**: Recalculate progress
5. **Rollover meal already has date conflict**: Prompt to reschedule
6. **Shopping list has checked items**: Preserve checked items if appending
7. **Wizard abandoned mid-way**: Clean up partial state on next start
8. **Multiple users start wizard simultaneously**: Each has independent session

---

## Future Enhancements

1. **Batch History View**: See past batches and their stats
2. **Rollover Scheduling**: Choose which dates to use for rollovers
3. **Partial Completion**: Allow skipping steps (e.g., skip shopping)
4. **Batch Templates**: Save and reuse common batch configurations
5. **Smart Suggestions**: Use batch history to improve AI suggestions
6. **Batch Sharing**: Share batches between household members
7. **Batch Export**: Export batch as PDF meal plan

---

## Implementation Order

1. **Database Schema** (1 migration)
   - Add batches table
   - Add columns to accepted_meals
   - Add wizard_sessions table
   - Migrate existing data

2. **Recipe History Service**
   - Create archiveMealToHistory function
   - Test with existing history.json

3. **Wizard Router - Core**
   - start/abandon procedures
   - getCurrentBatchMeals
   - setMealDispositions/completeStep1

4. **Wizard Router - Suggestions**
   - getSuggestionProgress
   - setTargetCount
   - requestMoreSuggestions (leverage existing)
   - accept/declineSuggestion
   - completeStep2

5. **Wizard Router - Shopping**
   - getShoppingPreview
   - getExistingLists
   - completeStep3

6. **Wizard Router - Completion**
   - getCompletionSummary
   - finishWizard

7. **Frontend Components**
   - WizardProgress
   - ManageBatchStep + MealDispositionCard
   - GetSuggestionsStep + SuggestionProgress
   - ManageShoppingStep
   - CompletionStep

8. **Integration & Polish**
   - WebSocket events
   - Error handling
   - Loading states
   - Edge case handling
