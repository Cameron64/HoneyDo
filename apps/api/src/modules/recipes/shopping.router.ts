import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { dateRangeSchema, addIngredientsToListSchema } from '@honeydo/shared';
import {
  acceptedMeals,
  batches,
  shoppingLists,
  shoppingItems,
  type RecipeData,
} from '../../db/schema';
import type { ShoppingCategoryId } from '@honeydo/shared';
import { eq, and, gte, lte, inArray, desc, isNull } from 'drizzle-orm';
import { socketEmitter } from '../../services/websocket/emitter';

import type { AggregatedIngredient } from '@honeydo/shared';

// ============================================
// Ingredient Aggregation Logic
// ============================================

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
  if (!unit1 || !unit2) return unit1 === unit2;

  // Volume conversions
  const volumes = ['cup', 'cups', 'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'ml', 'l', 'liter'];
  // Weight conversions
  const weights = ['lb', 'lbs', 'pound', 'oz', 'ounce', 'g', 'gram', 'kg'];

  const u1 = unit1.toLowerCase();
  const u2 = unit2.toLowerCase();

  const both = (list: string[]) =>
    list.some((u) => u1.includes(u)) && list.some((u) => u2.includes(u));

  return both(volumes) || both(weights);
}

function convertUnits(amount: number, from: string | null, to: string | null): number {
  if (from === to) return amount;
  if (!from || !to) return amount;

  const fromKey = from.toLowerCase();
  const toKey = to.toLowerCase();

  // Basic conversions
  const conversions: Record<string, Record<string, number>> = {
    cups: { tbsp: 16, tsp: 48 },
    tbsp: { cups: 1 / 16, tsp: 3 },
    tsp: { cups: 1 / 48, tbsp: 1 / 3 },
    lb: { oz: 16 },
    lbs: { oz: 16 },
    oz: { lb: 1 / 16, lbs: 1 / 16 },
  };

  if (conversions[fromKey]?.[toKey]) {
    return amount * conversions[fromKey][toKey];
  }

  return amount;
}

interface MealForAggregation {
  id: string;
  recipeName: string;
  servings: number;
  recipeData: RecipeData;
}

function aggregateIngredients(meals: MealForAggregation[]): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const meal of meals) {
    const recipe = meal.recipeData;
    const scaleFactor = meal.servings / recipe.defaultServings;

    for (const ing of recipe.ingredients) {
      if (ing.optional) continue;

      const key = normalizeIngredientName(ing.name);
      const scaledAmount = (ing.amount ?? 0) * scaleFactor;

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

        if (!existing.fromMeals.includes(meal.recipeName)) {
          existing.fromMeals.push(meal.recipeName);
        }
      } else {
        map.set(key, {
          key,
          name: ing.name,
          totalAmount: scaledAmount,
          unit: ing.unit,
          category: ing.category || 'other',
          fromMeals: [meal.recipeName],
          selected: true,
        });
      }
    }
  }

  return Array.from(map.values());
}

// ============================================
// Router
// ============================================

export const shoppingRouter = router({
  // Get aggregated ingredients from accepted meals (date-based)
  getIngredients: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    const meals = await ctx.db.query.acceptedMeals.findMany({
      where: and(
        gte(acceptedMeals.date, input.start),
        lte(acceptedMeals.date, input.end),
        eq(acceptedMeals.shoppingListGenerated, false)
      ),
      orderBy: acceptedMeals.date,
    });

    const aggregated = aggregateIngredients(
      meals.map((m) => ({
        id: m.id,
        recipeName: m.recipeName,
        servings: m.servings,
        recipeData: m.recipeData as RecipeData,
      }))
    );

    // Group by category
    const byCategory = aggregated.reduce(
      (acc, ing) => {
        if (!acc[ing.category]) {
          acc[ing.category] = [];
        }
        acc[ing.category].push(ing);
        return acc;
      },
      {} as Record<string, typeof aggregated>
    );

    return {
      ingredients: aggregated,
      byCategory,
      mealIds: meals.map((m) => m.id),
      mealCount: meals.length,
    };
  }),

  // Get aggregated ingredients from current batch (batch-based)
  getCurrentBatchIngredients: protectedProcedure.query(async ({ ctx }) => {
    // Find the active batch for the user
    const activeBatch = await ctx.db.query.batches.findFirst({
      where: and(eq(batches.userId, ctx.userId), eq(batches.status, 'active')),
      orderBy: desc(batches.createdAt),
    });

    let meals;
    if (activeBatch) {
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          eq(acceptedMeals.batchId, activeBatch.id),
          eq(acceptedMeals.shoppingListGenerated, false)
        ),
        orderBy: acceptedMeals.date,
      });
    } else {
      // Legacy: get meals without batch ID that are pending
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          isNull(acceptedMeals.batchId),
          eq(acceptedMeals.shoppingListGenerated, false)
        ),
        orderBy: acceptedMeals.date,
      });
    }

    const aggregated = aggregateIngredients(
      meals.map((m) => ({
        id: m.id,
        recipeName: m.recipeName,
        servings: m.servings,
        recipeData: m.recipeData as RecipeData,
      }))
    );

    // Group by category
    const byCategory = aggregated.reduce(
      (acc, ing) => {
        if (!acc[ing.category]) {
          acc[ing.category] = [];
        }
        acc[ing.category].push(ing);
        return acc;
      },
      {} as Record<string, typeof aggregated>
    );

    return {
      ingredients: aggregated,
      byCategory,
      mealIds: meals.map((m) => m.id),
      mealCount: meals.length,
      batchId: activeBatch?.id ?? null,
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
    .input(addIngredientsToListSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify list exists
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input.listId),
      });

      if (!list) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping list not found',
        });
      }

      // Create shopping items
      const items = input.ingredients.map((ing, index) => ({
        listId: input.listId,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        category: (ing.category ?? 'other') as ShoppingCategoryId,
        note: ing.note ?? null,
        sortOrder: index,
        addedBy: ctx.userId,
        fromMeals: ing.fromMeals ?? null,
      }));

      const insertedItems = await ctx.db.insert(shoppingItems).values(items).returning();

      // Mark meals as shopping generated
      if (input.mealIds.length > 0) {
        await ctx.db
          .update(acceptedMeals)
          .set({ shoppingListGenerated: true })
          .where(inArray(acceptedMeals.id, input.mealIds));
      }

      // Emit WebSocket events
      for (const item of insertedItems) {
        socketEmitter.broadcast('shopping:item:added', item);
      }

      socketEmitter.broadcast('recipes:shopping:generated', {
        listId: input.listId,
        itemCount: insertedItems.length,
      });

      return {
        itemsAdded: insertedItems.length,
        listId: input.listId,
      };
    }),
});
