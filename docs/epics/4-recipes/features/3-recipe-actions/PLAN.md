# Feature: Recipe Actions

## Overview

This feature handles all actions users can take on recipes within the active batch: viewing details, marking complete, rejecting with feedback, and adjusting servings. The core interaction happens on the main recipes page with recipe cards.

**Key Difference from Original**: No accept/reject flow for "suggestions". Recipes are in the batch and users either complete them, reject them (with feedback that updates preferences), or call an audible (separate feature).

## User Stories

- As a user, I want to view full recipe details (ingredients, instructions)
- As a user, I want to mark a recipe as completed when I've cooked it
- As a user, I want to reject recipes I don't want with feedback
- As a user, I want my rejection feedback to improve future suggestions
- As a user, I want to adjust servings for a recipe
- As a user, I want to reorder recipes in my batch

## Acceptance Criteria

- [ ] View recipe detail (ingredients, instructions, source link)
- [ ] Complete button marks recipe as done (grayed out)
- [ ] Reject button opens feedback modal
- [ ] Rejection feedback updates preferences automatically
- [ ] Rejection triggers single replacement request
- [ ] Servings control adjusts quantity
- [ ] Drag to reorder recipes (optional)
- [ ] WebSocket sync for multi-device

---

## Technical Details

### Recipe States

```typescript
type RecipeStatus = 'active' | 'completed' | 'audible_original' | 'audible_replacement';

// Visual representation:
// - active: Normal card with all actions
// - completed: Grayed out, no actions
// - audible_original: Struck through + grayed, shows replacement above
// - audible_replacement: Normal but positioned above its original
```

### Rejection Reasons

```typescript
const REJECTION_REASONS = {
  dont_like_cuisine: "Don't like this cuisine",
  dont_like_ingredient: "Don't like an ingredient",
  too_complex: 'Too complex/time-consuming',
  had_recently: 'Had this or similar recently',
  not_in_mood: 'Not in the mood for this',
  other: 'Other reason',
} as const;

type RejectionReason = keyof typeof REJECTION_REASONS;
```

### Data Model Addition

```typescript
// Rejection feedback (tracks why recipes were rejected)
export const rejectionFeedback = sqliteTable('rejection_feedback', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  batchRecipeId: text('batch_recipe_id').references(() => batchRecipes.id, { onDelete: 'cascade' }),

  // What was rejected
  recipeName: text('recipe_name').notNull(),

  // Why
  reason: text('reason').notNull().$type<RejectionReason>(),
  details: text('details'),

  // What preference update was made
  preferenceUpdate: text('preference_update', { mode: 'json' }).$type<PreferenceUpdate | null>(),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

interface PreferenceUpdate {
  type: 'ingredient' | 'note';
  ingredient?: string;
  preference?: 'dislike' | 'never';
  noteContent?: string;
}
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/recipes.ts

import { router, protectedProcedure } from '../../../trpc';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { batchRecipes, rejectionFeedback, ingredientPreferences, mealPreferenceNotes } from '../../../db/schema';
import { mealSuggestionsService } from '../../../services/meal-suggestions';
import { socketEmitter } from '../../../services/websocket';

export const recipesActionRouter = router({
  // Mark recipe as completed
  complete: protectedProcedure
    .input(z.object({ recipeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const recipe = await ctx.db.query.batchRecipes.findFirst({
        where: eq(batchRecipes.id, input.recipeId),
      });

      if (!recipe) {
        throw new Error('Recipe not found');
      }

      if (recipe.status !== 'active') {
        throw new Error('Can only complete active recipes');
      }

      const [updated] = await ctx.db.update(batchRecipes)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
        .where(eq(batchRecipes.id, input.recipeId))
        .returning();

      socketEmitter.broadcast('recipes:recipe:completed', {
        batchId: recipe.batchId,
        recipeId: recipe.id,
      });

      return updated;
    }),

  // Reject recipe with feedback
  reject: protectedProcedure
    .input(z.object({
      recipeId: z.string(),
      reason: z.enum(['dont_like_cuisine', 'dont_like_ingredient', 'too_complex', 'had_recently', 'not_in_mood', 'other']),
      details: z.string().optional(),
      ingredientToDislike: z.string().optional(),  // For 'dont_like_ingredient'
    }))
    .mutation(async ({ ctx, input }) => {
      const recipe = await ctx.db.query.batchRecipes.findFirst({
        where: eq(batchRecipes.id, input.recipeId),
        with: { batch: true },
      });

      if (!recipe) {
        throw new Error('Recipe not found');
      }

      // Update preferences based on rejection reason
      let preferenceUpdate: PreferenceUpdate | null = null;

      if (input.reason === 'dont_like_ingredient' && input.ingredientToDislike) {
        // Add/update ingredient preference
        await ctx.db.insert(ingredientPreferences)
          .values({
            userId: ctx.userId,
            ingredient: input.ingredientToDislike.toLowerCase(),
            preference: 'dislike',
            source: 'rejection_feedback',
          })
          .onConflictDoUpdate({
            target: [ingredientPreferences.userId, ingredientPreferences.ingredient],
            set: {
              preference: 'dislike',
              source: 'rejection_feedback',
              updatedAt: new Date().toISOString(),
            },
          });

        preferenceUpdate = {
          type: 'ingredient',
          ingredient: input.ingredientToDislike,
          preference: 'dislike',
        };
      } else if (input.reason === 'dont_like_cuisine') {
        // Add note about cuisine preference
        const recipeData = recipe.recipeData as RecipeData;
        await ctx.db.insert(mealPreferenceNotes).values({
          userId: ctx.userId,
          noteType: 'rule',
          content: `Avoid ${recipeData.cuisine} cuisine`,
          source: 'rejection_feedback',
        });

        preferenceUpdate = {
          type: 'note',
          noteContent: `Avoid ${recipeData.cuisine} cuisine`,
        };
      }

      // Record rejection feedback
      await ctx.db.insert(rejectionFeedback).values({
        userId: ctx.userId,
        batchRecipeId: input.recipeId,
        recipeName: recipe.recipeName,
        reason: input.reason,
        details: input.details,
        preferenceUpdate,
      });

      // Delete the rejected recipe from batch
      await ctx.db.delete(batchRecipes)
        .where(eq(batchRecipes.id, input.recipeId));

      // Request replacement (async)
      requestSingleReplacement(ctx, recipe.batchId)
        .catch(err => console.error('Replacement request failed:', err));

      socketEmitter.broadcast('recipes:recipe:rejected', {
        batchId: recipe.batchId,
        recipeId: input.recipeId,
      });

      return { success: true, preferenceUpdate };
    }),

  // Update servings
  setServings: protectedProcedure
    .input(z.object({
      recipeId: z.string(),
      servings: z.number().min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(batchRecipes)
        .set({ servings: input.servings })
        .where(eq(batchRecipes.id, input.recipeId))
        .returning();

      return updated;
    }),

  // Reorder recipes in batch
  reorder: protectedProcedure
    .input(z.object({
      recipeIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Update sort order for each recipe
      for (let i = 0; i < input.recipeIds.length; i++) {
        await ctx.db.update(batchRecipes)
          .set({ sortOrder: i })
          .where(eq(batchRecipes.id, input.recipeIds[i]));
      }

      return { success: true };
    }),

  // Get single recipe details
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.batchRecipes.findFirst({
        where: eq(batchRecipes.id, input),
      });
    }),
});

// Helper to request single replacement
async function requestSingleReplacement(ctx: Context, batchId: string) {
  // Get current batch recipes to avoid
  const existing = await ctx.db.query.batchRecipes.findMany({
    where: eq(batchRecipes.batchId, batchId),
  });

  const currentBatchRecipes = existing.map(r => r.recipeName);

  // ... build input and call skill for count=1
}
```

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:recipe:completed` | Server->Client | `{ batchId, recipeId }` |
| `recipes:recipe:rejected` | Server->Client | `{ batchId, recipeId, replacementId? }` |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `RecipeCard` | Main card with status-based rendering |
| `RecipeCardActive` | Active recipe with all actions |
| `RecipeCardCompleted` | Grayed out completed recipe |
| `RecipeCardAudible` | Struck through original + replacement |
| `RecipeDetailSheet` | Full recipe view (sheet/modal) |
| `CompleteButton` | Mark as cooked |
| `RejectButton` | Opens RejectModal |
| `RejectModal` | Reason select + details + ingredient picker |
| `ServingsControl` | +/- servings adjustment |

### Component Implementation

```typescript
// apps/web/src/modules/recipes/components/RecipeCard.tsx

import { cn } from '@/lib/utils';
import { RecipeCardActive } from './RecipeCardActive';
import { RecipeCardCompleted } from './RecipeCardCompleted';
import { RecipeCardAudible } from './RecipeCardAudible';

interface Props {
  recipe: BatchRecipe;
  replacement?: BatchRecipe;  // For audible_original
}

export function RecipeCard({ recipe, replacement }: Props) {
  switch (recipe.status) {
    case 'active':
    case 'audible_replacement':
      return <RecipeCardActive recipe={recipe} />;

    case 'completed':
      return <RecipeCardCompleted recipe={recipe} />;

    case 'audible_original':
      return (
        <RecipeCardAudible
          original={recipe}
          replacement={replacement}
        />
      );

    default:
      return null;
  }
}
```

```typescript
// apps/web/src/modules/recipes/components/RecipeCardActive.tsx

import { trpc } from '@/services/trpc';
import { Button } from '@/components/ui/button';
import { Clock, ChefHat, Check, X, RotateCcw } from 'lucide-react';

export function RecipeCardActive({ recipe }: { recipe: BatchRecipe }) {
  const utils = trpc.useUtils();
  const [showReject, setShowReject] = useState(false);

  const complete = trpc.recipes.recipes.complete.useMutation({
    onSuccess: () => utils.recipes.batch.getActive.invalidate(),
  });

  const recipeData = recipe.recipeData as RecipeData;

  return (
    <div className="p-4 rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-lg">{recipe.recipeName}</h3>
          <span className="text-sm text-muted-foreground">{recipeData.cuisine}</span>
        </div>
        <ServingsControl recipe={recipe} />
      </div>

      {/* Quick info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          {recipeData.totalTimeMinutes} min
        </span>
        <span className="flex items-center gap-1">
          <ChefHat className="h-4 w-4" />
          {'*'.repeat(recipeData.effort)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => openDetail(recipe)}
        >
          View
        </Button>

        <Button
          variant="default"
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          onClick={() => complete.mutate({ recipeId: recipe.id })}
          disabled={complete.isPending}
        >
          <Check className="h-4 w-4 mr-1" />
          Complete
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-orange-500 border-orange-500"
          onClick={() => setShowReject(true)}
        >
          <X className="h-4 w-4 mr-1" />
          Reject
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => openAudible(recipe)}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Audible
        </Button>
      </div>

      <RejectModal
        open={showReject}
        onClose={() => setShowReject(false)}
        recipe={recipe}
      />
    </div>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/RejectModal.tsx

import { useState } from 'react';
import { trpc } from '@/services/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const REASONS = [
  { value: 'dont_like_cuisine', label: "Don't like this cuisine" },
  { value: 'dont_like_ingredient', label: "Don't like an ingredient" },
  { value: 'too_complex', label: 'Too complex/time-consuming' },
  { value: 'had_recently', label: 'Had this or similar recently' },
  { value: 'not_in_mood', label: 'Not in the mood for this' },
  { value: 'other', label: 'Other reason' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  recipe: BatchRecipe;
}

export function RejectModal({ open, onClose, recipe }: Props) {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [ingredient, setIngredient] = useState('');

  const utils = trpc.useUtils();
  const reject = trpc.recipes.recipes.reject.useMutation({
    onSuccess: (data) => {
      utils.recipes.batch.getActive.invalidate();
      onClose();

      // Show toast if preference was updated
      if (data.preferenceUpdate) {
        toast.success('Updated your preferences based on this feedback');
      }
    },
  });

  const recipeData = recipe.recipeData as RecipeData;
  const ingredients = recipeData.ingredients.map(i => i.name);

  const handleSubmit = () => {
    reject.mutate({
      recipeId: recipe.id,
      reason: reason as any,
      details: details || undefined,
      ingredientToDislike: reason === 'dont_like_ingredient' ? ingredient : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Why don't you want this recipe?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reason select */}
          <div className="space-y-2">
            <Label>Reason</Label>
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

          {/* Ingredient selector (conditional) */}
          {reason === 'dont_like_ingredient' && (
            <div className="space-y-2">
              <Label>Which ingredient?</Label>
              <Select value={ingredient} onValueChange={setIngredient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ingredient..." />
                </SelectTrigger>
                <SelectContent>
                  {ingredients.map(ing => (
                    <SelectItem key={ing} value={ing}>
                      {ing}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This will be added to your "dislike" list
              </p>
            </div>
          )}

          {/* Optional details */}
          <div className="space-y-2">
            <Label>Additional details (optional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Any other feedback..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!reason || reject.isPending}
            >
              Reject & Get Replacement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Preference Update Logic

When rejection reason is `dont_like_ingredient`:
1. Add ingredient to `ingredient_preferences` with `preference: 'dislike'`
2. Set `source: 'rejection_feedback'`
3. Future suggestions will avoid this ingredient

When rejection reason is `dont_like_cuisine`:
1. Add note to `meal_preference_notes` like "Avoid Italian cuisine"
2. Set `source: 'rejection_feedback'`
3. Future suggestions will reduce this cuisine frequency

---

## Edge Cases

- **Reject last recipe**: Valid, batch becomes empty
- **Reject during skill call**: Queue rejection, apply after
- **Double-click complete**: Ignore if already completed
- **Replacement fails**: Show error, allow manual retry

---

## Testing

- Unit: Rejection preference update logic
- Unit: Status transitions
- Integration: Complete -> history flow
- Integration: Reject -> replacement flow
- E2E: Full reject with ingredient feedback
