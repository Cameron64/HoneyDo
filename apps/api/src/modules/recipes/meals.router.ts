import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import { dateRangeSchema, type SkillInput } from '@honeydo/shared';
import { db } from '../../db';
import {
  acceptedMeals,
  batches,
  mealPreferences,
  ingredientPreferences,
  mealPreferenceNotes,
  mealSuggestions,
  type MealSuggestionItem,
} from '../../db/schema';
import { eq, and, gte, lte, desc, isNull } from 'drizzle-orm';
import { socketEmitter } from '../../services/websocket/emitter';
import {
  mealSuggestionsService,
  getCurrentSeason,
} from '../../services/meal-suggestions';

// Audible reason schema
const audibleReasonSchema = z.enum([
  'missing_ingredient',
  'time_crunch',
  'mood_change',
  'other',
]);

const audibleInputSchema = z.object({
  mealId: z.string(),
  reason: audibleReasonSchema,
  details: z.string().max(500).optional(),
});

export const mealsRouter = router({
  // Get meals in date range
  getRange: protectedProcedure.input(dateRangeSchema).query(async ({ ctx, input }) => {
    const meals = await ctx.db.query.acceptedMeals.findMany({
      where: and(
        gte(acceptedMeals.date, input.start),
        lte(acceptedMeals.date, input.end)
      ),
      orderBy: [acceptedMeals.date, acceptedMeals.mealType],
    });

    // Group by date
    const grouped = meals.reduce(
      (acc, meal) => {
        if (!acc[meal.date]) {
          acc[meal.date] = [];
        }
        acc[meal.date].push(meal);
        return acc;
      },
      {} as Record<string, typeof meals>
    );

    return {
      meals,
      byDate: grouped,
    };
  }),

  // Get meals for a specific date
  getByDate: protectedProcedure
    .input(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.acceptedMeals.findMany({
        where: eq(acceptedMeals.date, input),
        orderBy: acceptedMeals.mealType,
      });
    }),

  // Get single meal detail
  getById: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return ctx.db.query.acceptedMeals.findFirst({
      where: eq(acceptedMeals.id, input),
    });
  }),

  // Mark a meal as completed (cooked)
  markCompleted: protectedProcedure
    .input(
      z.object({
        mealId: z.string(),
        completed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meal = await ctx.db.query.acceptedMeals.findFirst({
        where: eq(acceptedMeals.id, input.mealId),
      });

      if (!meal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Meal not found',
        });
      }

      const [updated] = await ctx.db
        .update(acceptedMeals)
        .set({
          completed: input.completed,
          completedAt: input.completed ? new Date().toISOString() : null,
        })
        .where(eq(acceptedMeals.id, input.mealId))
        .returning();

      // Emit WebSocket event
      socketEmitter.broadcast('recipes:meal:completed', {
        mealId: input.mealId,
        date: meal.date,
        mealType: meal.mealType,
        completed: input.completed,
      });

      return updated;
    }),

  // Remove an accepted meal
  remove: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const meal = await ctx.db.query.acceptedMeals.findFirst({
      where: eq(acceptedMeals.id, input),
    });

    if (!meal) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Meal not found',
      });
    }

    await ctx.db.delete(acceptedMeals).where(eq(acceptedMeals.id, input));

    // Emit WebSocket event
    socketEmitter.broadcast('recipes:meal:removed', {
      date: meal.date,
      mealType: meal.mealType,
    });

    return { success: true };
  }),

  // Get upcoming meals (next N days)
  getUpcoming: protectedProcedure
    .input(z.number().min(1).max(30).default(7))
    .query(async ({ ctx, input }) => {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + input);
      const end = endDate.toISOString().split('T')[0];

      return ctx.db.query.acceptedMeals.findMany({
        where: and(gte(acceptedMeals.date, today), lte(acceptedMeals.date, end)),
        orderBy: [acceptedMeals.date, acceptedMeals.mealType],
      });
    }),

  // Get meals from the current active batch
  getCurrentBatch: protectedProcedure.query(async ({ ctx }) => {
    // Find the active batch for the user
    const activeBatch = await ctx.db.query.batches.findFirst({
      where: and(eq(batches.userId, ctx.userId), eq(batches.status, 'active')),
      orderBy: desc(batches.createdAt),
    });

    let meals;
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

    return {
      batch: activeBatch,
      meals,
    };
  }),

  // Count meals pending shopping list generation (date-based)
  getPendingShoppingCount: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          gte(acceptedMeals.date, input.start),
          lte(acceptedMeals.date, input.end),
          eq(acceptedMeals.shoppingListGenerated, false)
        ),
      });

      return { count: meals.length };
    }),

  // Count meals in current batch pending shopping list generation
  getCurrentBatchPendingShoppingCount: protectedProcedure.query(async ({ ctx }) => {
    // Find the active batch for the user
    const activeBatch = await ctx.db.query.batches.findFirst({
      where: and(eq(batches.userId, ctx.userId), eq(batches.status, 'active')),
      orderBy: desc(batches.createdAt),
    });

    let meals;
    if (activeBatch) {
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          eq(acceptedMeals.batchId, activeBatch.id),
          eq(acceptedMeals.shoppingListGenerated, false)
        ),
      });
    } else {
      // Legacy: count meals without batch ID that are pending
      meals = await ctx.db.query.acceptedMeals.findMany({
        where: and(
          isNull(acceptedMeals.batchId),
          eq(acceptedMeals.shoppingListGenerated, false)
        ),
      });
    }

    return { count: meals.length };
  }),

  // Audible - request a replacement for a meal
  audible: protectedProcedure
    .input(audibleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const meal = await ctx.db.query.acceptedMeals.findFirst({
        where: eq(acceptedMeals.id, input.mealId),
      });

      if (!meal) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Meal not found',
        });
      }

      // Create a pending suggestion request just for this meal
      const [request] = await ctx.db
        .insert(mealSuggestions)
        .values({
          requestedBy: ctx.userId,
          dateRangeStart: meal.date,
          dateRangeEnd: meal.date,
          status: 'pending',
        })
        .returning();

      // Build skill input by gathering all preferences
      const [prefs, ingredients, notes, recentMealsData] = await Promise.all([
        ctx.db.query.mealPreferences.findFirst({
          where: eq(mealPreferences.userId, ctx.userId),
        }),
        ctx.db.query.ingredientPreferences.findMany({
          where: eq(ingredientPreferences.userId, ctx.userId),
        }),
        ctx.db.query.mealPreferenceNotes.findMany({
          where: and(
            eq(mealPreferenceNotes.userId, ctx.userId),
            eq(mealPreferenceNotes.isActive, true)
          ),
        }),
        // Get recent meals from the last 14 days to avoid repetition
        ctx.db.query.acceptedMeals.findMany({
          where: gte(
            acceptedMeals.date,
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0]
          ),
          orderBy: desc(acceptedMeals.date),
          limit: 21,
        }),
      ]);

      // Add context about why we're replacing
      const audibleContext = `AUDIBLE REQUEST: User wants to replace "${meal.recipeName}" on ${meal.date}.
Reason: ${input.reason}${input.details ? `. Details: ${input.details}` : ''}
Please suggest ONE replacement meal for ${meal.mealType} on ${meal.date} only.`;

      const notesWithAudible = [
        ...notes.map((n) => ({
          type: n.noteType,
          content: n.content,
        })),
        {
          type: 'general' as const,
          content: audibleContext,
        },
      ];

      const skillInput: SkillInput = {
        dateRange: {
          start: meal.date,
          end: meal.date,
        },
        mealTypes: [meal.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack'],
        servings: prefs?.defaultServings ?? meal.servings,
        suggestionsCount: 1, // Only need 1 replacement meal
        recentMeals: recentMealsData.map((m) => ({
          date: m.date,
          mealType: m.mealType,
          recipeName: m.recipeName,
          cuisine: (m.recipeData as { cuisine?: string })?.cuisine ?? 'Unknown',
        })),
        preferences: {
          cuisinePreferences:
            (prefs?.cuisinePreferences as Record<
              string,
              { maxPerWeek: number; preference: string }
            >) ?? {},
          dietaryRestrictions:
            (prefs?.dietaryRestrictions as Array<{
              name: string;
              scope: 'always' | 'weekly';
              mealsPerWeek?: number;
            }>) ?? [],
          weeknightMaxMinutes: prefs?.weeknightMaxMinutes ?? 45,
          weekendMaxMinutes: prefs?.weekendMaxMinutes ?? 120,
          weeknightMaxEffort: prefs?.weeknightMaxEffort ?? 3,
          weekendMaxEffort: prefs?.weekendMaxEffort ?? 5,
        },
        ingredientPreferences: ingredients.map((i) => ({
          ingredient: i.ingredient,
          preference: i.preference,
          notes: i.notes,
        })),
        notes: notesWithAudible,
        context: {
          season: getCurrentSeason(),
          currentDate: new Date().toISOString().split('T')[0],
        },
      };

      // Call the meal suggestions service asynchronously
      console.log('[Audible] Starting replacement generation for meal:', meal.id);
      const userId = ctx.userId;
      const mealId = meal.id;
      const mealDate = meal.date;
      const mealType = meal.mealType;

      mealSuggestionsService
        .getSuggestions(skillInput)
        .then(async (output) => {
          console.log('[Audible] Received replacement suggestion, count:', output.suggestions.length);

          if (output.suggestions.length === 0) {
            throw new Error('No replacement suggestions returned');
          }

          const replacement = output.suggestions[0];
          console.log('[Audible] Replacement recipe:', replacement.recipe.name);
          console.log('[Audible] Deleting old meal:', mealId);

          // Delete the old meal - use global db, not ctx.db (ctx may be invalid after response)
          await db.delete(acceptedMeals).where(eq(acceptedMeals.id, mealId));
          console.log('[Audible] Delete completed');

          // Create the replacement meal
          console.log('[Audible] Creating new meal for date:', mealDate, 'mealType:', mealType);
          const [newMeal] = await db
            .insert(acceptedMeals)
            .values({
              suggestionId: request.id,
              suggestionIndex: 0,
              date: mealDate,
              mealType: mealType,
              recipeName: replacement.recipe.name,
              recipeData: replacement.recipe,
              servings: prefs?.defaultServings ?? 4,
            })
            .returning();
          console.log('[Audible] New meal created:', newMeal.id);

          // Update the suggestion record
          const suggestions: MealSuggestionItem[] = [{
            date: mealDate,
            mealType: mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
            recipe: replacement.recipe,
            accepted: true,
            servingsOverride: null,
            notes: `Audible replacement for "${meal.recipeName}". Reason: ${input.reason}`,
          }];

          await db
            .update(mealSuggestions)
            .set({
              status: 'reviewed',
              suggestions,
              reasoning: output.reasoning,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, request.id));

          // Notify frontend via WebSocket
          socketEmitter.toUser(userId, 'recipes:meal:accepted', {
            mealId: newMeal.id,
            date: mealDate,
            mealType: mealType,
          });
        })
        .catch(async (error) => {
          console.error('[Audible] Error generating replacement:', error);

          // Update the suggestion record with error - use global db
          await db
            .update(mealSuggestions)
            .set({
              status: 'expired',
              error: error instanceof Error ? error.message : String(error),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, request.id));

          // Notify frontend of failure
          socketEmitter.toUser(userId, 'recipes:suggestions:error', {
            suggestionId: request.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return { requestId: request.id, status: 'pending' };
    }),
});
