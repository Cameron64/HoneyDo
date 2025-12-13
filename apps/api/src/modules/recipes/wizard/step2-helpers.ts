/**
 * Step 2 Helper Functions
 *
 * Shared utilities for building skill inputs for meal suggestions.
 */

import type { SkillInput } from '@honeydo/shared';
import {
  mealPreferences,
  ingredientPreferences,
  mealPreferenceNotes,
  acceptedMeals,
  type MealSuggestionItem,
} from '../../../db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { getCurrentSeason } from '../../../services/meal-suggestions';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface BuildSkillInputOptions {
  db: typeof import('../../../db').db;
  userId: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  mealTypes: MealType[];
  suggestionsCount: number;
  /** Existing meals to avoid suggesting duplicates */
  existingMeals?: MealSuggestionItem[];
  /** Recipe names to exclude (e.g., manually picked recipes) */
  excludeRecipeNames?: string[];
}

/**
 * Build the SkillInput object for the meal suggestions service.
 * This fetches user preferences, ingredient preferences, notes, and recent meals.
 */
export async function buildSkillInput(
  options: BuildSkillInputOptions
): Promise<SkillInput> {
  const {
    db,
    userId,
    dateRangeStart,
    dateRangeEnd,
    mealTypes,
    suggestionsCount,
    existingMeals,
    excludeRecipeNames,
  } = options;

  const [prefs, ingredients, notes, recentMealsData] = await Promise.all([
    db.query.mealPreferences.findFirst({
      where: eq(mealPreferences.userId, userId),
    }),
    db.query.ingredientPreferences.findMany({
      where: eq(ingredientPreferences.userId, userId),
    }),
    db.query.mealPreferenceNotes.findMany({
      where: and(
        eq(mealPreferenceNotes.userId, userId),
        eq(mealPreferenceNotes.isActive, true)
      ),
    }),
    db.query.acceptedMeals.findMany({
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

  // Build notes array
  const notesArray = notes.map((n) => ({
    type: n.noteType,
    content: n.content,
  }));

  // Add duplicate avoidance note if we have existing meals
  if (existingMeals && existingMeals.length > 0) {
    notesArray.push({
      type: 'general' as const,
      content: `IMPORTANT: Avoid suggesting these recipes (already suggested): ${existingMeals.map((m) => m.recipe.name).join(', ')}`,
    });
  }

  // Add manual pick exclusion note if we have recipes to exclude
  if (excludeRecipeNames && excludeRecipeNames.length > 0) {
    notesArray.push({
      type: 'general' as const,
      content: `IMPORTANT: Do NOT suggest these recipes (user has already manually selected them): ${excludeRecipeNames.join(', ')}`,
    });
  }

  // Build recent meals array, including existing suggestions to avoid them
  const recentMeals = [
    ...recentMealsData.map((m) => ({
      date: m.date,
      mealType: m.mealType,
      recipeName: m.recipeName,
      cuisine: (m.recipeData as { cuisine?: string })?.cuisine ?? 'Unknown',
    })),
  ];

  if (existingMeals) {
    recentMeals.push(
      ...existingMeals.map((m) => ({
        date: m.date,
        mealType: m.mealType,
        recipeName: m.recipe.name,
        cuisine: m.recipe.cuisine,
      }))
    );
  }

  return {
    dateRange: {
      start: dateRangeStart,
      end: dateRangeEnd,
    },
    mealTypes,
    servings: prefs?.defaultServings ?? 4,
    suggestionsCount,
    recentMeals,
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
    notes: notesArray,
    context: {
      season: getCurrentSeason(),
      currentDate: new Date().toISOString().split('T')[0],
    },
  };
}
