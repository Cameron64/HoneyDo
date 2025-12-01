/**
 * Step 2 Request Router
 *
 * Handles AI suggestion requests: requestMoreSuggestions, fetchMoreHiddenSuggestions.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { z } from 'zod';
import { requestSuggestionsSchema } from '@honeydo/shared';
import {
  wizardSessions,
  mealSuggestions,
  type MealSuggestionItem,
} from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { socketEmitter } from '../../../services/websocket/emitter';
import { mealSuggestionsService } from '../../../services/meal-suggestions';
import { buildSkillInput } from './step2-helpers';

export const step2RequestRouter = router({
  /**
   * Request more suggestions for step 2
   */
  requestMoreSuggestions: protectedProcedure
    .input(requestSuggestionsSchema)
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

      // Calculate how many suggestions to request
      const targetCount = session.targetMealCount || 7;
      const acceptedMealIds = (session.acceptedMealIds || []) as string[];
      const acceptedCount = acceptedMealIds.length;
      // Request DOUBLE what we need to show (4 visible + 4 hidden for seamless replacements)
      // This allows users to reject suggestions and immediately see replacements
      const visibleCount = Math.max(4, targetCount - acceptedCount);
      const suggestionsCount = visibleCount * 2; // Request double for hidden backups

      // Create pending request record
      const [request] = await ctx.db
        .insert(mealSuggestions)
        .values({
          requestedBy: ctx.userId,
          dateRangeStart: input.dateRangeStart,
          dateRangeEnd: input.dateRangeEnd,
          status: 'pending',
          visibleCount, // Store how many suggestions to show (rest are hidden backups)
        })
        .returning();

      // Update session with current request
      await ctx.db
        .update(wizardSessions)
        .set({
          currentSuggestionRequestId: request.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      // Build skill input
      const skillInput = await buildSkillInput({
        db: ctx.db,
        userId: ctx.userId,
        dateRangeStart: input.dateRangeStart,
        dateRangeEnd: input.dateRangeEnd,
        mealTypes: input.mealTypes,
        suggestionsCount,
      });

      // Call the meal suggestions service asynchronously
      const userId = ctx.userId;
      mealSuggestionsService
        .getSuggestions(skillInput)
        .then(async (output) => {
          const suggestions: MealSuggestionItem[] = output.suggestions.map(
            (s) => ({
              date: s.date,
              mealType: s.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
              recipe: s.recipe,
              accepted: null,
              servingsOverride: null,
              notes: null,
            })
          );

          await ctx.db
            .update(mealSuggestions)
            .set({
              status: 'received',
              suggestions,
              reasoning: output.reasoning,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, request.id));

          socketEmitter.toUser(userId, 'recipes:suggestions:received', {
            suggestionId: request.id,
          });
        })
        .catch(async (error) => {
          await ctx.db
            .update(mealSuggestions)
            .set({
              status: 'expired',
              error: error instanceof Error ? error.message : String(error),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, request.id));

          socketEmitter.toUser(userId, 'recipes:suggestions:error', {
            suggestionId: request.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return { requestId: request.id, status: 'pending' };
    }),

  /**
   * Fetch additional hidden suggestions (called when hidden count drops to 2)
   * This adds more backup suggestions to the existing set without replacing visible ones
   */
  fetchMoreHiddenSuggestions: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        count: z.number().min(2).max(8).default(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.db.query.mealSuggestions.findFirst({
        where: and(
          eq(mealSuggestions.id, input.suggestionId),
          eq(mealSuggestions.requestedBy, ctx.userId)
        ),
      });

      if (!suggestion || !suggestion.suggestions) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Suggestion not found',
        });
      }

      const session = await ctx.db.query.wizardSessions.findFirst({
        where: eq(wizardSessions.userId, ctx.userId),
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active wizard session',
        });
      }

      // Get existing suggestions to avoid duplicates
      const existingMeals = suggestion.suggestions as MealSuggestionItem[];
      const existingRecipeNames = existingMeals.map((m) =>
        m.recipe.name.toLowerCase()
      );

      // Build skill input with duplicate avoidance
      const skillInput = await buildSkillInput({
        db: ctx.db,
        userId: ctx.userId,
        dateRangeStart: suggestion.dateRangeStart,
        dateRangeEnd: suggestion.dateRangeEnd,
        mealTypes: ['dinner'], // Default to dinner
        suggestionsCount: input.count,
        existingMeals,
      });

      // Call the meal suggestions service asynchronously
      const userId = ctx.userId;
      const suggestionId = input.suggestionId;

      mealSuggestionsService
        .getSuggestions(skillInput)
        .then(async (output) => {
          // Get the latest suggestion data (may have changed while fetching)
          const latestSuggestion = await ctx.db.query.mealSuggestions.findFirst({
            where: eq(mealSuggestions.id, suggestionId),
          });

          if (!latestSuggestion?.suggestions) return;

          const currentMeals = latestSuggestion.suggestions as MealSuggestionItem[];

          // Filter out any suggestions that match existing recipe names
          const newSuggestions: MealSuggestionItem[] = output.suggestions
            .filter(
              (s) => !existingRecipeNames.includes(s.recipe.name.toLowerCase())
            )
            .map((s) => ({
              date: s.date,
              mealType: s.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
              recipe: s.recipe,
              accepted: null,
              servingsOverride: null,
              notes: null,
            }));

          // Append new suggestions to the end (hidden area)
          const mergedSuggestions = [...currentMeals, ...newSuggestions];

          await ctx.db
            .update(mealSuggestions)
            .set({
              suggestions: mergedSuggestions,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, suggestionId));

          socketEmitter.toUser(userId, 'recipes:suggestions:more-received', {
            suggestionId,
            newCount: newSuggestions.length,
            totalHidden:
              mergedSuggestions.length -
              (latestSuggestion.visibleCount ?? currentMeals.length),
          });
        })
        .catch((error) => {
          console.error(
            '[FetchMore] Error fetching additional suggestions:',
            error
          );
          socketEmitter.toUser(userId, 'recipes:suggestions:more-error', {
            suggestionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return { status: 'fetching' };
    }),
});
