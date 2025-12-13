/**
 * Skill Input Builder
 *
 * Builds the SkillInput object for the meal suggestions service.
 * Consolidated from duplicated code across suggestions.router.ts and meals.router.ts.
 */

import { eq, and, gte, desc } from 'drizzle-orm';
import type { DB } from '../../../db';
import {
  mealPreferences,
  ingredientPreferences,
  mealPreferenceNotes,
  acceptedMeals,
} from '../../../db/schema';
import { getCurrentSeason } from '../../../services/meal-suggestions';
import type { SkillInput } from '@honeydo/shared';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface BuildSkillInputOptions {
  userId: string;
  dateRange: { start: string; end: string };
  mealTypes: MealType[];
  suggestionsCount?: number;
  additionalNotes?: Array<{ type: 'general' | 'avoid' | 'include' | 'rule'; content: string }>;
  /**
   * Additional meals to include in recentMeals (e.g., existing suggestions to avoid)
   */
  additionalRecentMeals?: Array<{
    date: string;
    mealType: string;
    recipeName: string;
    cuisine: string;
  }>;
}

/**
 * Build the SkillInput object for the meal suggestions service.
 *
 * This function:
 * 1. Fetches user preferences, ingredient preferences, notes, and recent meals
 * 2. Combines them into a SkillInput object for Claude
 *
 * @param db - Drizzle database instance
 * @param options - Options for building the skill input
 * @returns SkillInput object ready to pass to mealSuggestionsService
 */
export async function buildSkillInput(
  db: DB,
  options: BuildSkillInputOptions
): Promise<SkillInput> {
  const {
    userId,
    dateRange,
    mealTypes,
    suggestionsCount = 7,
    additionalNotes = [],
    additionalRecentMeals = [],
  } = options;

  // Fetch all user preferences in parallel
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
    // Get recent meals from the last 14 days to avoid repetition
    db.query.acceptedMeals.findMany({
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

  // Build the notes array
  const notesArray = [
    ...notes.map((n) => ({
      type: n.noteType,
      content: n.content,
    })),
    ...additionalNotes,
  ];

  // Build the recent meals array
  const recentMeals = [
    ...recentMealsData.map((m) => ({
      date: m.date,
      mealType: m.mealType,
      recipeName: m.recipeName,
      cuisine: (m.recipeData as { cuisine?: string })?.cuisine ?? 'Unknown',
    })),
    ...additionalRecentMeals,
  ];

  return {
    dateRange,
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
