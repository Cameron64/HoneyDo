# Feature: Shopping List Generation

## Overview

This is the core integration point between Epic 4 (Recipes) and Epic 2 (Shopping List). Users select recipes from their active batch, generate an aggregated ingredient list, select which items they need (deselecting what they already have), adjust quantities, and add the selection to their main shopping list.

**Key Flow**: Select recipes from batch → Aggregate ingredients → Select needed items → Add to shopping list

**Key Change**: No longer date-based. Users select specific recipes from the active batch.

## User Stories

- As a user, I want to select which recipes to shop for from my batch
- As a user, I want ingredients from multiple recipes combined (e.g., 2 recipes needing chicken)
- As a user, I want quantities scaled based on my servings
- As a user, I want to deselect items I already have
- As a user, I want to adjust quantities before adding
- As a user, I want to choose which shopping list to add to
- As a user, I want to see which recipe each ingredient comes from
- As a user, I want the items added with their source noted

## Acceptance Criteria

- [ ] Recipe selector shows active batch recipes
- [ ] Aggregate ingredients from selected recipes
- [ ] Scale quantities based on per-recipe servings
- [ ] Combine duplicate ingredients (same name)
- [ ] Group by category (produce, dairy, meat, etc.)
- [ ] Checkbox per ingredient (all selected by default)
- [ ] Quantity adjustment controls
- [ ] Show source recipe(s) for each ingredient
- [ ] List selector dropdown (from Epic 2 lists)
- [ ] Add selected items to chosen list
- [ ] Mobile-optimized ingredient list

---

## Technical Details

### Aggregation Algorithm

```typescript
interface AggregatedIngredient {
  key: string;              // Normalized ingredient name
  name: string;             // Display name
  totalAmount: number;      // Combined, scaled amount
  unit: string | null;      // Primary unit
  category: string;         // Shopping category
  fromRecipes: string[];    // Recipe names this comes from
  selected: boolean;        // User selection state
  additionalAmounts?: {     // If units don't match
    amount: number;
    unit: string;
  }[];
}

function aggregateIngredients(recipes: BatchRecipe[]): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const recipe of recipes) {
    const recipeData = recipe.recipeData as RecipeData;
    const scaleFactor = recipe.servings / recipeData.defaultServings;

    for (const ing of recipeData.ingredients) {
      if (ing.optional) continue;  // Skip optional ingredients

      const key = normalizeIngredientName(ing.name);
      const scaledAmount = ing.amount * scaleFactor;

      if (map.has(key)) {
        const existing = map.get(key)!;

        if (canCombineUnits(existing.unit, ing.unit)) {
          const converted = convertUnits(scaledAmount, ing.unit, existing.unit);
          existing.totalAmount += converted;
        } else {
          existing.additionalAmounts = existing.additionalAmounts || [];
          existing.additionalAmounts.push({
            amount: scaledAmount,
            unit: ing.unit || '',
          });
        }

        if (!existing.fromRecipes.includes(recipe.recipeName)) {
          existing.fromRecipes.push(recipe.recipeName);
        }
      } else {
        map.set(key, {
          key,
          name: ing.name,
          totalAmount: scaledAmount,
          unit: ing.unit,
          category: ing.category || 'other',
          fromRecipes: [recipe.recipeName],
          selected: true,
        });
      }
    }
  }

  return Array.from(map.values());
}

function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    // Singularize common plurals
    .replace(/ies$/, 'y')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function canCombineUnits(unit1: string | null, unit2: string | null): boolean {
  if (unit1 === unit2) return true;
  // Volume conversions
  const volumes = ['cup', 'cups', 'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'ml', 'l', 'liter'];
  // Weight conversions
  const weights = ['lb', 'lbs', 'pound', 'oz', 'ounce', 'g', 'gram', 'kg'];

  const both = (list: string[]) =>
    list.some(u => unit1?.includes(u)) && list.some(u => unit2?.includes(u));

  return both(volumes) || both(weights);
}

function convertUnits(amount: number, from: string | null, to: string | null): number {
  // Basic conversions - expand as needed
  const conversions: Record<string, Record<string, number>> = {
    'cups': { 'tbsp': 16, 'tsp': 48 },
    'tbsp': { 'cups': 1/16, 'tsp': 3 },
    'tsp': { 'cups': 1/48, 'tbsp': 1/3 },
    'lb': { 'oz': 16 },
    'oz': { 'lb': 1/16 },
  };

  if (from === to) return amount;

  const fromKey = from?.toLowerCase() || '';
  const toKey = to?.toLowerCase() || '';

  if (conversions[fromKey]?.[toKey]) {
    return amount * conversions[fromKey][toKey];
  }

  return amount;  // No conversion available
}
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/shopping.ts

import { router, protectedProcedure } from '../../../trpc';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { batchRecipes, shoppingLists, shoppingItems } from '../../../db/schema';
import { aggregateIngredients } from '../services/ingredient-aggregator';
import { socketEmitter } from '../../../services/websocket';

const recipeSelectionSchema = z.object({
  recipeIds: z.array(z.string()).min(1),  // Selected recipe IDs from batch
});

const addToListSchema = z.object({
  listId: z.string(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
    note: z.string().optional(),
  })),
  recipeIds: z.array(z.string()),  // Recipes these came from (for reference)
});

export const shoppingRouter = router({
  // Get aggregated ingredients from selected batch recipes
  getIngredients: protectedProcedure
    .input(recipeSelectionSchema)
    .query(async ({ ctx, input }) => {
      const recipes = await ctx.db.query.batchRecipes.findMany({
        where: and(
          inArray(batchRecipes.id, input.recipeIds),
          // Only active or completed recipes (not audible_original)
          inArray(batchRecipes.status, ['active', 'completed']),
        ),
        with: { batch: true },
      });

      // Verify user owns these recipes
      const userOwns = recipes.every(r => r.batch.userId === ctx.userId);
      if (!userOwns) {
        throw new Error('Unauthorized');
      }

      const aggregated = aggregateIngredients(recipes);

      // Group by category
      const byCategory = aggregated.reduce((acc, ing) => {
        if (!acc[ing.category]) {
          acc[ing.category] = [];
        }
        acc[ing.category].push(ing);
        return acc;
      }, {} as Record<string, typeof aggregated>);

      return {
        ingredients: aggregated,
        byCategory,
        recipeIds: recipes.map(r => r.id),
        recipeCount: recipes.length,
      };
    }),

  // Get active batch recipes for selection
  getSelectableRecipes: protectedProcedure.query(async ({ ctx }) => {
    // Get user's active batch
    const activeBatch = await ctx.db.query.recipeBatches.findFirst({
      where: eq(recipeBatches.userId, ctx.userId),
      orderBy: (batches, { desc }) => [desc(batches.createdAt)],
      with: {
        recipes: {
          where: inArray(batchRecipes.status, ['active', 'completed']),
          orderBy: batchRecipes.sortOrder,
        },
      },
    });

    if (!activeBatch) {
      return { recipes: [], batchId: null };
    }

    return {
      recipes: activeBatch.recipes.map(r => ({
        id: r.id,
        name: r.recipeName,
        status: r.status,
        servings: r.servings,
        cuisine: (r.recipeData as RecipeData).cuisine,
        ingredientCount: (r.recipeData as RecipeData).ingredients.length,
      })),
      batchId: activeBatch.id,
    };
  }),

  // Get available shopping lists (for list selector)
  getAvailableLists: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.isArchived, false),
      orderBy: (lists, { desc }) => [desc(lists.isDefault), lists.name],
    });
  }),

  // Add selected ingredients to a shopping list
  addToList: protectedProcedure
    .input(addToListSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify list exists
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input.listId),
      });

      if (!list) {
        throw new Error('Shopping list not found');
      }

      // Create shopping items
      const items = input.ingredients.map((ing, index) => ({
        listId: input.listId,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        category: ing.category ?? 'other',
        note: ing.note ?? null,
        sortOrder: index,
        addedBy: ctx.userId,
      }));

      const insertedItems = await ctx.db.insert(shoppingItems)
        .values(items)
        .returning();

      // Emit WebSocket events
      for (const item of insertedItems) {
        socketEmitter.broadcast('shopping:item:added', item);
      }

      socketEmitter.broadcast('recipes:shopping:generated', {
        listId: input.listId,
        itemCount: insertedItems.length,
        recipeIds: input.recipeIds,
      });

      return {
        itemsAdded: insertedItems.length,
        listId: input.listId,
      };
    }),
});
```

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:shopping:generated` | Server→Client | `{ listId, itemCount }` |
| `shopping:item:added` | Server→Client | Shopping item (Epic 2 format) |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `ShoppingGenerationPage` | Main container with recipe selection + ingredient list |
| `RecipeSelector` | Multi-select for batch recipes |
| `IngredientList` | Full ingredient list with checkboxes |
| `CategorySection` | Grouped ingredients by category |
| `IngredientRow` | Single ingredient with controls |
| `QuantityControl` | Adjust quantity +/- |
| `SourceBadge` | Shows which recipe(s) need this |
| `ListSelector` | Dropdown to pick target list |
| `AddToListButton` | Submit selected items |

### Component Implementation

```typescript
// apps/web/src/modules/recipes/components/ShoppingGenerationPage.tsx

import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/services/trpc';
import { useNavigate } from '@tanstack/react-router';
import { IngredientRow } from './IngredientRow';
import { RecipeSelector } from './RecipeSelector';
import { ListSelector } from './ListSelector';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Loader2, ChefHat } from 'lucide-react';

const CATEGORY_ORDER = [
  'produce', 'dairy', 'meat', 'seafood', 'bakery',
  'frozen', 'canned', 'dry goods', 'spices', 'other',
];

export function ShoppingGenerationPage() {
  const navigate = useNavigate();

  // Step 1: Recipe selection
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  // Step 2: Ingredient selection
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [ingredientSelections, setIngredientSelections] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Queries
  const { data: selectableRecipes, isLoading: recipesLoading } =
    trpc.recipes.shopping.getSelectableRecipes.useQuery();

  const { data: ingredientData, isLoading: ingredientsLoading } =
    trpc.recipes.shopping.getIngredients.useQuery(
      { recipeIds: selectedRecipeIds },
      { enabled: selectedRecipeIds.length > 0 }
    );

  const { data: lists } = trpc.recipes.shopping.getAvailableLists.useQuery();

  const addToList = trpc.recipes.shopping.addToList.useMutation({
    onSuccess: () => {
      navigate({ to: '/shopping', search: { listId: selectedListId } });
    },
  });

  // Initialize ingredient selections when data loads
  useEffect(() => {
    if (ingredientData?.ingredients) {
      const initial: Record<string, boolean> = {};
      const initialQty: Record<string, number> = {};
      for (const ing of ingredientData.ingredients) {
        initial[ing.key] = true;
        initialQty[ing.key] = ing.totalAmount;
      }
      setIngredientSelections(initial);
      setQuantities(initialQty);
    }
  }, [ingredientData?.ingredients]);

  // Set default list
  useEffect(() => {
    if (lists && !selectedListId) {
      const defaultList = lists.find(l => l.isDefault) ?? lists[0];
      if (defaultList) {
        setSelectedListId(defaultList.id);
      }
    }
  }, [lists, selectedListId]);

  const toggleRecipe = (recipeId: string) => {
    setSelectedRecipeIds(prev =>
      prev.includes(recipeId)
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId]
    );
  };

  const selectAllRecipes = () => {
    setSelectedRecipeIds(selectableRecipes?.recipes.map(r => r.id) ?? []);
  };

  const toggleIngredient = (key: string) => {
    setIngredientSelections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateQuantity = (key: string, amount: number) => {
    setQuantities(prev => ({ ...prev, [key]: Math.max(0, amount) }));
  };

  const selectAllIngredients = () => {
    const all: Record<string, boolean> = {};
    for (const ing of ingredientData?.ingredients ?? []) {
      all[ing.key] = true;
    }
    setIngredientSelections(all);
  };

  const clearIngredients = () => {
    setIngredientSelections({});
  };

  const selectedIngredientCount = Object.values(ingredientSelections).filter(Boolean).length;
  const totalIngredientCount = ingredientData?.ingredients.length ?? 0;

  const handleAddToList = () => {
    if (!selectedListId || !ingredientData) return;

    const selectedIngredients = ingredientData.ingredients
      .filter(ing => ingredientSelections[ing.key])
      .map(ing => ({
        name: ing.name,
        quantity: quantities[ing.key] ?? ing.totalAmount,
        unit: ing.unit ?? undefined,
        category: ing.category,
        note: ing.fromRecipes.length > 1
          ? `From: ${ing.fromRecipes.join(', ')}`
          : `From: ${ing.fromRecipes[0]}`,
      }));

    addToList.mutate({
      listId: selectedListId,
      ingredients: selectedIngredients,
      recipeIds: ingredientData.recipeIds,
    });
  };

  // Loading state
  if (recipesLoading) {
    return <ShoppingGenerationSkeleton />;
  }

  // No recipes in batch
  if (!selectableRecipes || selectableRecipes.recipes.length === 0) {
    return (
      <div className="p-4 text-center">
        <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">
          No recipes to shop for. Get some suggestions first!
        </p>
        <Button asChild>
          <Link to="/recipes">Go to Recipes</Link>
        </Button>
      </div>
    );
  }

  // Sort categories
  const sortedCategories = ingredientData
    ? Object.keys(ingredientData.byCategory).sort(
        (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
      )
    : [];

  return (
    <div className="p-4 space-y-6">
      {/* Step 1: Recipe Selection */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">1. Select Recipes</h2>
          <Button variant="ghost" size="sm" onClick={selectAllRecipes}>
            Select All
          </Button>
        </div>

        <RecipeSelector
          recipes={selectableRecipes.recipes}
          selectedIds={selectedRecipeIds}
          onToggle={toggleRecipe}
        />

        {selectedRecipeIds.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Select recipes to see their ingredients
          </p>
        )}
      </section>

      {/* Step 2: Ingredient Selection (shown after recipes selected) */}
      {selectedRecipeIds.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">2. Review Ingredients</h2>
              {ingredientData && (
                <p className="text-sm text-muted-foreground">
                  {ingredientData.recipeCount} recipes, {totalIngredientCount} ingredients
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllIngredients}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearIngredients}>
                Clear
              </Button>
            </div>
          </div>

          {ingredientsLoading ? (
            <IngredientListSkeleton />
          ) : ingredientData && sortedCategories.length > 0 ? (
            <div className="space-y-6">
              {sortedCategories.map((category) => (
                <div key={category}>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2 capitalize">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {ingredientData.byCategory[category].map((ing) => (
                      <IngredientRow
                        key={ing.key}
                        ingredient={ing}
                        selected={ingredientSelections[ing.key] ?? false}
                        quantity={quantities[ing.key] ?? ing.totalAmount}
                        onToggle={() => toggleIngredient(ing.key)}
                        onQuantityChange={(q) => updateQuantity(ing.key, q)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* Bottom action bar */}
      {selectedRecipeIds.length > 0 && ingredientData && (
        <div className="sticky bottom-0 bg-background border-t p-4 -mx-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {selectedIngredientCount} of {totalIngredientCount} selected
            </span>
            <ListSelector
              lists={lists ?? []}
              value={selectedListId}
              onChange={setSelectedListId}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleAddToList}
            disabled={selectedIngredientCount === 0 || !selectedListId || addToList.isPending}
          >
            {addToList.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-2 h-4 w-4" />
            )}
            Add {selectedIngredientCount} Items to List
          </Button>
        </div>
      )}
    </div>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/RecipeSelector.tsx

import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, Check } from 'lucide-react';

interface SelectableRecipe {
  id: string;
  name: string;
  status: 'active' | 'completed';
  servings: number;
  cuisine: string;
  ingredientCount: number;
}

interface Props {
  recipes: SelectableRecipe[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function RecipeSelector({ recipes, selectedIds, onToggle }: Props) {
  return (
    <div className="space-y-2">
      {recipes.map((recipe) => {
        const isSelected = selectedIds.includes(recipe.id);
        const isCompleted = recipe.status === 'completed';

        return (
          <div
            key={recipe.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50',
              isCompleted && 'opacity-60',
            )}
            onClick={() => onToggle(recipe.id)}
          >
            <Checkbox checked={isSelected} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{recipe.name}</span>
                {isCompleted && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Check className="h-3 w-3" />
                    Cooked
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <Badge variant="outline" className="text-xs">
                  {recipe.cuisine}
                </Badge>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {recipe.servings}
                </span>
                <span>{recipe.ingredientCount} ingredients</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/IngredientRow.tsx

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  ingredient: AggregatedIngredient;
  selected: boolean;
  quantity: number;
  onToggle: () => void;
  onQuantityChange: (quantity: number) => void;
}

export function IngredientRow({
  ingredient,
  selected,
  quantity,
  onToggle,
  onQuantityChange,
}: Props) {
  const formatQuantity = (amount: number, unit: string | null) => {
    // Round to reasonable precision
    const rounded = amount < 1
      ? Math.round(amount * 100) / 100
      : Math.round(amount * 10) / 10;

    return unit ? `${rounded} ${unit}` : `${rounded}`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded border',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border opacity-60',
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
      />

      {/* Name and source */}
      <div className="flex-1 min-w-0">
        <span className={cn('font-medium', !selected && 'line-through')}>
          {ingredient.name}
        </span>
        <div className="flex flex-wrap gap-1 mt-1">
          {ingredient.fromRecipes.map((recipe, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {recipe}
            </Badge>
          ))}
        </div>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onQuantityChange(quantity - 1)}
          disabled={!selected || quantity <= 0}
        >
          <Minus className="h-3 w-3" />
        </Button>

        <span className="w-20 text-center text-sm">
          {formatQuantity(quantity, ingredient.unit)}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onQuantityChange(quantity + 1)}
          disabled={!selected}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Additional amounts (if units didn't match) */}
      {ingredient.additionalAmounts && ingredient.additionalAmounts.length > 0 && (
        <div className="text-xs text-muted-foreground">
          + {ingredient.additionalAmounts.map(a =>
            `${a.amount} ${a.unit}`
          ).join(', ')}
        </div>
      )}
    </div>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/ListSelector.tsx

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star } from 'lucide-react';

interface Props {
  lists: ShoppingList[];
  value: string | null;
  onChange: (listId: string) => void;
}

export function ListSelector({ lists, value, onChange }: Props) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select list..." />
      </SelectTrigger>
      <SelectContent>
        {lists.map((list) => (
          <SelectItem key={list.id} value={list.id}>
            <span className="flex items-center gap-2">
              {list.isDefault && <Star className="h-3 w-3 text-yellow-500" />}
              {list.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

## Integration with Epic 2

The `addToList` mutation:
1. Creates `shopping_items` rows using Epic 2's schema
2. Emits `shopping:item:added` events (Epic 2 listens for these)
3. Items appear immediately in the shopping list due to WebSocket sync

**Item Format** (matches Epic 2):
```typescript
{
  listId: string,
  name: string,
  quantity: number | null,
  unit: string | null,
  category: string,
  note: string,         // "From: Lemon Herb Chicken, Pasta Primavera"
  sortOrder: number,
  addedBy: string,      // userId
}
```

---

## Edge Cases

- **Unit mismatch**: Show additional amounts separately, don't force conversion
- **No recipes in batch**: Show empty state with navigation to recipes
- **List deleted**: Refresh list selector, handle gracefully
- **Large quantities**: Round display but keep precision in data
- **Zero quantity**: Remove from selection
- **Audible recipes**: `audible_original` recipes are excluded from selection
- **Completed recipes**: Still selectable (you may want to shop for already-cooked recipes)

---

## Testing

- Unit: Ingredient aggregation logic
- Unit: Unit conversion functions
- Unit: Name normalization
- Integration: Recipe selection -> Ingredient aggregation
- Integration: Add to shopping list flow
- E2E: Full flow from batch recipes to shopping list
