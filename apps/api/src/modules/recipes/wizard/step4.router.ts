/**
 * Step 4 Router - Complete
 *
 * Handles completion summary and finishing the wizard.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import {
  wizardSessions,
  acceptedMeals,
  shoppingLists,
  shoppingItems,
  type MealDispositionRecord,
} from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { socketEmitter } from '../../../services/websocket/emitter';

export const step4Router = router({
  /**
   * Get completion summary for step 4
   */
  getCompletionSummary: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session || !session.newBatchId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    // Count new meals vs rollovers
    const meals = await ctx.db.query.acceptedMeals.findMany({
      where: eq(acceptedMeals.batchId, session.newBatchId),
    });

    const newMeals = meals.filter((m) => !m.isRollover).length;
    const rollovers = meals.filter((m) => m.isRollover).length;

    // Count archived meals
    const archiveDispositions = (session.mealDispositions || []) as MealDispositionRecord[];
    const archivedToHistory = archiveDispositions.filter(
      (d) => d.disposition === 'completed' || d.disposition === 'discard'
    ).length;

    // Get shopping list info
    let listName: string | null = null;
    let shoppingItemCount = 0;
    if (session.targetListId) {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, session.targetListId),
      });
      if (list) {
        listName = list.name;
        const items = await ctx.db.query.shoppingItems.findMany({
          where: eq(shoppingItems.listId, session.targetListId),
        });
        shoppingItemCount = items.length;
      }
    }

    return {
      newMeals,
      rollovers,
      archivedToHistory,
      shoppingItems: shoppingItemCount,
      listId: session.targetListId,
      listName,
      batchId: session.newBatchId,
    };
  }),

  /**
   * Finish wizard and clean up
   */
  finish: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    const batchId = session.newBatchId;
    const listId = session.targetListId;

    // Delete the session
    await ctx.db
      .delete(wizardSessions)
      .where(eq(wizardSessions.userId, ctx.userId));

    // Emit completion event
    socketEmitter.toUser(ctx.userId, 'recipes:wizard:finished', {
      batchId,
      listId,
    });

    return {
      success: true,
      batchId,
      listId,
    };
  }),
});
