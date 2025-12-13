/**
 * Recipe Data Service
 *
 * Single source of truth for recipe data access from history.json.
 * Consolidates recipe lookup, search, and CRUD operations.
 *
 * This service replaces the scattered recipe data access in:
 * - meal-suggestions.ts (recipe lookup)
 * - recipe-history.ts (archive operations)
 * - history.router.ts (CRUD operations)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { normalizeString } from '@honeydo/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Path Configuration
// ============================================

// Navigate to monorepo root (from apps/api/src/services)
const MONOREPO_ROOT = join(__dirname, '..', '..', '..', '..');
const HISTORY_PATH = join(MONOREPO_ROOT, 'data', 'recipes', 'history.json');

// ============================================
// Types
// ============================================

/**
 * Ingredient in a recipe
 */
export interface RecipeIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  preparation?: string;
  optional?: boolean;
}

/**
 * Full recipe type from history.json
 */
export interface HistoryRecipe {
  id: string;
  name: string;
  source: string;
  sourceUrl: string | null;
  cuisine: string;
  diet?: 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore' | null;
  proteinSources?: string[];
  allergens?: string[];
  macroProfile?: 'protein-heavy' | 'carb-heavy' | 'balanced' | 'light' | null;
  mealTypes: string[];
  seasonality?: string[] | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  rating: number | null;
  timesMade: number;
  lastMade: string | null;
  notes?: string | string[];
}

/**
 * Recipe history file structure
 */
export interface RecipeHistory {
  recipes: HistoryRecipe[];
  metadata: {
    lastUpdated: string;
    totalRecipes: number;
  };
}

/**
 * Search/filter options
 */
export interface RecipeSearchOptions {
  search?: string;
  cuisine?: string;
  diet?: string;
  maxEffort?: number;
  maxTime?: number;
  mealType?: string;
  sortBy?: 'name' | 'lastMade' | 'rating' | 'timesMade' | 'effort' | 'totalTime';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

// ============================================
// Zod Schemas for Validation
// ============================================

export const recipeIngredientSchema = z.object({
  name: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  category: z.string(),
  preparation: z.string().optional(),
  optional: z.boolean().optional(),
});

export const historyRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  cuisine: z.string(),
  diet: z.enum(['vegan', 'vegetarian', 'pescatarian', 'omnivore']).nullable().optional(),
  proteinSources: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  macroProfile: z.enum(['protein-heavy', 'carb-heavy', 'balanced', 'light']).nullable().optional(),
  mealTypes: z.array(z.string()),
  seasonality: z.array(z.string()).nullable().optional(),
  prepTimeMinutes: z.number(),
  cookTimeMinutes: z.number(),
  totalTimeMinutes: z.number(),
  effort: z.number().min(1).max(5),
  defaultServings: z.number(),
  servingsUnit: z.string(),
  ingredients: z.array(recipeIngredientSchema),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  rating: z.number().min(1).max(5).nullable(),
  timesMade: z.number(),
  lastMade: z.string().nullable(),
  notes: z.union([z.string(), z.array(z.string())]).optional(),
});

export const recipeHistorySchema = z.object({
  recipes: z.array(historyRecipeSchema),
  metadata: z.object({
    lastUpdated: z.string(),
    totalRecipes: z.number(),
  }),
});

// ============================================
// Recipe Data Service
// ============================================

export class RecipeDataService {
  private cache: RecipeHistory | null = null;
  private cacheTime: number = 0;
  private readonly cacheTtlMs: number = 30000; // 30 seconds

  // In-memory index for fast ID lookups
  private indexById: Map<string, HistoryRecipe> = new Map();
  private indexByName: Map<string, HistoryRecipe> = new Map();

  /**
   * Get the history file path
   */
  getHistoryPath(): string {
    return HISTORY_PATH;
  }

  /**
   * Check if history file exists
   */
  historyExists(): boolean {
    return existsSync(HISTORY_PATH);
  }

  /**
   * Load recipe history from disk (with caching)
   */
  async load(forceReload = false): Promise<RecipeHistory> {
    const now = Date.now();

    // Return cached data if still valid
    if (!forceReload && this.cache && now - this.cacheTime < this.cacheTtlMs) {
      return this.cache;
    }

    try {
      const content = await readFile(HISTORY_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = recipeHistorySchema.parse(parsed);

      this.cache = validated;
      this.cacheTime = now;
      this.rebuildIndexes();

      return validated;
    } catch (error) {
      // Return empty history if file doesn't exist or is invalid
      const empty: RecipeHistory = {
        recipes: [],
        metadata: {
          lastUpdated: new Date().toISOString().split('T')[0],
          totalRecipes: 0,
        },
      };

      this.cache = empty;
      this.cacheTime = now;
      this.indexById.clear();
      this.indexByName.clear();

      return empty;
    }
  }

  /**
   * Load recipes synchronously (for performance-critical paths)
   * Uses cached data if available, otherwise loads from disk
   */
  loadSync(): RecipeHistory {
    const now = Date.now();

    // Return cached data if still valid
    if (this.cache && now - this.cacheTime < this.cacheTtlMs) {
      return this.cache;
    }

    try {
      const content = readFileSync(HISTORY_PATH, 'utf-8');
      const parsed = JSON.parse(content);

      this.cache = parsed as RecipeHistory;
      this.cacheTime = now;
      this.rebuildIndexes();

      return this.cache;
    } catch {
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
   * Save recipe history to disk
   */
  async save(history: RecipeHistory): Promise<void> {
    // Ensure directory exists
    const dir = dirname(HISTORY_PATH);
    await mkdir(dir, { recursive: true });

    // Update metadata
    history.metadata = {
      lastUpdated: new Date().toISOString().split('T')[0],
      totalRecipes: history.recipes.length,
    };

    await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');

    // Update cache
    this.cache = history;
    this.cacheTime = Date.now();
    this.rebuildIndexes();
  }

  /**
   * Rebuild in-memory indexes
   */
  private rebuildIndexes(): void {
    this.indexById.clear();
    this.indexByName.clear();

    if (!this.cache) return;

    for (const recipe of this.cache.recipes) {
      this.indexById.set(recipe.id, recipe);
      this.indexByName.set(normalizeString(recipe.name), recipe);
    }
  }

  /**
   * Invalidate cache (force reload on next access)
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Get recipe by ID
   */
  async getById(id: string): Promise<HistoryRecipe | null> {
    await this.load();
    return this.indexById.get(id) ?? null;
  }

  /**
   * Get recipe by ID (sync version for performance-critical paths)
   */
  getByIdSync(id: string): HistoryRecipe | null {
    this.loadSync();
    return this.indexById.get(id) ?? null;
  }

  /**
   * Get recipe by name (case-insensitive)
   */
  async getByName(name: string): Promise<HistoryRecipe | null> {
    await this.load();
    return this.indexByName.get(normalizeString(name)) ?? null;
  }

  /**
   * Get all recipes (with optional filtering and sorting)
   */
  async getAll(options: RecipeSearchOptions = {}): Promise<HistoryRecipe[]> {
    const history = await this.load();
    let recipes = [...history.recipes];

    // Apply search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          r.source.toLowerCase().includes(searchLower) ||
          r.cuisine.toLowerCase().includes(searchLower) ||
          r.tags.some((t) => t.toLowerCase().includes(searchLower))
      );
    }

    // Apply cuisine filter
    if (options.cuisine) {
      const cuisineLower = options.cuisine.toLowerCase();
      recipes = recipes.filter((r) => r.cuisine.toLowerCase() === cuisineLower);
    }

    // Apply diet filter
    if (options.diet) {
      const dietLower = options.diet.toLowerCase();
      recipes = recipes.filter((r) => r.diet?.toLowerCase() === dietLower);
    }

    // Apply max effort filter
    if (options.maxEffort !== undefined) {
      recipes = recipes.filter((r) => r.effort <= options.maxEffort!);
    }

    // Apply max time filter
    if (options.maxTime !== undefined) {
      recipes = recipes.filter((r) => r.totalTimeMinutes <= options.maxTime!);
    }

    // Apply meal type filter
    if (options.mealType) {
      const mealTypeLower = options.mealType.toLowerCase();
      recipes = recipes.filter((r) =>
        r.mealTypes.some((mt) => mt.toLowerCase() === mealTypeLower)
      );
    }

    // Apply sorting
    const sortBy = options.sortBy ?? 'name';
    const sortOrder = options.sortOrder ?? 'asc';

    recipes.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'lastMade':
          comparison = (a.lastMade ?? '').localeCompare(b.lastMade ?? '');
          break;
        case 'rating':
          comparison = (a.rating ?? 0) - (b.rating ?? 0);
          break;
        case 'timesMade':
          comparison = a.timesMade - b.timesMade;
          break;
        case 'effort':
          comparison = a.effort - b.effort;
          break;
        case 'totalTime':
          comparison = a.totalTimeMinutes - b.totalTimeMinutes;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply limit
    if (options.limit !== undefined) {
      recipes = recipes.slice(0, options.limit);
    }

    return recipes;
  }

  /**
   * Get unique cuisines from history
   */
  async getCuisines(): Promise<string[]> {
    const history = await this.load();
    const cuisineSet = new Set(history.recipes.map((r) => r.cuisine));
    return Array.from(cuisineSet).sort();
  }

  /**
   * Get recipe count
   */
  async getCount(): Promise<number> {
    const history = await this.load();
    return history.recipes.length;
  }

  /**
   * Get stats about the recipe collection
   */
  async getStats(): Promise<{
    totalRecipes: number;
    recipesMade: number;
    topRated: HistoryRecipe[];
    mostMade: HistoryRecipe[];
    cuisineCounts: Record<string, number>;
  }> {
    const history = await this.load();

    const recipesMade = history.recipes.filter((r) => r.timesMade > 0).length;

    const topRated = [...history.recipes]
      .filter((r) => r.rating !== null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5);

    const mostMade = [...history.recipes]
      .filter((r) => r.timesMade > 0)
      .sort((a, b) => b.timesMade - a.timesMade)
      .slice(0, 5);

    const cuisineCounts: Record<string, number> = {};
    for (const recipe of history.recipes) {
      cuisineCounts[recipe.cuisine] = (cuisineCounts[recipe.cuisine] ?? 0) + 1;
    }

    return {
      totalRecipes: history.recipes.length,
      recipesMade,
      topRated,
      mostMade,
      cuisineCounts,
    };
  }

  // ============================================
  // Mutation Methods
  // ============================================

  /**
   * Add or update a recipe
   */
  async upsert(recipe: HistoryRecipe): Promise<HistoryRecipe> {
    const history = await this.load(true);
    const existingIndex = history.recipes.findIndex((r) => r.id === recipe.id);

    if (existingIndex >= 0) {
      history.recipes[existingIndex] = recipe;
    } else {
      history.recipes.push(recipe);
    }

    await this.save(history);
    return recipe;
  }

  /**
   * Update a recipe by ID
   */
  async update(
    id: string,
    updates: Partial<Omit<HistoryRecipe, 'id'>>
  ): Promise<HistoryRecipe | null> {
    const history = await this.load(true);
    const index = history.recipes.findIndex((r) => r.id === id);

    if (index === -1) {
      return null;
    }

    const updated = { ...history.recipes[index], ...updates };
    history.recipes[index] = updated;
    await this.save(history);

    return updated;
  }

  /**
   * Delete a recipe by ID
   */
  async delete(id: string): Promise<HistoryRecipe | null> {
    const history = await this.load(true);
    const index = history.recipes.findIndex((r) => r.id === id);

    if (index === -1) {
      return null;
    }

    const [deleted] = history.recipes.splice(index, 1);
    await this.save(history);

    return deleted;
  }

  /**
   * Record that a recipe was made
   */
  async recordMade(id: string, date?: string, rating?: number): Promise<HistoryRecipe | null> {
    const history = await this.load(true);
    const recipe = history.recipes.find((r) => r.id === id);

    if (!recipe) {
      return null;
    }

    recipe.timesMade = (recipe.timesMade ?? 0) + 1;
    recipe.lastMade = date ?? new Date().toISOString().split('T')[0];

    if (rating !== undefined) {
      recipe.rating = rating;
    }

    await this.save(history);
    return recipe;
  }

  /**
   * Add a note to a recipe
   */
  async addNote(id: string, note: string): Promise<HistoryRecipe | null> {
    const history = await this.load(true);
    const recipe = history.recipes.find((r) => r.id === id);

    if (!recipe) {
      return null;
    }

    // Normalize notes to array format
    const existingNotes = Array.isArray(recipe.notes)
      ? recipe.notes
      : recipe.notes
        ? [recipe.notes]
        : [];

    if (!existingNotes.includes(note)) {
      recipe.notes = [...existingNotes, note];
    }

    await this.save(history);
    return recipe;
  }
}

// ============================================
// Singleton Instance
// ============================================

let instance: RecipeDataService | null = null;

export function getRecipeDataService(): RecipeDataService {
  if (!instance) {
    instance = new RecipeDataService();
  }
  return instance;
}

// Export for backwards compatibility
export const recipeDataService = getRecipeDataService();
