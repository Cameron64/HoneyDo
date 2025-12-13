/**
 * Step 2 Manual Picks Router
 *
 * Handles manual recipe selection from library or imported recipes.
 * This is step 2b in the wizard flow (between planning and AI suggestions).
 *
 * Flow:
 * - Step 2a: User sets totalMealCount and manualPickCount
 * - Step 2b: User selects manualPickCount recipes manually (this router)
 * - Step 2c: AI generates remaining (totalMealCount - manualPickCount) suggestions
 */

import { router, TRPCError } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import {
  setMealCountsSchema,
  addManualPickSchema,
  removeManualPickSchema,
} from '@honeydo/shared';
import {
  wizardSessions,
  acceptedMeals,
  batches,
  type ManualPickEntry,
} from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getRecipeDataService } from '../../../services/recipe-data';

export const step2ManualRouter = router({
  /**
   * Set meal counts for the batch (step 2a)
   *
   * Sets:
   * - totalMealCount: Total meals for the batch
   * - manualPickCount: How many user picks manually (0 = all AI)
   * - targetMealCount: AI target (= total - manual)
   */
  setMealCounts: protectedProcedure
    .input(setMealCountsSchema)
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

      // AI count = total - manual picks - rollovers
      const rolloverCount = session.rolloverCount ?? 0;
      const aiCount = input.total - input.manualPicks - rolloverCount;

      await ctx.db
        .update(wizardSessions)
        .set({
          totalMealCount: input.total,
          manualPickCount: input.manualPicks,
          targetMealCount: aiCount, // AI target for step 2c (excludes rollovers)
          manualPickIds: [], // Reset picks when counts change
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      return {
        success: true,
        totalMealCount: input.total,
        manualPickCount: input.manualPicks,
        rolloverCount,
        aiCount,
      };
    }),

  /**
   * Add a manual pick from the recipe library
   */
  addManualPick: protectedProcedure
    .input(addManualPickSchema)
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

      // Get recipe from library
      const recipeService = getRecipeDataService();
      const recipe = await recipeService.getById(input.recipeId);

      if (!recipe) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recipe not found in library',
        });
      }

      // Check not already picked
      const currentPicks = (session.manualPickIds ?? []) as ManualPickEntry[];
      if (currentPicks.some((p) => p.recipeId === input.recipeId)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Recipe already selected',
        });
      }

      // Check not exceeding limit
      const manualPickCount = session.manualPickCount ?? 0;
      if (currentPicks.length >= manualPickCount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum picks reached (${manualPickCount})`,
        });
      }

      // Add to picks
      const newPick: ManualPickEntry = {
        recipeId: input.recipeId,
        recipeName: recipe.name,
        servings: input.servings,
        addedAt: new Date().toISOString(),
      };

      await ctx.db
        .update(wizardSessions)
        .set({
          manualPickIds: [...currentPicks, newPick],
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      return {
        success: true,
        pick: newPick,
        picksCount: currentPicks.length + 1,
        target: manualPickCount,
      };
    }),

  /**
   * Remove a manual pick
   */
  removeManualPick: protectedProcedure
    .input(removeManualPickSchema)
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

      const currentPicks = (session.manualPickIds ?? []) as ManualPickEntry[];
      const filtered = currentPicks.filter((p) => p.recipeId !== input.recipeId);

      if (filtered.length === currentPicks.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pick not found',
        });
      }

      await ctx.db
        .update(wizardSessions)
        .set({
          manualPickIds: filtered,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(wizardSessions.id, session.id));

      return {
        success: true,
        picksCount: filtered.length,
        target: session.manualPickCount ?? 0,
      };
    }),

  /**
   * Get current manual picks with full recipe data
   */
  getManualPicks: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    const picks = (session.manualPickIds ?? []) as ManualPickEntry[];
    const recipeService = getRecipeDataService();

    // Enrich with full recipe data for display
    const enriched = await Promise.all(
      picks.map(async (pick) => {
        const recipe = await recipeService.getById(pick.recipeId);
        return {
          ...pick,
          recipe: recipe ?? null,
        };
      })
    );

    const target = session.manualPickCount ?? 0;
    const rolloverCount = session.rolloverCount ?? 0;
    // AI count = total - manual picks - rollovers
    const aiCount = (session.totalMealCount ?? 0) - target - rolloverCount;

    return {
      picks: enriched,
      target,
      complete: picks.length >= target,
      totalMealCount: session.totalMealCount,
      rolloverCount,
      aiCount,
    };
  }),

  /**
   * Complete manual picks step (step 2b → step 2c or step 3)
   *
   * Creates accepted_meals records for manual picks and determines next step.
   */
  completeManualPicks: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await ctx.db.query.wizardSessions.findFirst({
      where: eq(wizardSessions.userId, ctx.userId),
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active wizard session',
      });
    }

    const picks = (session.manualPickIds ?? []) as ManualPickEntry[];
    const manualPickCount = session.manualPickCount ?? 0;

    if (picks.length < manualPickCount) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Need ${manualPickCount - picks.length} more picks`,
      });
    }

    // Get batch for date range
    const batch = await ctx.db.query.batches.findFirst({
      where: eq(batches.id, session.newBatchId ?? ''),
    });

    if (!batch) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Batch not found',
      });
    }

    const recipeService = getRecipeDataService();
    const startDate = new Date(batch.dateRangeStart);
    const createdMealIds: string[] = [];

    // Create accepted_meals records for manual picks
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const recipe = await recipeService.getById(pick.recipeId);

      if (!recipe) {
        console.warn(`Recipe ${pick.recipeId} not found, skipping`);
        continue;
      }

      // Assign dates sequentially from batch start
      const mealDate = new Date(startDate);
      mealDate.setDate(mealDate.getDate() + i);

      const mealId = nanoid();

      await ctx.db.insert(acceptedMeals).values({
        id: mealId,
        batchId: session.newBatchId,
        suggestionId: null, // No AI suggestion
        suggestionIndex: null,
        date: mealDate.toISOString().split('T')[0],
        mealType: 'dinner',
        recipeName: recipe.name,
        recipeData: {
          name: recipe.name,
          description: '',
          source: recipe.source,
          sourceUrl: recipe.sourceUrl ?? undefined,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
          defaultServings: recipe.defaultServings,
          servingsUnit: recipe.servingsUnit,
          cuisine: recipe.cuisine,
          effort: recipe.effort,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
        },
        servings: pick.servings,
        isManualPick: true,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      createdMealIds.push(mealId);
    }

    // Determine next step
    // AI count = total - manual picks - rollovers
    const rolloverCount = session.rolloverCount ?? 0;
    const aiCount = (session.totalMealCount ?? 0) - manualPickCount - rolloverCount;

    // If no AI picks needed, skip to step 3
    // Otherwise, stay at step 2 for AI suggestions
    const nextStep = aiCount === 0 ? 3 : 2;

    await ctx.db
      .update(wizardSessions)
      .set({
        currentStep: nextStep,
        // Add manual pick meal IDs to accepted list
        acceptedMealIds: [
          ...((session.acceptedMealIds ?? []) as string[]),
          ...createdMealIds,
        ],
        updatedAt: new Date().toISOString(),
      })
      .where(eq(wizardSessions.id, session.id));

    return {
      success: true,
      createdMeals: createdMealIds.length,
      nextStep,
      aiCount,
      skipAiSuggestions: aiCount === 0,
    };
  }),
});
