# Wizard Recipe Selection Feature Plan

> Allow users to manually select recipes (from library or by URL import) in addition to AI-generated suggestions during the batch wizard.

## Overview

Currently, Step 2 of the batch wizard is 100% AI-driven: user sets a target count, AI generates all suggestions, user accepts/declines. This feature adds flexibility for users to:

1. **Pick recipes from their library** - browse/search existing recipes
2. **Import recipes by URL** - scrape and add new recipes during the wizard
3. **Let AI fill the rest** - AI only generates suggestions for remaining slots

### Key UX Principle

**User picks first, AI fills the rest.** This ensures:
- User gets exactly the recipes they want
- AI intelligently fills gaps considering user's manual picks
- Clear mental model: "I'll choose X, AI picks the remaining Y"

## User Flow

### Step 2a: Plan Your Batch (NEW)

User sets two numbers:
- **Total meals**: How many dinners for this batch (1-21)
- **Manual picks**: How many the user will choose themselves (0 to total)
- **AI picks**: Automatically calculated (total - manual)

```
┌─────────────────────────────────────┐
│ How many dinners?                   │
│                                     │
│      [ - ]    5    [ + ]            │
│                                     │
├─────────────────────────────────────┤
│ How many will you choose?           │
│                                     │
│      [ - ]    2    [ + ]            │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📚 Pick from library            │ │
│ │ 🔗 Import by URL                │ │
│ │ ─────────────────────────────── │ │
│ │ 🤖 AI picks the rest: 3         │ │
│ └─────────────────────────────────┘ │
│                                     │
│          [ Get Started → ]          │
└─────────────────────────────────────┘
```

**Navigation:**
- If manualPicks = 0 → Skip to Step 2c (AI suggestions)
- If manualPicks > 0 → Go to Step 2b (manual picks)

### Step 2b: Your Picks (NEW, conditional)

User selects recipes via two methods:
1. **Pick from Library** - opens bottom sheet with search/filter
2. **Import by URL** - opens existing RecipeImportSheet

Shows progress and selected recipes with ability to remove.

```
┌─────────────────────────────────────┐
│ Your Picks                   2 of 3 │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ + Import by URL                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ + Pick from Library             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─── Selected ────────────────────── │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🍝 Pasta Primavera        [ × ] │ │
│ │    Italian · 30 min · Effort 2  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 🍗 Lemon Herb Chicken     [ × ] │ │
│ │    Mediterranean · 45 min       │ │
│ └─────────────────────────────────┘ │
│                                     │
│     [ Continue to AI Picks → ]      │
└─────────────────────────────────────┘
```

**Library Picker Bottom Sheet:**
```
┌─────────────────────────────────────┐
│ ━━━━━━━━━━                          │
│ Pick a Recipe                       │
│                                     │
│ 🔍 [ Search recipes...            ] │
│                                     │
│ [All Cuisines ▾] [Any Effort ▾]     │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Pasta Primavera                 │ │
│ │ Italian · 30 min · ⭐4.5         │ │
│ │ Made 3 times                    │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Thai Basil Chicken              │ │
│ │ Thai · 25 min · ⭐5              │ │
│ │ Made 7 times                    │ │
│ └─────────────────────────────────┘ │
│ ...                                 │
└─────────────────────────────────────┘
```

**Navigation:**
- User can add/remove picks freely
- "Continue" enabled when selected.length >= manualPicks
- If aiPicks = 0 → Skip to Step 3 (shopping)
- If aiPicks > 0 → Go to Step 2c (AI suggestions)

### Step 2c: AI Suggestions (MODIFIED existing)

Same as current GetSuggestionsStep but:
- Target count = aiPicks (not total)
- AI is informed of manual picks to avoid duplicates/conflicts
- Progress shows: "Accepted 1 of 3 AI suggestions"

### Step 2 Complete

When both conditions are met:
- manualPicks selected (if any)
- aiPicks accepted (if any)

User proceeds to Step 3 (shopping).

## Data Model Changes

### Database Schema

**wizardSessions table additions:**

```sql
-- New columns for Step 2a/2b
ALTER TABLE wizard_sessions ADD COLUMN total_meal_count INTEGER;
ALTER TABLE wizard_sessions ADD COLUMN manual_pick_count INTEGER DEFAULT 0;
ALTER TABLE wizard_sessions ADD COLUMN manual_pick_ids TEXT DEFAULT '[]';
-- JSON array of { recipeId, servings, addedAt }
```

**TypeScript types:**

```typescript
// packages/shared/src/types/index.ts

interface ManualPickEntry {
  recipeId: string;      // ID from history.json
  recipeName: string;    // Denormalized for display
  servings: number;
  addedAt: string;       // ISO timestamp
}

interface WizardSession {
  // ... existing fields ...

  // Step 2a: Planning
  totalMealCount: number | null;
  manualPickCount: number;        // Default 0

  // Step 2b: Manual picks
  manualPickIds: ManualPickEntry[];

  // Derived (not stored)
  // aiPickCount = totalMealCount - manualPickCount
  // manualPicksComplete = manualPickIds.length >= manualPickCount
}
```

### Zod Schemas

```typescript
// packages/shared/src/schemas/recipes.ts

export const manualPickEntrySchema = z.object({
  recipeId: z.string(),
  recipeName: z.string(),
  servings: z.number().int().min(1).max(20),
  addedAt: z.string(),
});

export const setMealCountsSchema = z.object({
  total: z.number().int().min(1).max(21),
  manualPicks: z.number().int().min(0).max(21),
}).refine(data => data.manualPicks <= data.total, {
  message: "Manual picks cannot exceed total meals",
});

export const addManualPickSchema = z.object({
  recipeId: z.string(),
  servings: z.number().int().min(1).max(20).default(4),
});

export const removeManualPickSchema = z.object({
  recipeId: z.string(),
});
```

## API Changes

### New Procedures

**wizard.setMealCounts**
```typescript
// apps/api/src/modules/recipes/wizard/step2.router.ts

setMealCounts: protectedProcedure
  .input(setMealCountsSchema)
  .mutation(async ({ ctx, input }) => {
    const session = await getOrCreateSession(ctx.userId);

    await db.update(wizardSessions)
      .set({
        totalMealCount: input.total,
        manualPickCount: input.manualPicks,
        targetMealCount: input.total - input.manualPicks, // AI target
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    return { success: true };
  }),
```

**wizard.addManualPick**
```typescript
addManualPick: protectedProcedure
  .input(addManualPickSchema)
  .mutation(async ({ ctx, input }) => {
    const session = await getActiveSession(ctx.userId);

    // Get recipe from history
    const recipe = await recipeDataService.getById(input.recipeId);
    if (!recipe) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' });
    }

    // Check not already picked
    const currentPicks = session.manualPickIds as ManualPickEntry[];
    if (currentPicks.some(p => p.recipeId === input.recipeId)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Recipe already selected' });
    }

    // Check not exceeding limit
    if (currentPicks.length >= session.manualPickCount) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum picks reached' });
    }

    // Add to picks
    const newPick: ManualPickEntry = {
      recipeId: input.recipeId,
      recipeName: recipe.name,
      servings: input.servings,
      addedAt: new Date().toISOString(),
    };

    await db.update(wizardSessions)
      .set({
        manualPickIds: JSON.stringify([...currentPicks, newPick]),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    return { success: true, pick: newPick };
  }),
```

**wizard.removeManualPick**
```typescript
removeManualPick: protectedProcedure
  .input(removeManualPickSchema)
  .mutation(async ({ ctx, input }) => {
    const session = await getActiveSession(ctx.userId);

    const currentPicks = session.manualPickIds as ManualPickEntry[];
    const filtered = currentPicks.filter(p => p.recipeId !== input.recipeId);

    if (filtered.length === currentPicks.length) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pick not found' });
    }

    await db.update(wizardSessions)
      .set({
        manualPickIds: JSON.stringify(filtered),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    return { success: true };
  }),
```

**wizard.getManualPicks**
```typescript
getManualPicks: protectedProcedure
  .query(async ({ ctx }) => {
    const session = await getActiveSession(ctx.userId);
    const picks = session.manualPickIds as ManualPickEntry[];

    // Enrich with full recipe data for display
    const enriched = await Promise.all(
      picks.map(async (pick) => {
        const recipe = await recipeDataService.getById(pick.recipeId);
        return {
          ...pick,
          recipe: recipe ?? null,
        };
      })
    );

    return {
      picks: enriched,
      target: session.manualPickCount,
      complete: picks.length >= session.manualPickCount,
    };
  }),
```

**wizard.completeManualPicks**
```typescript
completeManualPicks: protectedProcedure
  .mutation(async ({ ctx }) => {
    const session = await getActiveSession(ctx.userId);
    const picks = session.manualPickIds as ManualPickEntry[];

    if (picks.length < session.manualPickCount) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Need ${session.manualPickCount - picks.length} more picks`,
      });
    }

    // Create accepted_meals records for manual picks
    const batch = await getBatchById(session.newBatchId);
    const startDate = new Date(batch.dateRangeStart);

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const recipe = await recipeDataService.getById(pick.recipeId);

      // Assign dates sequentially from batch start
      const mealDate = new Date(startDate);
      mealDate.setDate(mealDate.getDate() + i);

      await db.insert(acceptedMeals).values({
        id: nanoid(),
        batchId: session.newBatchId,
        suggestionId: null, // No AI suggestion
        suggestionIndex: null,
        date: mealDate.toISOString().split('T')[0],
        mealType: 'dinner',
        recipeName: recipe.name,
        recipeData: recipe,
        servings: pick.servings,
        isManualPick: true, // New field to distinguish
        completed: false,
        createdAt: new Date().toISOString(),
      });
    }

    // If no AI picks needed, skip to step 3
    const aiCount = session.totalMealCount - session.manualPickCount;
    if (aiCount === 0) {
      await db.update(wizardSessions)
        .set({ currentStep: 3 })
        .where(eq(wizardSessions.id, session.id));
    }

    return {
      success: true,
      nextStep: aiCount === 0 ? 3 : '2c', // Signal to frontend
      aiCount,
    };
  }),
```

### Modified Procedures

**wizard.requestMoreSuggestions**
```typescript
// Modify to:
// 1. Use aiCount (total - manual) as target
// 2. Pass manual picks to Claude so it avoids duplicates

requestMoreSuggestions: protectedProcedure
  .input(requestSuggestionsSchema)
  .mutation(async ({ ctx, input }) => {
    const session = await getActiveSession(ctx.userId);

    // Calculate AI target
    const aiCount = session.totalMealCount - session.manualPickCount;
    if (aiCount <= 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No AI suggestions needed',
      });
    }

    // Get manual picks to exclude
    const manualPicks = session.manualPickIds as ManualPickEntry[];
    const excludeRecipes = manualPicks.map(p => p.recipeName);

    // Include in AI prompt context
    const enhancedInput = {
      ...input,
      count: aiCount,
      excludeRecipes, // AI should not suggest these
      manualPicksContext: manualPicks.map(p => ({
        name: p.recipeName,
        // Could include cuisine, etc. for variety balancing
      })),
    };

    // ... rest of existing logic
  }),
```

## Frontend Components

### New Components

**PlanBatchStep.tsx** (Step 2a)
```typescript
// apps/web/src/modules/recipes/components/wizard/steps/PlanBatchStep.tsx

interface PlanBatchStepProps {
  session: WizardSession;
  onStepComplete: () => void;
}

export function PlanBatchStep({ session, onStepComplete }: PlanBatchStepProps) {
  const [total, setTotal] = useState(session.totalMealCount ?? 5);
  const [manual, setManual] = useState(session.manualPickCount ?? 0);

  const aiCount = total - manual;

  const setCountsMutation = trpc.recipes.wizard.setMealCounts.useMutation({
    onSuccess: onStepComplete,
  });

  const handleContinue = () => {
    setCountsMutation.mutate({ total, manualPicks: manual });
  };

  return (
    <div className="p-4 space-y-6">
      {/* Total meals counter */}
      <div className="space-y-2">
        <h2 className="text-lg font-medium">How many dinners?</h2>
        <CounterInput value={total} onChange={setTotal} min={1} max={21} />
      </div>

      <Separator />

      {/* Manual picks counter */}
      <div className="space-y-2">
        <h2 className="text-lg font-medium">How many will you choose?</h2>
        <CounterInput
          value={manual}
          onChange={setManual}
          min={0}
          max={total}
        />
      </div>

      {/* Summary */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4" />
          <span>Pick from library</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4" />
          <span>Import by URL</span>
        </div>
        <Separator />
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          <span>AI picks the rest: {aiCount}</span>
        </div>
      </Card>

      {/* Continue button */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full"
          onClick={handleContinue}
          disabled={setCountsMutation.isPending}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
```

**ManualPicksStep.tsx** (Step 2b)
```typescript
// apps/web/src/modules/recipes/components/wizard/steps/ManualPicksStep.tsx

export function ManualPicksStep({ session, onStepComplete }: ManualPicksStepProps) {
  const [librarySheetOpen, setLibrarySheetOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  const { data: picksData } = trpc.recipes.wizard.getManualPicks.useQuery();
  const picks = picksData?.picks ?? [];
  const target = picksData?.target ?? 0;

  const removeMutation = trpc.recipes.wizard.removeManualPick.useMutation({
    onSuccess: () => utils.recipes.wizard.getManualPicks.invalidate(),
  });

  const completeMutation = trpc.recipes.wizard.completeManualPicks.useMutation({
    onSuccess: onStepComplete,
  });

  const canContinue = picks.length >= target;
  const aiCount = session.totalMealCount - session.manualPickCount;

  return (
    <div className="p-4 space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Your Picks</h2>
        <Badge variant="outline">{picks.length} of {target}</Badge>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setImportSheetOpen(true)}
        >
          <Link2 className="h-4 w-4 mr-2" />
          Import by URL
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setLibrarySheetOpen(true)}
        >
          <BookOpen className="h-4 w-4 mr-2" />
          Pick from Library
        </Button>
      </div>

      {/* Selected recipes */}
      {picks.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Selected</h3>
            {picks.map((pick) => (
              <ManualPickCard
                key={pick.recipeId}
                pick={pick}
                onRemove={() => removeMutation.mutate({ recipeId: pick.recipeId })}
              />
            ))}
          </div>
        </>
      )}

      {/* Library picker sheet */}
      <LibraryPickerSheet
        open={librarySheetOpen}
        onOpenChange={setLibrarySheetOpen}
        excludeIds={picks.map(p => p.recipeId)}
        onSelect={(recipeId, servings) => {
          // Add pick then close
        }}
      />

      {/* Import sheet (existing component) */}
      <RecipeImportSheet
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
        onSuccess={(recipe) => {
          // Auto-add imported recipe to picks
          addPickMutation.mutate({ recipeId: recipe.id, servings: 4 });
        }}
      />

      {/* Continue button */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t">
        <Button
          className="w-full"
          onClick={() => completeMutation.mutate()}
          disabled={!canContinue || completeMutation.isPending}
        >
          {canContinue
            ? aiCount > 0
              ? 'Continue to AI Picks'
              : 'Continue to Shopping'
            : `Select ${target - picks.length} more`
          }
        </Button>
      </div>
    </div>
  );
}
```

**LibraryPickerSheet.tsx**
```typescript
// apps/web/src/modules/recipes/components/wizard/LibraryPickerSheet.tsx

interface LibraryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeIds: string[];
  onSelect: (recipeId: string, servings: number) => void;
}

export function LibraryPickerSheet({
  open,
  onOpenChange,
  excludeIds,
  onSelect
}: LibraryPickerSheetProps) {
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);

  const { data: recipesData } = trpc.recipes.history.getAll.useQuery({
    search: search || undefined,
    cuisine: cuisine || undefined,
    sortBy: 'timesMade',
    sortOrder: 'desc',
  });

  const { data: cuisines } = trpc.recipes.history.getCuisines.useQuery();

  // Filter out already selected
  const recipes = (recipesData?.recipes ?? [])
    .filter(r => !excludeIds.includes(r.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh]">
        <SheetHeader>
          <SheetTitle>Pick a Recipe</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 pb-4">
          <Select value={cuisine ?? ''} onValueChange={setCuisine}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Cuisines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Cuisines</SelectItem>
              {cuisines?.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Recipe list */}
        <ScrollArea className="h-[calc(100%-140px)]">
          <div className="space-y-2 pb-4">
            {recipes.map((recipe) => (
              <LibraryRecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={() => {
                  onSelect(recipe.id, recipe.defaultServings);
                  onOpenChange(false);
                }}
              />
            ))}
            {recipes.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No recipes found
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
```

**ManualPickCard.tsx**
```typescript
// apps/web/src/modules/recipes/components/wizard/ManualPickCard.tsx

interface ManualPickCardProps {
  pick: ManualPickEntry & { recipe: HistoryRecipe | null };
  onRemove: () => void;
}

export function ManualPickCard({ pick, onRemove }: ManualPickCardProps) {
  const recipe = pick.recipe;

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{pick.recipeName}</h4>
          {recipe && (
            <p className="text-sm text-muted-foreground">
              {recipe.cuisine} · {recipe.totalTimeMinutes} min · Effort {recipe.effort}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
```

### Modified Components

**NewBatchWizard.tsx**
```typescript
// Update step rendering to include new sub-steps

const renderStep = () => {
  switch (session.currentStep) {
    case 1:
      return <ManageBatchStep session={session} onStepComplete={handleStepComplete} />;
    case 2:
      // Sub-step routing for step 2
      return renderStep2();
    case 3:
      return <ManageShoppingStep session={session} onStepComplete={handleStepComplete} />;
    case 4:
      return <CompletionStep session={session} onFinish={handleFinish} />;
  }
};

const renderStep2 = () => {
  // Determine which sub-step based on session state
  if (session.totalMealCount === null) {
    // 2a: Haven't set counts yet
    return <PlanBatchStep session={session} onStepComplete={handleStepComplete} />;
  }

  const manualPicks = session.manualPickIds?.length ?? 0;
  const manualTarget = session.manualPickCount ?? 0;

  if (manualTarget > 0 && manualPicks < manualTarget) {
    // 2b: Need more manual picks
    return <ManualPicksStep session={session} onStepComplete={handleStepComplete} />;
  }

  const aiTarget = session.totalMealCount - manualTarget;
  if (aiTarget > 0) {
    // 2c: AI suggestions needed
    return <GetSuggestionsStep session={session} onStepComplete={handleStepComplete} />;
  }

  // Edge case: all manual, no AI - should have moved to step 3
  return <GetSuggestionsStep session={session} onStepComplete={handleStepComplete} />;
};
```

**GetSuggestionsStep.tsx**
```typescript
// Modify to:
// 1. Show correct target (AI target, not total)
// 2. Update progress text

// Change from:
const targetCount = session.targetMealCount ?? 4;

// To:
const aiTarget = (session.totalMealCount ?? 4) - (session.manualPickCount ?? 0);
const targetCount = aiTarget;

// Update progress text
<SuggestionProgress
  accepted={acceptedCount}
  target={targetCount}
  label="AI suggestions"  // New prop for clarity
/>
```

**RecipeImportSheet.tsx**
```typescript
// Add optional callback for wizard integration

interface RecipeImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recipe: HistoryRecipe) => void; // NEW: callback after save
}

// In SuccessStep, call onSuccess if provided
const handleDone = () => {
  if (onSuccess && savedRecipe) {
    onSuccess(savedRecipe);
  }
  handleClose();
};
```

## Database Migration

```sql
-- Migration: Add wizard recipe selection columns

ALTER TABLE wizard_sessions ADD COLUMN total_meal_count INTEGER;
ALTER TABLE wizard_sessions ADD COLUMN manual_pick_count INTEGER DEFAULT 0;
ALTER TABLE wizard_sessions ADD COLUMN manual_pick_ids TEXT DEFAULT '[]';

-- Add flag to accepted_meals to distinguish manual vs AI picks
ALTER TABLE accepted_meals ADD COLUMN is_manual_pick INTEGER DEFAULT 0;
```

## Implementation Phases

### Phase 1: Backend Foundation
- [ ] Add database columns (migration)
- [ ] Add Zod schemas to shared package
- [ ] Implement `setMealCounts` procedure
- [ ] Implement `addManualPick` procedure
- [ ] Implement `removeManualPick` procedure
- [ ] Implement `getManualPicks` procedure
- [ ] Implement `completeManualPicks` procedure
- [ ] Modify `requestMoreSuggestions` to use AI count and exclude manual picks

### Phase 2: Step 2a UI
- [ ] Create `PlanBatchStep` component
- [ ] Create `CounterInput` reusable component (if not exists)
- [ ] Wire up to wizard routing
- [ ] Test flow: set counts → proceed

### Phase 3: Step 2b UI
- [ ] Create `ManualPicksStep` component
- [ ] Create `LibraryPickerSheet` component
- [ ] Create `ManualPickCard` component
- [ ] Create `LibraryRecipeCard` component
- [ ] Modify `RecipeImportSheet` to accept onSuccess callback
- [ ] Wire up import → auto-add to picks
- [ ] Test flow: pick from library, import by URL, remove picks

### Phase 4: Integration & Polish
- [ ] Update `NewBatchWizard` step routing logic
- [ ] Update `GetSuggestionsStep` to show AI-specific target
- [ ] Handle edge cases (manual=0, ai=0, mid-wizard count changes)
- [ ] Add loading states and error handling
- [ ] Test complete flow end-to-end
- [ ] Mobile responsiveness testing

## Edge Cases

### Manual = 0 (100% AI)
- Skip Step 2b entirely
- Same as current behavior

### AI = 0 (100% Manual)
- Skip Step 2c entirely
- Go directly from Step 2b to Step 3

### User Changes Mind Mid-Wizard
- Allow going back to Step 2a (reset counts)
- Warn if this will clear existing picks
- Consider: allow adding more via "+" button without full reset

### Import Fails
- Show error in RecipeImportSheet
- Don't add to picks
- User can retry or pick from library instead

### Recipe Already Selected
- Disable/hide in library picker
- Show "Already selected" badge if needed

### Empty Library
- Show helpful message in picker
- Encourage using "Import by URL" instead

## Future Enhancements

1. **Servings adjustment** in manual picks step (not just default)
2. **Date assignment** UI for manual picks (vs sequential)
3. **Drag-and-drop reordering** of selected recipes
4. **Quick filters** in library picker (favorites, recently made, etc.)
5. **AI-assisted selection** - "Pick 3 recipes like this one"
