# Feature: Audible System

## Overview

The Audible system handles emergency recipe swaps when something goes wrong: missing a crucial ingredient, ran out of time, or just not in the mood anymore. Unlike rejection (which removes and replaces), an audible keeps the original visible (struck through) with the replacement above it - acknowledging that plans changed without erasing the history.

**Key Concept**: An audible is like calling a play change in football - you had a plan, circumstances changed, pivot gracefully.

**Important**: Neither the original nor the audible replacement are added to recipe history. They're ephemeral - when the batch clears, they're gone.

## User Stories

- As a user, I want to call an audible when I can't cook a planned recipe
- As a user, I want to select why I'm calling the audible
- As a user, I want to specify time constraints if I'm in a rush
- As a user, I want AI to suggest something using remaining ingredients + pantry staples
- As a user, I want to see both the original (struck through) and replacement
- As a user, I want audibles to leave no trace in my history

## Acceptance Criteria

- [ ] "Audible" button on active recipes
- [ ] Modal with reason selection (missing ingredient, time crunch, mood change, other)
- [ ] Time input when reason is "time crunch"
- [ ] Optional details field
- [ ] AI generates replacement using original's ingredients + staples
- [ ] Original recipe marked as `audible_original` (struck through + grayed)
- [ ] Replacement appears above original with `audible_replacement` status
- [ ] Neither goes to history on batch clear
- [ ] Can complete the replacement normally

---

## Technical Details

### Audible Reasons

```typescript
const AUDIBLE_REASONS = {
  missing_ingredient: 'Missing a crucial ingredient',
  time_crunch: 'Not enough time to cook this',
  mood_change: 'In the mood for something different',
  other: 'Other reason',
} as const;

type AudibleReason = keyof typeof AUDIBLE_REASONS;
```

### Pantry Staples

```typescript
// Assumed available for audible replacements
const PANTRY_STAPLES = [
  // Oils & Fats
  'olive oil', 'vegetable oil', 'butter',
  // Seasonings
  'salt', 'black pepper', 'garlic', 'onion',
  // Basics
  'eggs', 'flour', 'sugar', 'rice', 'pasta',
  // Dairy
  'milk', 'parmesan cheese',
  // Canned/Jarred
  'canned tomatoes', 'chicken broth', 'soy sauce',
  // Aromatics
  'lemon', 'dried herbs',
];
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/recipes.ts

// Add to recipesActionRouter:

  // Call audible on a recipe
  audible: protectedProcedure
    .input(z.object({
      recipeId: z.string(),
      reason: z.enum(['missing_ingredient', 'time_crunch', 'mood_change', 'other']),
      details: z.string().optional(),
      maxMinutes: z.number().optional(),  // For time_crunch
    }))
    .mutation(async ({ ctx, input }) => {
      const recipe = await ctx.db.query.batchRecipes.findFirst({
        where: eq(batchRecipes.id, input.recipeId),
        with: { batch: true },
      });

      if (!recipe) {
        throw new Error('Recipe not found');
      }

      if (recipe.status !== 'active') {
        throw new Error('Can only audible active recipes');
      }

      // Mark original as audible
      await ctx.db.update(batchRecipes)
        .set({
          status: 'audible_original',
          audibleReason: input.reason,
          audibleDetails: input.details,
        })
        .where(eq(batchRecipes.id, input.recipeId));

      // Get user preferences
      const prefs = await ctx.db.query.mealPreferences.findFirst({
        where: eq(mealPreferences.userId, ctx.userId),
      });

      // Build audible request
      const recipeData = recipe.recipeData as RecipeData;
      const audibleInput: AudibleRequestInput = {
        type: 'audible',
        originalRecipe: {
          name: recipeData.name,
          ingredients: recipeData.ingredients,
          cuisine: recipeData.cuisine,
        },
        reason: input.reason,
        details: input.details,
        maxMinutes: input.reason === 'time_crunch'
          ? input.maxMinutes ?? prefs?.quickMealMaxMinutes ?? 30
          : undefined,
        pantryStaples: PANTRY_STAPLES,
        preferences: await exportPreferences(ctx),
        ingredientPreferences: await exportIngredientPreferences(ctx),
        notes: await exportNotes(ctx),
      };

      // Call skill for audible replacement
      mealSuggestionsService.getAudibleSuggestion(audibleInput)
        .then(async (output) => {
          const suggestion = output.suggestions[0];
          if (!suggestion) {
            throw new Error('No replacement suggestion returned');
          }

          // Create replacement recipe (positioned above original)
          const [replacement] = await ctx.db.insert(batchRecipes)
            .values({
              batchId: recipe.batchId,
              recipeName: suggestion.recipe.name,
              recipeData: suggestion.recipe,
              status: 'audible_replacement',
              audibleOriginalId: recipe.id,
              servings: prefs?.defaultServings ?? suggestion.recipe.defaultServings,
              sortOrder: recipe.sortOrder,  // Same sort order, displayed above
            })
            .returning();

          socketEmitter.broadcast('recipes:recipe:audible', {
            batchId: recipe.batchId,
            originalId: recipe.id,
            replacementId: replacement.id,
          });
        })
        .catch(async (error) => {
          // Revert original status on failure
          await ctx.db.update(batchRecipes)
            .set({
              status: 'active',
              audibleReason: null,
              audibleDetails: null,
            })
            .where(eq(batchRecipes.id, input.recipeId));

          socketEmitter.toUser(ctx.userId, 'recipes:audible:error', {
            recipeId: input.recipeId,
            error: error.message,
          });
        });

      return { status: 'pending' };
    }),
```

### Audible Skill Service

```typescript
// apps/api/src/services/meal-suggestions.ts

// Add to MealSuggestionsService:

async getAudibleSuggestion(input: AudibleRequestInput): Promise<SkillOutput> {
  const userPrompt = this.buildAudiblePrompt(input);

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '-p',
      '--output-format', 'json',
      '--allowedTools', 'Read',
      '--max-turns', '3',
      userPrompt,
    ], {
      cwd: this.config.projectRoot,
      timeout: this.config.timeout,
      env: process.env,
    });

    // ... same handling as getBatchSuggestions
  });
}

private buildAudiblePrompt(input: AudibleRequestInput): string {
  return `
Please suggest an emergency replacement meal.

## Request Type
audible

## Reason
${input.reason}

## Details
${input.details || 'None provided'}

${input.maxMinutes ? `## Max Minutes\n${input.maxMinutes}` : ''}

## Original Recipe (ingredients available)
${JSON.stringify(input.originalRecipe, null, 2)}

## Pantry Staples (assumed available)
${input.pantryStaples.join(', ')}

## Preferences
${JSON.stringify(input.preferences, null, 2)}

## Ingredient Preferences
${JSON.stringify(input.ingredientPreferences, null, 2)}

## Freeform Notes/Rules
${input.notes.map(n => \`[\${n.type}] \${n.content}\`).join('\n')}

Create a simple, quick meal using the available ingredients from the original recipe plus pantry staples.
${input.maxMinutes ? \`The meal should be ready in under ${input.maxMinutes} minutes.\` : ''}
Return as JSON matching the output format.
`.trim();
}
```

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:recipe:audible` | Server->Client | `{ batchId, originalId, replacementId }` |
| `recipes:audible:error` | Server->Client | `{ recipeId, error }` |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `AudibleButton` | Opens audible modal |
| `AudibleModal` | Reason select + time input + details |
| `RecipeCardAudible` | Shows replacement above struck original |

### Component Implementation

```typescript
// apps/web/src/modules/recipes/components/AudibleModal.tsx

import { useState } from 'react';
import { trpc } from '@/services/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, RotateCcw } from 'lucide-react';

const REASONS = [
  { value: 'missing_ingredient', label: 'Missing a crucial ingredient' },
  { value: 'time_crunch', label: 'Not enough time' },
  { value: 'mood_change', label: 'Want something different' },
  { value: 'other', label: 'Other reason' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: BatchRecipe;
}

export function AudibleModal({ open, onClose, recipe }: Props) {
  const [reason, setReason] = useState<string>('');
  const [maxMinutes, setMaxMinutes] = useState(20);
  const [details, setDetails] = useState('');

  const utils = trpc.useUtils();
  const audible = trpc.recipes.recipes.audible.useMutation({
    onSuccess: () => {
      utils.recipes.batch.getActive.invalidate();
      onClose();
      toast.info('Finding a replacement...');
    },
  });

  const handleSubmit = () => {
    audible.mutate({
      recipeId: recipe.id,
      reason: reason as any,
      details: details || undefined,
      maxMinutes: reason === 'time_crunch' ? maxMinutes : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Call an Audible
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Can't cook <strong>{recipe.recipeName}</strong>? Let's find something else
            using the ingredients you already have.
          </p>

          {/* Reason select */}
          <div className="space-y-2">
            <Label>What happened?</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time input (conditional) */}
          {reason === 'time_crunch' && (
            <div className="space-y-2">
              <Label>How much time do you have?</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(Number(e.target.value))}
                  className="w-20"
                  min={5}
                  max={60}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
          )}

          {/* Optional details */}
          <div className="space-y-2">
            <Label>Anything else? (optional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Missing specific ingredient, dietary need, etc..."
              rows={2}
            />
          </div>

          {/* Info about what will happen */}
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
            AI will suggest a quick meal using ingredients from the original recipe
            plus common pantry staples. The original will stay visible (struck through)
            so you remember what you had planned.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!reason || audible.isPending}
            >
              {audible.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Find Replacement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/RecipeCardAudible.tsx

import { cn } from '@/lib/utils';
import { RecipeCardActive } from './RecipeCardActive';
import { Badge } from '@/components/ui/badge';
import { RotateCcw } from 'lucide-react';

interface Props {
  original: BatchRecipe;
  replacement?: BatchRecipe;
}

const REASON_LABELS = {
  missing_ingredient: 'Missing ingredient',
  time_crunch: 'No time',
  mood_change: 'Changed mind',
  other: 'Other',
};

export function RecipeCardAudible({ original, replacement }: Props) {
  const recipeData = original.recipeData as RecipeData;

  return (
    <div className="space-y-2">
      {/* Replacement (if ready) */}
      {replacement && (
        <div className="relative">
          <Badge
            variant="secondary"
            className="absolute -top-2 left-2 z-10 gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Replacement
          </Badge>
          <RecipeCardActive recipe={replacement} />
        </div>
      )}

      {/* Original (struck through) */}
      <div
        className={cn(
          'p-4 rounded-lg border bg-muted/50 opacity-60',
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg line-through text-muted-foreground">
              {original.recipeName}
            </h3>
            <span className="text-sm text-muted-foreground">{recipeData.cuisine}</span>
          </div>
        </div>

        {/* Reason badge */}
        <div className="mt-2">
          <Badge variant="outline" className="text-xs">
            {REASON_LABELS[original.audibleReason as AudibleReason] || 'Audible'}
          </Badge>
          {original.audibleDetails && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {original.audibleDetails}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Batch Clear Behavior

When creating a new batch:

| Recipe Status | What Happens |
|---------------|--------------|
| `active` | Rolls over to new batch |
| `completed` | Added to history, then deleted |
| `audible_original` | Deleted (no history) |
| `audible_replacement` | Deleted (no history) |

---

## Edge Cases

- **Audible on audible replacement**: Not allowed (replacement is already the fallback)
- **Skill returns nothing**: Revert original to active, show error
- **Multiple audibles in batch**: Each creates its own pair
- **Time constraint too short**: AI does its best, may suggest simpler options

---

## Testing

- Unit: Audible state transition logic
- Unit: Prompt building with ingredients
- Integration: Audible -> Replacement flow
- Integration: Batch clear excludes audibles from history
- E2E: Full audible flow with time constraint
