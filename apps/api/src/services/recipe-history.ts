/**
 * Recipe History Service
 *
 * Manages the recipe history file (data/recipes/history.json)
 * Used by the wizard to archive completed/discarded meals
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RecipeData, AcceptedMealRow } from '../db/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Types
// ============================================

export interface RecipeHistoryEntry {
  name: string;
  source: string;
  sourceUrl: string | null;
  cuisine: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: Array<{
    name: string;
    amount: number | null; // Allow null for "to taste" ingredients
    unit: string | null;
    category: string;
    preparation?: string;
    optional?: boolean;
  }>;
  instructions: string[];
  tags: string[];
  rating: number | null;
  timesMade: number;
  lastMade: string | null; // YYYY-MM-DD
  notes?: string | string[]; // Can be string (legacy) or array
}

export interface RecipeHistory {
  recipes: RecipeHistoryEntry[];
  metadata?: {
    lastUpdated: string;
    totalRecipes: number;
  };
}

// ============================================
// Path Configuration
// ============================================

// Navigate to monorepo root (2 levels up from apps/api)
const MONOREPO_ROOT = join(__dirname, '..', '..', '..', '..');
const HISTORY_PATH = join(MONOREPO_ROOT, 'data', 'recipes', 'history.json');

// ============================================
// Core Functions
// ============================================

/**
 * Load the recipe history from disk
 */
export async function loadHistory(): Promise<RecipeHistory> {
  try {
    const content = await readFile(HISTORY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Return empty history if file doesn't exist or is invalid
    return {
      recipes: [],
      metadata: {
        lastUpdated: new Date().toISOString().split('T')[0],
        totalRecipes: 0,
      },
    };
  }
}

/**
 * Save the recipe history to disk
 */
export async function saveHistory(history: RecipeHistory): Promise<void> {
  // Update metadata
  history.metadata = {
    lastUpdated: new Date().toISOString().split('T')[0],
    totalRecipes: history.recipes.length,
  };

  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/**
 * Normalize a recipe name for comparison
 */
function normalizeRecipeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Find an existing recipe by name (case-insensitive)
 */
function findRecipeByName(
  history: RecipeHistory,
  name: string
): { index: number; recipe: RecipeHistoryEntry } | null {
  const normalizedName = normalizeRecipeName(name);
  const index = history.recipes.findIndex(
    (r) => normalizeRecipeName(r.name) === normalizedName
  );

  if (index >= 0) {
    return { index, recipe: history.recipes[index] };
  }
  return null;
}

/**
 * Convert notes to array format (handling legacy string format)
 */
function ensureNotesArray(notes: string | string[] | undefined): string[] {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes;
  return [notes];
}

// ============================================
// Archive Functions
// ============================================

export type ArchiveDisposition = 'completed' | 'discard';

export interface ArchiveMealInput {
  meal: AcceptedMealRow;
  disposition: ArchiveDisposition;
}

/**
 * Archive a meal to recipe history
 *
 * - For 'completed' meals: increments timesMade and updates lastMade
 * - For 'discard' meals: just adds to history if new (for discovery purposes)
 * - Updates rating if provided
 * - Adds user notes if provided
 */
export async function archiveMealToHistory(
  input: ArchiveMealInput
): Promise<void> {
  const { meal, disposition } = input;
  const history = await loadHistory();

  // Find existing recipe by name
  const existing = findRecipeByName(history, meal.recipeName);

  if (existing) {
    // Update existing entry
    const recipe = existing.recipe;

    if (disposition === 'completed') {
      recipe.timesMade = (recipe.timesMade || 0) + 1;
      recipe.lastMade = meal.date;
    }

    // Update rating if provided and better than current
    if (meal.rating && (!recipe.rating || meal.rating > recipe.rating)) {
      recipe.rating = meal.rating;
    }

    // Add user notes if provided
    if (meal.userNotes) {
      const existingNotes = ensureNotesArray(recipe.notes);
      if (!existingNotes.includes(meal.userNotes)) {
        recipe.notes = [...existingNotes, meal.userNotes];
      }
    }

    history.recipes[existing.index] = recipe;
  } else {
    // Add new entry from meal's recipeData
    const recipeData = meal.recipeData as RecipeData;
    const newEntry: RecipeHistoryEntry = {
      name: meal.recipeName,
      source: recipeData.source || 'Unknown',
      sourceUrl: recipeData.sourceUrl || null,
      cuisine: recipeData.cuisine || 'Unknown',
      prepTimeMinutes: recipeData.prepTimeMinutes || 0,
      cookTimeMinutes: recipeData.cookTimeMinutes || 0,
      totalTimeMinutes: recipeData.totalTimeMinutes || 0,
      effort: recipeData.effort || 3,
      defaultServings: recipeData.defaultServings || 4,
      servingsUnit: recipeData.servingsUnit || 'servings',
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || [],
      tags: recipeData.tags || [],
      rating: meal.rating || null,
      timesMade: disposition === 'completed' ? 1 : 0,
      lastMade: disposition === 'completed' ? meal.date : null,
      notes: meal.userNotes ? [meal.userNotes] : undefined,
    };
    history.recipes.push(newEntry);
  }

  await saveHistory(history);
}

/**
 * Batch archive multiple meals to history
 * More efficient than calling archiveMealToHistory for each meal
 */
export async function batchArchiveMealsToHistory(
  inputs: ArchiveMealInput[]
): Promise<{ archived: number; errors: string[] }> {
  if (inputs.length === 0) {
    return { archived: 0, errors: [] };
  }

  const history = await loadHistory();
  const errors: string[] = [];
  let archived = 0;

  for (const { meal, disposition } of inputs) {
    try {
      const existing = findRecipeByName(history, meal.recipeName);

      if (existing) {
        const recipe = existing.recipe;

        if (disposition === 'completed') {
          recipe.timesMade = (recipe.timesMade || 0) + 1;
          recipe.lastMade = meal.date;
        }

        if (meal.rating && (!recipe.rating || meal.rating > recipe.rating)) {
          recipe.rating = meal.rating;
        }

        if (meal.userNotes) {
          const existingNotes = ensureNotesArray(recipe.notes);
          if (!existingNotes.includes(meal.userNotes)) {
            recipe.notes = [...existingNotes, meal.userNotes];
          }
        }

        history.recipes[existing.index] = recipe;
      } else {
        const recipeData = meal.recipeData as RecipeData;
        history.recipes.push({
          name: meal.recipeName,
          source: recipeData.source || 'Unknown',
          sourceUrl: recipeData.sourceUrl || null,
          cuisine: recipeData.cuisine || 'Unknown',
          prepTimeMinutes: recipeData.prepTimeMinutes || 0,
          cookTimeMinutes: recipeData.cookTimeMinutes || 0,
          totalTimeMinutes: recipeData.totalTimeMinutes || 0,
          effort: recipeData.effort || 3,
          defaultServings: recipeData.defaultServings || 4,
          servingsUnit: recipeData.servingsUnit || 'servings',
          ingredients: recipeData.ingredients || [],
          instructions: recipeData.instructions || [],
          tags: recipeData.tags || [],
          rating: meal.rating || null,
          timesMade: disposition === 'completed' ? 1 : 0,
          lastMade: disposition === 'completed' ? meal.date : null,
          notes: meal.userNotes ? [meal.userNotes] : undefined,
        });
      }
      archived++;
    } catch (error) {
      errors.push(
        `Failed to archive "${meal.recipeName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await saveHistory(history);
  return { archived, errors };
}

/**
 * Get recipe history stats
 */
export async function getHistoryStats(): Promise<{
  totalRecipes: number;
  recipesMade: number;
  topRated: RecipeHistoryEntry[];
  mostMade: RecipeHistoryEntry[];
}> {
  const history = await loadHistory();

  const recipesMade = history.recipes.filter((r) => r.timesMade > 0).length;

  const topRated = [...history.recipes]
    .filter((r) => r.rating !== null)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  const mostMade = [...history.recipes]
    .filter((r) => r.timesMade > 0)
    .sort((a, b) => b.timesMade - a.timesMade)
    .slice(0, 5);

  return {
    totalRecipes: history.recipes.length,
    recipesMade,
    topRated,
    mostMade,
  };
}

export default {
  loadHistory,
  saveHistory,
  archiveMealToHistory,
  batchArchiveMealsToHistory,
  getHistoryStats,
};
