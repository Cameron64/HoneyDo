/**
 * Session Router
 *
 * Handles wizard session management: start, abandon, getSession
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { z } from 'zod';
import {
  wizardSessions,
  batches,
  acceptedMeals,
  type AcceptedMealRow,
} from '../../../db/schema';
import { eq, isNull, inArray } from 'drizzle-orm';
import {
  getActiveBatch,
  getOrCreateWizardSession,
  suggestDisposition,
} from './helpers';

export const sessionRouter = router({
  /**
   * Start or resume wizard session
   * Returns the current session with step data
   */
  start: protectedProcedure.query(async ({ ctx }) => {
    const session = await getOrCreateWizardSession(ctx.db, ctx.userId);

    // Load current batch meals for step 1
    // Look for meals from:
    // 1. The active batch (current meals the user can see)
    // 2. OR legacy meals without a batch ID
    let currentBatchMeals: AcceptedMealRow[] = [];
    const activeBatch = await getActiveBatch(ctx.db, ctx.userId);

    if (activeBatch) {
      currentBatchMeals = await ctx.db.query.acceptedMeals.findMany({
        where: eq(acceptedMeals.batchId, activeBatch.id),
        orderBy: [acceptedMeals.date, acceptedMeals.mealType],
      });
    } else {
      // No active batch - get all meals without a batch (legacy meals)
      currentBatchMeals = await ctx.db.query.acceptedMeals.findMany({
        where: isNull(acceptedMeals.batchId),
        orderBy: [acceptedMeals.date, acceptedMeals.mealType],
      });
    }

    // Update the session's previousBatchId to reflect the active batch
    // This ensures completeStep1 archives the correct batch
    if (activeBatch && session.previousBatchId !== activeBatch.id) {
      await ctx.db
        .update(wizardSessions)
        .set({
          previousBatchId: activeBatch.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));
      session.previousBatchId = activeBatch.id;
    }

    return {
      session: {
        id: session.id,
        currentStep: session.currentStep,
        mealDispositions: session.mealDispositions,
        // Step 1 result: rollover count (floor for total)
        rolloverCount: session.rolloverCount ?? 0,
        // Step 2a: Meal counts planning
        totalMealCount: session.totalMealCount,
        manualPickCount: session.manualPickCount ?? 0,
        // Step 2b: Manual picks
        manualPickIds: session.manualPickIds,
        // Step 2c: AI suggestions
        targetMealCount: session.targetMealCount,
        acceptedMealIds: session.acceptedMealIds,
        newBatchId: session.newBatchId,
        previousBatchId: session.previousBatchId,
      },
      currentBatchMeals: currentBatchMeals.map((meal) => ({
        id: meal.id,
        date: meal.date,
        mealType: meal.mealType,
        recipeName: meal.recipeName,
        recipeData: meal.recipeData,
        servings: meal.servings,
        completed: meal.completed,
        isAudible: meal.isAudible,
        suggestedDisposition: suggestDisposition(meal),
      })),
      hasExistingMeals: currentBatchMeals.length > 0,
    };
  }),

  /**
   * Abandon wizard session without completing
   * Cleans up all associated data (batch, meals, shopping items)
   */
  abandon: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      return { success: true };
    }

    // If a new batch was created, delete it and all associated data
    if (session.newBatchId) {
      // Delete accepted meals in this batch
      await ctx.db
        .delete(acceptedMeals)
        .where(eq(acceptedMeals.batchId, session.newBatchId));

      // Delete the batch itself (not just mark abandoned)
      await ctx.db
        .delete(batches)
        .where(eq(batches.id, session.newBatchId));
    }

    // Delete the session
    await ctx.db
      .delete(wizardSessions)
      .where(eq(wizardSessions.userId, ctx.userId));

    return { success: true };
  }),

  /**
   * Get wizard session status
   */
  getSession: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    return session
      ? {
          id: session.id,
          currentStep: session.currentStep,
          mealDispositions: session.mealDispositions,
          // Step 1 result: rollover count (floor for total)
          rolloverCount: session.rolloverCount ?? 0,
          // Step 2a: Meal counts planning
          totalMealCount: session.totalMealCount,
          manualPickCount: session.manualPickCount ?? 0,
          // Step 2b: Manual picks
          manualPickIds: session.manualPickIds,
          // Step 2c: AI suggestions
          targetMealCount: session.targetMealCount,
          acceptedMealIds: session.acceptedMealIds,
          newBatchId: session.newBatchId,
          previousBatchId: session.previousBatchId,
        }
      : null;
  }),

  /**
   * Go back to a previous step or sub-step
   *
   * Valid targets:
   * - 'step1': Go back to Step 1 (manage previous batch)
   * - 'step2a': Go back to Step 2a (plan batch - set meal counts)
   * - 'step2b': Go back to Step 2b (manual picks)
   * - 'step2c': Go back to Step 2c (AI suggestions)
   * - 'step3': Go back to Step 3 (shopping)
   */
  goBack: protectedProcedure
    .input(z.object({
      target: z.enum(['step1', 'step2a', 'step2b', 'step2c', 'step3']),
    }))
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

      const updates: Partial<typeof wizardSessions.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };

      // Helper to delete accepted meals by IDs
      const deleteAcceptedMealsByIds = async (mealIds: string[]) => {
        if (mealIds.length > 0) {
          await ctx.db
            .delete(acceptedMeals)
            .where(inArray(acceptedMeals.id, mealIds));
        }
      };

      // Get current accepted meal IDs for cleanup
      const currentAcceptedMealIds = (session.acceptedMealIds ?? []) as string[];

      switch (input.target) {
        case 'step1':
          // Going back to Step 1 is complex - would need to undo batch creation
          // For now, don't allow going back to Step 1 after it's complete
          if (session.currentStep > 1) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot go back to Step 1 after completing it. Please abandon and restart the wizard.',
            });
          }
          break;

        case 'step2a':
          // Reset to Step 2a (plan batch)
          // Clear meal counts so PlanBatchStep shows
          if (session.currentStep < 2) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot go to Step 2a - complete Step 1 first.',
            });
          }
          // Delete all accepted meals created during step 2 (both manual picks and AI accepted)
          await deleteAcceptedMealsByIds(currentAcceptedMealIds);
          updates.currentStep = 2;
          updates.totalMealCount = null;
          updates.manualPickCount = 0;
          updates.manualPickIds = [];
          updates.targetMealCount = null;
          updates.acceptedMealIds = [];
          updates.currentSuggestionRequestId = null;
          break;

        case 'step2b':
          // Reset to Step 2b (manual picks)
          // Keep totalMealCount and manualPickCount, clear picks
          if (session.currentStep < 2 || session.totalMealCount == null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot go to Step 2b - complete Step 2a first.',
            });
          }
          if ((session.manualPickCount ?? 0) === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'No manual picks configured. Go back to Step 2a to change.',
            });
          }
          // Delete all accepted meals created during step 2 (both manual picks and AI accepted)
          await deleteAcceptedMealsByIds(currentAcceptedMealIds);
          updates.currentStep = 2;
          updates.manualPickIds = [];
          updates.targetMealCount = null;
          updates.acceptedMealIds = [];
          updates.currentSuggestionRequestId = null;
          break;

        case 'step2c':
          // Reset to Step 2c (AI suggestions)
          // Keep manual picks, clear only AI-accepted meals
          if (session.currentStep < 2 || session.totalMealCount == null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot go to Step 2c - complete earlier steps first.',
            });
          }
          // Get manual pick meal count to determine which accepted meals are AI-accepted
          const manualPickCount = session.manualPickCount ?? 0;
          // Manual pick meal IDs are the first N in acceptedMealIds (added by completeManualPicks)
          const manualPickMealIds = currentAcceptedMealIds.slice(0, manualPickCount);
          const aiAcceptedMealIds = currentAcceptedMealIds.slice(manualPickCount);
          // Only delete AI-accepted meals, keep manual picks
          await deleteAcceptedMealsByIds(aiAcceptedMealIds);
          updates.currentStep = 2;
          updates.targetMealCount = null;
          // Keep only the manual pick meal IDs
          updates.acceptedMealIds = manualPickMealIds;
          updates.currentSuggestionRequestId = null;
          break;

        case 'step3':
          // Go back to Step 3 (shopping)
          if (session.currentStep < 3) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot go to Step 3 - complete Step 2 first.',
            });
          }
          updates.currentStep = 3;
          break;
      }

      await ctx.db
        .update(wizardSessions)
        .set(updates)
        .where(eq(wizardSessions.id, session.id));

      return { success: true, target: input.target };
    }),
});
