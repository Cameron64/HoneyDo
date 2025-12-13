/**
 * Step 1 Router - Manage Current Batch
 *
 * Handles meal disposition selection (completed, rollover, discard)
 * and creates a new batch while archiving the old one.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { setMealDispositionsSchema } from '@honeydo/shared';
import {
  wizardSessions,
  batches,
  acceptedMeals,
  type AcceptedMealRow,
  type MealDispositionRecord,
} from '../../../db/schema';
import { eq, isNull, inArray } from 'drizzle-orm';
import { socketEmitter } from '../../../services/websocket/emitter';
import {
  batchArchiveMealsToHistory,
  type ArchiveMealInput,
} from '../../../services/recipe-history';
import {
  getActiveBatch,
  suggestDisposition,
  formatDateRange,
} from './helpers';

export const step1Router = router({
  /**
   * Get meals from the current batch for disposition selection
   */
  getCurrentBatchMeals: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    // Get meals from the active batch, not just previousBatchId
    // This ensures we show the same meals that appear in "upcoming meals"
    const activeBatch = await getActiveBatch(ctx.db, ctx.userId);

    let meals: AcceptedMealRow[];
    if (activeBatch) {
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: eq(acceptedMeals.batchId, activeBatch.id),
        orderBy: [acceptedMeals.date, acceptedMeals.mealType],
      });
    } else {
      // Legacy: get meals without batch ID
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: isNull(acceptedMeals.batchId),
        orderBy: [acceptedMeals.date, acceptedMeals.mealType],
      });
    }

    return meals.map((meal) => ({
      id: meal.id,
      date: meal.date,
      mealType: meal.mealType,
      recipeName: meal.recipeName,
      recipeData: meal.recipeData,
      servings: meal.servings,
      completed: meal.completed,
      isAudible: meal.isAudible,
      suggestedDisposition: suggestDisposition(meal),
    }));
  }),

  /**
   * Save meal dispositions (what to do with each meal)
   */
  setMealDispositions: protectedProcedure
    .input(setMealDispositionsSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.wizardSessions.findFirst({
        where: eq(wizardSessions.userId, ctx.userId),
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active wizard session',
        });
      }

      // Update session with dispositions
      await ctx.db
        .update(wizardSessions)
        .set({
          mealDispositions: input.dispositions,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      return { success: true };
    }),

  /**
   * Complete Step 1: Process all dispositions
   * - Completed -> archive to history
   * - Rollover -> keep for new batch (mark as already shopped)
   * - Discard (non-audible) -> archive to history
   * - Discard (audible) -> just delete
   */
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    const dispositions = (session.mealDispositions || []) as MealDispositionRecord[];

    // Get all meals that are being processed
    const mealIds = dispositions.map((d) => d.mealId);
    const meals =
      mealIds.length > 0
        ? await ctx.db.query.acceptedMeals.findMany({
            where: inArray(acceptedMeals.id, mealIds),
          })
        : [];

    const mealMap = new Map(meals.map((m) => [m.id, m]));

    // Calculate date range for new batch
    const today = new Date().toISOString().split('T')[0];
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Create new batch
    const [newBatch] = await ctx.db
      .insert(batches)
      .values({
        userId: ctx.userId,
        name: `Week of ${formatDateRange(today, weekFromNow)}`,
        dateRangeStart: today,
        dateRangeEnd: weekFromNow,
        status: 'active',
      })
      .returning();

    // Process each disposition
    const archiveInputs: ArchiveMealInput[] = [];
    const rolloverMealIds: string[] = [];
    const deleteIds: string[] = [];
    let completedCount = 0;
    let discardedCount = 0;
    let rolloverCount = 0;

    for (const disp of dispositions) {
      const meal = mealMap.get(disp.mealId);
      if (!meal) continue;

      switch (disp.disposition) {
        case 'completed':
          archiveInputs.push({ meal, disposition: 'completed' });
          deleteIds.push(disp.mealId);
          completedCount++;
          break;

        case 'rollover':
          rolloverMealIds.push(disp.mealId);
          rolloverCount++;
          break;

        case 'discard':
          if (!meal.isAudible) {
            // Non-audibles go to history
            archiveInputs.push({ meal, disposition: 'discard' });
          }
          deleteIds.push(disp.mealId);
          discardedCount++;
          break;
      }
    }

    // Archive meals to history
    if (archiveInputs.length > 0) {
      await batchArchiveMealsToHistory(archiveInputs);
    }

    // Move rollover meals to new batch
    if (rolloverMealIds.length > 0) {
      await ctx.db
        .update(acceptedMeals)
        .set({
          batchId: newBatch.id,
          isRollover: true,
          rolloverFromBatchId: session.previousBatchId,
          shoppingListGenerated: true, // Already shopped
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(acceptedMeals.id, rolloverMealIds));
    }

    // Delete processed meals (completed and discarded)
    if (deleteIds.length > 0) {
      await ctx.db
        .delete(acceptedMeals)
        .where(inArray(acceptedMeals.id, deleteIds));
    }

    // Archive old batch if it exists
    if (session.previousBatchId) {
      await ctx.db
        .update(batches)
        .set({
          status: 'archived',
          archivedAt: new Date().toISOString(),
          totalMeals: meals.length,
          completedMeals: completedCount,
          rolledOverMeals: rolloverCount,
          discardedMeals: discardedCount,
        })
        .where(eq(batches.id, session.previousBatchId));
    }

    // Update wizard session with rollover count
    // The rollover count becomes the floor for total meal count in Step 2a
    await ctx.db
      .update(wizardSessions)
      .set({
        currentStep: 2,
        newBatchId: newBatch.id,
        rolloverCount: rolloverCount,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    // Emit events
    socketEmitter.toUser(ctx.userId, 'recipes:wizard:step-completed', {
      step: 1,
      nextStep: 2,
    });

    socketEmitter.toUser(ctx.userId, 'recipes:batch:created', {
      batchId: newBatch.id,
      name: newBatch.name,
      dateRange: { start: newBatch.dateRangeStart, end: newBatch.dateRangeEnd },
    });

    if (session.previousBatchId) {
      socketEmitter.toUser(ctx.userId, 'recipes:batch:archived', {
        batchId: session.previousBatchId,
        stats: { completedCount, rolloverCount, discardedCount },
      });
    }

    return {
      success: true,
      newBatchId: newBatch.id,
      stats: {
        archivedToHistory: archiveInputs.length,
        rolledOver: rolloverCount,
        deleted: deleteIds.length - rolloverCount,
      },
    };
  }),
});
