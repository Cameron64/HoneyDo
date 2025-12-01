import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import {
  requestSuggestionsSchema,
  acceptMealSchema,
  rejectMealSchema,
  setServingsSchema,
  type SkillInput,
} from '@honeydo/shared';
import {
  mealSuggestions,
  acceptedMeals,
  mealPreferences,
  ingredientPreferences,
  mealPreferenceNotes,
  type MealSuggestionItem,
} from '../../db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { socketEmitter } from '../../services/websocket/emitter';
import {
  mealSuggestionsService,
  getCurrentSeason,
} from '../../services/meal-suggestions';

export const suggestionsRouter = router({
  // Manual trigger - request new suggestions
  request: protectedProcedure
    .input(requestSuggestionsSchema)
    .mutation(async ({ ctx, input }) => {
      // Create pending request record
      const [request] = await ctx.db
        .insert(mealSuggestions)
        .values({
          requestedBy: ctx.userId,
          dateRangeStart: input.dateRangeStart,
          dateRangeEnd: input.dateRangeEnd,
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
          limit: 21, // Up to 3 weeks of dinners
        }),
      ]);

      const skillInput: SkillInput = {
        dateRange: {
          start: input.dateRangeStart,
          end: input.dateRangeEnd,
        },
        mealTypes: input.mealTypes,
        servings: prefs?.defaultServings ?? 4,
        suggestionsCount: 7, // Default to 7 suggestions for a week
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
        notes: notes.map((n) => ({
          type: n.noteType,
          content: n.content,
        })),
        context: {
          season: getCurrentSeason(),
          currentDate: new Date().toISOString().split('T')[0],
        },
      };

      // Call the meal suggestions service asynchronously
      // This runs in the background and updates the DB when complete
      console.log('[MealSuggestions] Starting suggestion generation for request:', request.id);
      const userId = ctx.userId; // Capture userId before async operation
      mealSuggestionsService
        .getSuggestions(skillInput)
        .then(async (output) => {
          console.log('[MealSuggestions] Received output:', JSON.stringify(output).slice(0, 500));
          // Transform output to MealSuggestionItem format
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

          console.log('[MealSuggestions] Updating database with', suggestions.length, 'suggestions...');
          try {
            await ctx.db
              .update(mealSuggestions)
              .set({
                status: 'received',
                suggestions,
                reasoning: output.reasoning,
                visibleCount: suggestions.length,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(mealSuggestions.id, request.id));
            console.log('[MealSuggestions] Database updated successfully');
          } catch (dbError) {
            console.error('[MealSuggestions] Database update failed:', dbError);
            throw dbError;
          }

          // Notify frontend via WebSocket
          console.log('[MealSuggestions] Emitting WebSocket event to user:', userId);
          socketEmitter.toUser(userId, 'recipes:suggestions:received', {
            suggestionId: request.id,
          });
          console.log('[MealSuggestions] WebSocket event emitted');
        })
        .catch(async (error) => {
          console.error('[MealSuggestions] Error generating suggestions:', error);
          // Store the error for retry capability
          await ctx.db
            .update(mealSuggestions)
            .set({
              status: 'expired', // Using 'expired' as error state
              error: error instanceof Error ? error.message : String(error),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(mealSuggestions.id, request.id));

          // Notify frontend of failure
          socketEmitter.toUser(ctx.userId, 'recipes:suggestions:error', {
            suggestionId: request.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return { requestId: request.id, status: 'pending' };
    }),

  // Get current/recent suggestions
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    // Get the most recent suggestion regardless of status
    const mostRecent = await ctx.db.query.mealSuggestions.findFirst({
      where: eq(mealSuggestions.requestedBy, ctx.userId),
      orderBy: desc(mealSuggestions.createdAt),
    });

    // If the most recent is pending, show that (user is waiting for results)
    if (mostRecent?.status === 'pending') {
      return mostRecent;
    }

    // Otherwise, try to find a 'received' suggestion to show
    const received = await ctx.db.query.mealSuggestions.findFirst({
      where: and(
        eq(mealSuggestions.requestedBy, ctx.userId),
        eq(mealSuggestions.status, 'received')
      ),
      orderBy: desc(mealSuggestions.createdAt),
    });

    if (received) return received;

    // Fallback to the most recent (could be expired/error)
    return mostRecent;
  }),

  // Get all suggestions (for history)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.mealSuggestions.findMany({
      where: eq(mealSuggestions.requestedBy, ctx.userId),
      orderBy: desc(mealSuggestions.createdAt),
      limit: 10,
    });
  }),

  // Get suggestion by ID
  getById: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return ctx.db.query.mealSuggestions.findFirst({
      where: and(
        eq(mealSuggestions.id, input),
        eq(mealSuggestions.requestedBy, ctx.userId)
      ),
    });
  }),

  // Accept individual meal
  acceptMeal: protectedProcedure
    .input(acceptMealSchema)
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

      // Update suggestion record
      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input.suggestionId));

      // Create accepted meal record
      const servings = input.servings ?? meal.recipe.defaultServings;
      const [accepted] = await ctx.db
        .insert(acceptedMeals)
        .values({
          suggestionId: input.suggestionId,
          suggestionIndex: input.mealIndex,
          date: meal.date,
          mealType: meal.mealType,
          recipeName: meal.recipe.name,
          recipeData: meal.recipe,
          servings,
        })
        .returning();

      // Emit WebSocket event
      socketEmitter.toUser(ctx.userId, 'recipes:meal:accepted', {
        mealId: accepted.id,
        date: meal.date,
        mealType: meal.mealType,
      });

      return accepted;
    }),

  // Reject individual meal
  rejectMeal: protectedProcedure
    .input(rejectMealSchema)
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

      if (!meals[input.mealIndex]) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Meal index out of range',
        });
      }

      // Mark as rejected
      meals[input.mealIndex].accepted = false;

      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input.suggestionId));

      return { success: true };
    }),

  // Set servings override
  setServings: protectedProcedure
    .input(setServingsSchema)
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

      if (!meals[input.mealIndex]) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Meal index out of range',
        });
      }

      meals[input.mealIndex].servingsOverride = input.servings;

      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input.suggestionId));

      // Also update accepted_meals if already accepted
      const existingAccepted = await ctx.db.query.acceptedMeals.findFirst({
        where: and(
          eq(acceptedMeals.suggestionId, input.suggestionId),
          eq(acceptedMeals.suggestionIndex, input.mealIndex)
        ),
      });

      if (existingAccepted) {
        await ctx.db
          .update(acceptedMeals)
          .set({ servings: input.servings })
          .where(eq(acceptedMeals.id, existingAccepted.id));
      }

      return { success: true };
    }),

  // Accept all remaining (unreviewed) meals
  acceptAll: protectedProcedure
    .input(z.string()) // suggestionId
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.db.query.mealSuggestions.findFirst({
        where: and(
          eq(mealSuggestions.id, input),
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
      const acceptedMealRecords: (typeof acceptedMeals.$inferInsert)[] = [];

      meals.forEach((meal, index) => {
        if (meal.accepted === null) {
          // Not yet reviewed
          meal.accepted = true;
          acceptedMealRecords.push({
            suggestionId: input,
            suggestionIndex: index,
            date: meal.date,
            mealType: meal.mealType,
            recipeName: meal.recipe.name,
            recipeData: meal.recipe,
            servings: meal.servingsOverride ?? meal.recipe.defaultServings,
          });
        }
      });

      // Update suggestion
      await ctx.db
        .update(mealSuggestions)
        .set({
          suggestions: meals,
          status: 'reviewed',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealSuggestions.id, input));

      // Insert all accepted meals
      if (acceptedMealRecords.length > 0) {
        await ctx.db.insert(acceptedMeals).values(acceptedMealRecords);
      }

      socketEmitter.toUser(ctx.userId, 'recipes:suggestions:updated', {
        suggestionId: input,
      });

      return { acceptedCount: acceptedMealRecords.length };
    }),

  // Retry a failed request
  retry: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const request = await ctx.db.query.mealSuggestions.findFirst({
      where: and(
        eq(mealSuggestions.id, input),
        eq(mealSuggestions.requestedBy, ctx.userId)
      ),
    });

    if (!request) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Request not found',
      });
    }

    // Reset to pending
    await ctx.db
      .update(mealSuggestions)
      .set({
        status: 'pending',
        error: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(mealSuggestions.id, input));

    // Re-build skill input and trigger again
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

    const skillInput: SkillInput = {
      dateRange: {
        start: request.dateRangeStart,
        end: request.dateRangeEnd,
      },
      mealTypes: ['dinner'], // Default to dinner for retries
      servings: prefs?.defaultServings ?? 4,
      suggestionsCount: 7, // Default to 7 suggestions for retry
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
      notes: notes.map((n) => ({
        type: n.noteType,
        content: n.content,
      })),
      context: {
        season: getCurrentSeason(),
        currentDate: new Date().toISOString().split('T')[0],
      },
    };

    // Re-trigger skill invocation
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
            visibleCount: suggestions.length,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(mealSuggestions.id, input));

        socketEmitter.toUser(ctx.userId, 'recipes:suggestions:received', {
          suggestionId: input,
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
          .where(eq(mealSuggestions.id, input));

        socketEmitter.toUser(ctx.userId, 'recipes:suggestions:error', {
          suggestionId: input,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return { requestId: input, status: 'pending' };
  }),
});
