/**
 * Batches Router
 *
 * Handles batch management operations outside of the wizard workflow.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { z } from 'zod';
import { batches, acceptedMeals, shoppingItems } from '../../../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { getActiveBatch } from './helpers';
import type { DB } from '../../../db';

/**
 * Clean up shopping items when batch meals are deleted.
 * Removes recipe names from fromMeals array and deletes items that become empty.
 */
async function cleanupShoppingItemsForBatch(
  db: DB,
  batchId: string
): Promise<{ itemsDeleted: number; itemsUpdated: number }> {
  // Get recipe names from the batch meals before they're deleted
  const meals = await db.query.acceptedMeals.findMany({
    where: eq(acceptedMeals.batchId, batchId),
  });

  const recipeNamesFromBatch = new Set(meals.map((m) => m.recipeName));
  if (recipeNamesFromBatch.size === 0) {
    return { itemsDeleted: 0, itemsUpdated: 0 };
  }

  // Find all unchecked shopping items that have fromMeals
  const allItems = await db.query.shoppingItems.findMany({
    where: eq(shoppingItems.checked, false),
  });

  let itemsDeleted = 0;
  let itemsUpdated = 0;

  for (const item of allItems) {
    const fromMeals = item.fromMeals as string[] | null;
    if (!fromMeals || fromMeals.length === 0) continue;

    // Check if any recipe names from this batch are in the item's fromMeals
    const hasRecipeFromBatch = fromMeals.some((name) => recipeNamesFromBatch.has(name));
    if (!hasRecipeFromBatch) continue;

    // Remove the batch's recipe names from fromMeals
    const updatedFromMeals = fromMeals.filter((name) => !recipeNamesFromBatch.has(name));

    if (updatedFromMeals.length === 0) {
      // No recipes left - delete the item
      await db.delete(shoppingItems).where(eq(shoppingItems.id, item.id));
      itemsDeleted++;
    } else {
      // Still has other recipes - update the item
      await db
        .update(shoppingItems)
        .set({ fromMeals: updatedFromMeals })
        .where(eq(shoppingItems.id, item.id));
      itemsUpdated++;
    }
  }

  return { itemsDeleted, itemsUpdated };
}

export const batchesRouter = router({
  /**
   * Get active batch for current user
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return getActiveBatch(ctx.db, ctx.userId);
  }),

  /**
   * Get batch history with meals
   */
  getHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const offset = input?.offset ?? 0;

      const archivedBatches = await ctx.db.query.batches.findMany({
        where: and(eq(batches.userId, ctx.userId), eq(batches.status, 'archived')),
        with: {
          meals: {
            orderBy: [asc(acceptedMeals.date), asc(acceptedMeals.mealType)],
          },
        },
        orderBy: desc(batches.archivedAt),
        limit,
        offset,
      });

      return archivedBatches;
    }),

  /**
   * Get a single batch by ID with all meals
   */
  getById: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const batch = await ctx.db.query.batches.findFirst({
      where: and(eq(batches.id, input), eq(batches.userId, ctx.userId)),
      with: {
        meals: {
          orderBy: [asc(acceptedMeals.date), asc(acceptedMeals.mealType)],
        },
      },
    });

    return batch;
  }),

  /**
   * Delete an archived batch and its meals
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    // First verify the batch exists and belongs to user
    const batch = await ctx.db.query.batches.findFirst({
      where: and(eq(batches.id, input), eq(batches.userId, ctx.userId)),
    });

    if (!batch) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Batch not found',
      });
    }

    // Only allow deleting archived batches
    if (batch.status !== 'archived') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Can only delete archived batches',
      });
    }

    // Clean up shopping items BEFORE deleting meals (need meal data)
    const shoppingCleanup = await cleanupShoppingItemsForBatch(ctx.db, input);

    // Delete associated meals
    await ctx.db.delete(acceptedMeals).where(eq(acceptedMeals.batchId, input));

    // Delete the batch
    await ctx.db.delete(batches).where(eq(batches.id, input));

    return {
      success: true,
      shoppingItemsRemoved: shoppingCleanup.itemsDeleted,
      shoppingItemsUpdated: shoppingCleanup.itemsUpdated,
    };
  }),

  /**
   * Delete multiple archived batches at once
   */
  deleteMany: protectedProcedure
    .input(z.array(z.string()).min(1))
    .mutation(async ({ ctx, input: batchIds }) => {
      // Verify all batches exist, belong to user, and are archived
      const batchesToDelete = await ctx.db.query.batches.findMany({
        where: and(
          eq(batches.userId, ctx.userId),
          eq(batches.status, 'archived')
        ),
      });

      const validIds = new Set(batchesToDelete.map((b) => b.id));
      const invalidIds = batchIds.filter((id) => !validIds.has(id));

      if (invalidIds.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Some batches cannot be deleted: ${invalidIds.length} not found or not archived`,
        });
      }

      // Clean up shopping items BEFORE deleting meals (need meal data)
      let totalItemsDeleted = 0;
      let totalItemsUpdated = 0;
      for (const batchId of batchIds) {
        const cleanup = await cleanupShoppingItemsForBatch(ctx.db, batchId);
        totalItemsDeleted += cleanup.itemsDeleted;
        totalItemsUpdated += cleanup.itemsUpdated;
      }

      // Delete associated meals for all batches
      for (const batchId of batchIds) {
        await ctx.db.delete(acceptedMeals).where(eq(acceptedMeals.batchId, batchId));
      }

      // Delete all batches
      let deletedCount = 0;
      for (const batchId of batchIds) {
        await ctx.db.delete(batches).where(eq(batches.id, batchId));
        deletedCount++;
      }

      return {
        success: true,
        deletedCount,
        shoppingItemsRemoved: totalItemsDeleted,
        shoppingItemsUpdated: totalItemsUpdated,
      };
    }),
});
