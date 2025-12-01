import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import {
  updateMealPreferencesSchema,
  setIngredientPreferenceSchema,
  addNoteSchema,
  updateNoteSchema,
} from '@honeydo/shared';
import {
  mealPreferences,
  ingredientPreferences,
  mealPreferenceNotes,
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export const preferencesRouter = router({
  // Get fixed preferences (creates default if none exist)
  get: protectedProcedure.query(async ({ ctx }) => {
    let prefs = await ctx.db.query.mealPreferences.findFirst({
      where: eq(mealPreferences.userId, ctx.userId),
    });

    if (!prefs) {
      // Create default preferences
      const [created] = await ctx.db
        .insert(mealPreferences)
        .values({
          userId: ctx.userId,
          cuisinePreferences: {},
          dietaryRestrictions: [],
        })
        .returning();
      prefs = created;
    }

    return prefs;
  }),

  // Update fixed preferences
  update: protectedProcedure
    .input(updateMealPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      // First ensure preferences exist
      const existing = await ctx.db.query.mealPreferences.findFirst({
        where: eq(mealPreferences.userId, ctx.userId),
      });

      if (!existing) {
        // Create with provided values
        const [created] = await ctx.db
          .insert(mealPreferences)
          .values({
            userId: ctx.userId,
            ...input,
          })
          .returning();
        return created;
      }

      // Update existing
      const [updated] = await ctx.db
        .update(mealPreferences)
        .set({
          ...input,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealPreferences.userId, ctx.userId))
        .returning();

      return updated;
    }),

  // ============================================
  // Ingredient Preferences
  // ============================================

  getIngredients: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.ingredientPreferences.findMany({
      where: eq(ingredientPreferences.userId, ctx.userId),
      orderBy: (prefs, { asc }) => [asc(prefs.ingredient)],
    });
  }),

  setIngredient: protectedProcedure
    .input(setIngredientPreferenceSchema)
    .mutation(async ({ ctx, input }) => {
      const normalizedIngredient = input.ingredient.toLowerCase().trim();

      // Check if exists
      const existing = await ctx.db.query.ingredientPreferences.findFirst({
        where: and(
          eq(ingredientPreferences.userId, ctx.userId),
          eq(ingredientPreferences.ingredient, normalizedIngredient)
        ),
      });

      if (existing) {
        // Update existing
        const [updated] = await ctx.db
          .update(ingredientPreferences)
          .set({
            preference: input.preference,
            notes: input.notes ?? null,
          })
          .where(eq(ingredientPreferences.id, existing.id))
          .returning();
        return updated;
      }

      // Create new
      const [created] = await ctx.db
        .insert(ingredientPreferences)
        .values({
          userId: ctx.userId,
          ingredient: normalizedIngredient,
          preference: input.preference,
          notes: input.notes ?? null,
        })
        .returning();
      return created;
    }),

  removeIngredient: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(ingredientPreferences)
        .where(
          and(
            eq(ingredientPreferences.id, input),
            eq(ingredientPreferences.userId, ctx.userId)
          )
        );
      return { success: true };
    }),

  // ============================================
  // Freeform Notes
  // ============================================

  getNotes: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.mealPreferenceNotes.findMany({
      where: eq(mealPreferenceNotes.userId, ctx.userId),
      orderBy: (notes, { desc }) => [desc(notes.createdAt)],
    });
  }),

  addNote: protectedProcedure
    .input(addNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(mealPreferenceNotes)
        .values({
          userId: ctx.userId,
          noteType: input.noteType,
          content: input.content,
        })
        .returning();
      return created;
    }),

  updateNote: protectedProcedure
    .input(updateNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.content !== undefined) {
        updateData.content = input.content;
      }
      if (input.isActive !== undefined) {
        updateData.isActive = input.isActive;
      }

      const [updated] = await ctx.db
        .update(mealPreferenceNotes)
        .set(updateData)
        .where(
          and(
            eq(mealPreferenceNotes.id, input.id),
            eq(mealPreferenceNotes.userId, ctx.userId)
          )
        )
        .returning();
      return updated;
    }),

  deleteNote: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(mealPreferenceNotes)
        .where(
          and(
            eq(mealPreferenceNotes.id, input),
            eq(mealPreferenceNotes.userId, ctx.userId)
          )
        );
      return { success: true };
    }),

  // ============================================
  // Export All Preferences (for skill consumption)
  // ============================================

  exportAll: protectedProcedure.query(async ({ ctx }) => {
    const [prefs, ingredients, notes] = await Promise.all([
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
    ]);

    return {
      preferences: {
        cuisinePreferences: prefs?.cuisinePreferences ?? {},
        dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
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
    };
  }),
});
