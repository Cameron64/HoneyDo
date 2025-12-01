/**
 * Step 2 Actions Router
 *
 * Handles accept/decline suggestions and completing step 2.
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { z } from 'zod';
import { acceptMealSchema } from '@honeydo/shared';
import {
  wizardSessions,
  mealSuggestions,
  acceptedMeals,
  type MealSuggestionItem,
} from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { socketEmitter } from '../../../services/websocket/emitter';

export const step2ActionsRouter = router({
  /**
   * Accept a suggestion within wizard context
   */
  acceptSuggestion: protectedProcedure
    .input(acceptMealSchema)
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

      const meals = suggestion.suggestions as MealSuggestionItem[];
      const meal = meals[input.mealIndex];

      if (!meal) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Meal index out of range',
        });
      }

      // Mark as accepted in JSON
      meals[input.mealIndex].accepted = true;
      if (input.servings) {
        meals[input.mealIndex].servingsOverride = input.servings;
      }

      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input.suggestionId));

      // Create accepted meal record in the new batch
      const servings = input.servings ?? meal.recipe.defaultServings;
      const [accepted] = await ctx.db
        .insert(acceptedMeals)
        .values({
          suggestionId: input.suggestionId,
          suggestionIndex: input.mealIndex,
          batchId: session.newBatchId,
          date: meal.date,
          mealType: meal.mealType,
          recipeName: meal.recipe.name,
          recipeData: meal.recipe,
          servings,
          isRollover: false, // Explicitly set to ensure not treated as rollover
          shoppingListGenerated: false, // Explicitly set for shopping step
        })
        .returning();

      // Update session with accepted meal ID
      const acceptedMealIds = (session.acceptedMealIds || []) as string[];
      await ctx.db
        .update(wizardSessions)
        .set({
          acceptedMealIds: [...acceptedMealIds, accepted.id],
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      socketEmitter.toUser(ctx.userId, 'recipes:meal:accepted', {
        mealId: accepted.id,
        date: meal.date,
        mealType: meal.mealType,
      });

      return {
        mealId: accepted.id,
        acceptedCount: acceptedMealIds.length + 1,
        targetCount: session.targetMealCount || 7,
      };
    }),

  /**
   * Decline a suggestion within wizard context
   * This seamlessly swaps in a hidden backup suggestion if available
   */
  declineSuggestion: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string(),
        mealIndex: z.number().nonnegative(),
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

      const meals = suggestion.suggestions as MealSuggestionItem[];
      const visibleCount = suggestion.visibleCount ?? meals.length;

      if (!meals[input.mealIndex]) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Meal index out of range',
        });
      }

      // Mark as rejected
      meals[input.mealIndex].accepted = false;

      // Find the first available hidden suggestion (beyond visibleCount, not yet reviewed)
      let replacementIndex = -1;
      let replacement: MealSuggestionItem | null = null;
      for (let i = visibleCount; i < meals.length; i++) {
        if (meals[i].accepted === null) {
          replacementIndex = i;
          replacement = meals[i];
          break;
        }
      }

      // If we found a replacement, swap it into the rejected position
      if (replacement && replacementIndex !== -1) {
        // Move the rejected meal to the hidden area (keep it for history)
        // and put the replacement in its place
        const rejectedMeal = meals[input.mealIndex];
        meals[input.mealIndex] = replacement;
        meals[replacementIndex] = rejectedMeal;
      }

      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input.suggestionId));

      // Count remaining hidden suggestions for background fetch trigger
      const remainingHidden = meals
        .slice(visibleCount)
        .filter((m) => m.accepted === null).length;
      const needsMoreSuggestions = remainingHidden <= 2;

      // Emit an event so frontend can update UI instantly
      socketEmitter.toUser(ctx.userId, 'recipes:suggestions:updated', {
        suggestionId: input.suggestionId,
        replacementAvailable: replacement !== null,
        remainingHidden,
        needsMoreSuggestions,
      });

      return {
        success: true,
        replacement: replacement
          ? {
              date: replacement.date,
              mealType: replacement.mealType,
              recipeName: replacement.recipe.name,
            }
          : null,
        remainingHidden,
        needsMoreSuggestions,
      };
    }),

  /**
   * Complete Step 2: Move to shopping
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

    const acceptedCount = (session.acceptedMealIds || []).length;
    const targetCount = session.targetMealCount || 7;

    if (acceptedCount < targetCount) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `You need to accept ${targetCount - acceptedCount} more meals`,
      });
    }

    await ctx.db
      .update(wizardSessions)
      .set({
        currentStep: 3,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    socketEmitter.toUser(ctx.userId, 'recipes:wizard:step-completed', {
      step: 2,
      nextStep: 3,
    });

    return { success: true };
  }),
});
