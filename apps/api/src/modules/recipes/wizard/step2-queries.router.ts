/**
 * Step 2 Queries Router
 *
 * Read-only queries for step 2: progress, current suggestion, target count.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { setTargetCountSchema } from '@honeydo/shared';
import {
  wizardSessions,
  mealSuggestions,
  type MealSuggestionItem,
} from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const step2QueriesRouter = router({
  /**
   * Get suggestion progress for step 2
   */
  getSuggestionProgress: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    const acceptedMealIds = (session.acceptedMealIds || []) as string[];
    const manualPickIds = (session.manualPickIds || []) as Array<{ recipeId: string }>;

    // Calculate AI target count:
    // aiTarget = totalMealCount - manualPickCount - rolloverCount
    // Or fall back to targetMealCount for legacy sessions
    const totalMealCount = session.totalMealCount;
    const manualPickCount = session.manualPickCount ?? 0;
    const rolloverCount = session.rolloverCount ?? 0;

    const aiTargetCount = totalMealCount != null
      ? totalMealCount - manualPickCount - rolloverCount
      : (session.targetMealCount || 7);

    // AI accepted count = total accepted - manual picks already processed
    // acceptedMealIds contains both manual pick meals and AI accepted meals
    const aiAcceptedCount = Math.max(0, acceptedMealIds.length - manualPickIds.length);

    // Get pending suggestion count
    let pendingSuggestionCount = 0;
    if (session.currentSuggestionRequestId) {
      const request = await ctx.db.query.mealSuggestions.findFirst({
        where: eq(mealSuggestions.id, session.currentSuggestionRequestId),
      });
      if (request?.suggestions) {
        const suggestions = request.suggestions as MealSuggestionItem[];
        pendingSuggestionCount = suggestions.filter((s) => s.accepted === null).length;
      }
    }

    return {
      targetCount: aiTargetCount,
      acceptedCount: aiAcceptedCount,
      totalAcceptedCount: acceptedMealIds.length,
      manualPickCount: manualPickIds.length,
      pendingSuggestionCount,
    };
  }),

  /**
   * Get the current wizard's suggestion request (not the global most recent)
   */
  getCurrentSuggestion: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session?.currentSuggestionRequestId) {
      return null;
    }

    return ctx.db.query.mealSuggestions.findFirst({
      where: eq(mealSuggestions.id, session.currentSuggestionRequestId),
    });
  }),

  /**
   * Set target meal count for step 2
   */
  setTargetCount: protectedProcedure
    .input(setTargetCountSchema)
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

      await ctx.db
        .update(wizardSessions)
        .set({
          targetMealCount: input.count,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      return { success: true };
    }),
});
