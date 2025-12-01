/**
 * Step 3 Router - Manage Shopping List
 *
 * Handles ingredient aggregation, shopping list selection,
 * and adding ingredients to the shopping list.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { completeShoppingSchema } from '@honeydo/shared';
import type { ShoppingCategoryId } from '@honeydo/shared';
import {
  wizardSessions,
  acceptedMeals,
  shoppingLists,
  shoppingItems,
  type RecipeData,
} from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { socketEmitter } from '../../../services/websocket/emitter';
import { formatDateRange } from './helpers';

export const step3Router = router({
  /**
   * Get shopping preview for step 3
   * Aggregates ingredients from new batch meals (excluding rollovers)
   */
  getShoppingPreview: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session || !session.newBatchId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session with batch',
      });
    }

    console.log('[getShoppingPreview] Session:', {
      id: session.id,
      currentStep: session.currentStep,
      newBatchId: session.newBatchId,
      acceptedMealIds: session.acceptedMealIds,
    });

    // Get ALL meals from new batch first (for debugging)
    const allBatchMeals = await ctx.db.query.acceptedMeals.findMany({
      where: eq(acceptedMeals.batchId, session.newBatchId),
      orderBy: acceptedMeals.date,
    });

    console.log('[getShoppingPreview] All meals in batch:', allBatchMeals.map(m => ({
      id: m.id,
      recipeName: m.recipeName,
      isRollover: m.isRollover,
      shoppingListGenerated: m.shoppingListGenerated,
      ingredientCount: (m.recipeData as RecipeData)?.ingredients?.length ?? 0,
    })));

    // Get meals from new batch that are NOT rollovers
    const meals = allBatchMeals.filter(m => !m.isRollover);

    console.log('[getShoppingPreview] Non-rollover meals:', meals.length);

    // Aggregate ingredients
    const ingredientMap = new Map<
      string,
      {
        key: string;
        name: string;
        totalAmount: number;
        unit: string | null;
        category: string;
        fromMeals: string[];
        selected: boolean;
      }
    >();

    for (const meal of meals) {
      const recipe = meal.recipeData as RecipeData;
      const scaleFactor = meal.servings / recipe.defaultServings;

      for (const ing of recipe.ingredients) {
        if (ing.optional) continue;

        const key = ing.name.toLowerCase().replace(/\s+/g, ' ').trim();
        const scaledAmount = ing.amount * scaleFactor;

        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          existing.totalAmount += scaledAmount;
          if (!existing.fromMeals.includes(meal.recipeName)) {
            existing.fromMeals.push(meal.recipeName);
          }
        } else {
          ingredientMap.set(key, {
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

    const ingredients = Array.from(ingredientMap.values());

    // Group by category
    const byCategory = ingredients.reduce(
      (acc, ing) => {
        if (!acc[ing.category]) {
          acc[ing.category] = [];
        }
        acc[ing.category].push(ing);
        return acc;
      },
      {} as Record<string, typeof ingredients>
    );

    return {
      ingredients,
      byCategory,
      mealCount: meals.length,
    };
  }),

  /**
   * Get existing shopping lists for step 3
   */
  getExistingLists: protectedProcedure.query(async ({ ctx }) => {
    const lists = await ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.isArchived, false),
      orderBy: (lists, { desc }) => [desc(lists.isDefault), lists.name],
    });

    // Get item counts
    const listWithCounts = await Promise.all(
      lists.map(async (list) => {
        const items = await ctx.db.query.shoppingItems.findMany({
          where: eq(shoppingItems.listId, list.id),
        });
        return {
          id: list.id,
          name: list.name,
          isDefault: list.isDefault,
          itemCount: items.length,
          uncheckedCount: items.filter((i) => !i.checked).length,
        };
      })
    );

    return listWithCounts;
  }),

  /**
   * Complete Step 3: Create shopping list
   */
  complete: protectedProcedure
    .input(completeShoppingSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.wizardSessions.findFirst({
        where: eq(wizardSessions.userId, ctx.userId),
      });

      if (!session || !session.newBatchId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active wizard session with batch',
        });
      }

      let targetListId = input.listId;

      // Handle list action
      if (input.listAction === 'new') {
        // Create new list
        const [newList] = await ctx.db
          .insert(shoppingLists)
          .values({
            name: input.newListName || `Groceries - ${formatDateRange(new Date().toISOString().split('T')[0], '')}`,
            createdBy: ctx.userId,
          })
          .returning();
        targetListId = newList.id;
      } else if (input.listAction === 'replace' && targetListId) {
        // Clear existing items from list
        await ctx.db
          .delete(shoppingItems)
          .where(eq(shoppingItems.listId, targetListId));
      }

      if (!targetListId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No target list specified',
        });
      }

      // Get ingredients to add
      const meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          eq(acceptedMeals.batchId, session.newBatchId),
          eq(acceptedMeals.isRollover, false)
        ),
      });

      // Build ingredient list
      const ingredientMap = new Map<string, {
        name: string;
        quantity: number;
        unit: string | null;
        category: string;
      }>();

      for (const meal of meals) {
        const recipe = meal.recipeData as RecipeData;
        const scaleFactor = meal.servings / recipe.defaultServings;

        for (const ing of recipe.ingredients) {
          if (ing.optional) continue;

          const key = ing.name.toLowerCase().replace(/\s+/g, ' ').trim();

          // Only add if selected
          if (!input.selectedIngredients.includes(key)) continue;

          if (ingredientMap.has(key)) {
            ingredientMap.get(key)!.quantity += ing.amount * scaleFactor;
          } else {
            ingredientMap.set(key, {
              name: ing.name,
              quantity: ing.amount * scaleFactor,
              unit: ing.unit,
              category: ing.category || 'other',
            });
          }
        }
      }

      // Create shopping items
      const items = Array.from(ingredientMap.values()).map((ing, index) => ({
        listId: targetListId!,
        name: ing.name,
        quantity: Math.ceil(ing.quantity * 10) / 10, // Round to 1 decimal
        unit: ing.unit,
        category: (ing.category || 'other') as ShoppingCategoryId,
        sortOrder: index,
        addedBy: ctx.userId,
      }));

      const insertedItems = await ctx.db.insert(shoppingItems).values(items).returning();

      // Mark meals as shopping generated
      const mealIds = meals.map((m) => m.id);
      if (mealIds.length > 0) {
        const { inArray } = await import('drizzle-orm');
        await ctx.db
          .update(acceptedMeals)
          .set({ shoppingListGenerated: true })
          .where(inArray(acceptedMeals.id, mealIds));
      }

      // Update session
      await ctx.db
        .update(wizardSessions)
        .set({
          currentStep: 4,
          targetListId,
          selectedIngredients: input.selectedIngredients,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      // Emit events
      for (const item of insertedItems) {
        socketEmitter.broadcast('shopping:item:added', item);
      }

      socketEmitter.toUser(ctx.userId, 'recipes:wizard:step-completed', {
        step: 3,
        nextStep: 4,
      });

      return {
        success: true,
        listId: targetListId,
        itemsAdded: insertedItems.length,
      };
    }),
});
