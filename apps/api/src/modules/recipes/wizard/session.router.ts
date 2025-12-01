/**
 * Session Router
 *
 * Handles wizard session management: start, abandon, getSession
 */

import { router } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import {
  wizardSessions,
  batches,
  acceptedMeals,
  type AcceptedMealRow,
} from '../../../db/schema';
import { eq, isNull } from 'drizzle-orm';
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
   */
  abandon: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      return { success: true };
    }

    // If a new batch was created, mark it as abandoned
    if (session.newBatchId) {
      await ctx.db
        .update(batches)
        .set({ status: 'abandoned' })
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
          targetMealCount: session.targetMealCount,
          acceptedMealIds: session.acceptedMealIds,
          newBatchId: session.newBatchId,
          previousBatchId: session.previousBatchId,
        }
      : null;
  }),
});
