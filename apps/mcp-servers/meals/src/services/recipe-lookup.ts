import { readFileSync, existsSync } from 'fs';
import type {
  FullRecipe,
  QueryRecipesInput,
  RecipeSummary,
  RecipeStats,
} from '../types.js';

// Diet hierarchy for filtering (lower = stricter)
const DIET_LEVELS: Record<string, number> = {
  vegan: 0,
  vegetarian: 1,
  pescatarian: 2,
  omnivore: 3,
};

export class RecipeLookupService {
  private recipesById: Map<string, FullRecipe> = new Map();
  private allRecipes: FullRecipe[] = [];
  private loaded = false;

  constructor(private historyPath: string) {}

  /**
   * Load recipes from JSON file into memory
   */
  load(): void {
    if (this.loaded) return;

    if (!existsSync(this.historyPath)) {
      console.warn('[RecipeLookup] Recipe history not found at:', this.historyPath);
      return;
    }

    try {
      const content = readFileSync(this.historyPath, 'utf-8');
      const history = JSON.parse(content) as { recipes: FullRecipe[] };

      this.recipesById.clear();
      this.allRecipes = history.recipes;

      for (const recipe of history.recipes) {
        this.recipesById.set(recipe.id, recipe);
      }

      this.loaded = true;
      console.log('[RecipeLookup] Loaded', this.recipesById.size, 'recipes');
    } catch (error) {
      console.error('[RecipeLookup] Failed to load recipes:', error);
    }
  }

  /**
   * Force reload recipes from disk
   */
  reload(): void {
    this.loaded = false;
    this.load();
  }

  /**
   * Get a single recipe by ID
   */
  getById(id: string): FullRecipe | undefined {
    if (!this.loaded) this.load();
    return this.recipesById.get(id);
  }

  /**
   * Get all recipe IDs
   */
  getAllIds(): string[] {
    if (!this.loaded) this.load();
    return Array.from(this.recipesById.keys());
  }

  /**
   * Get database statistics
   */
  getStats(): RecipeStats {
    if (!this.loaded) this.load();

    const stats: RecipeStats = {
      total: this.allRecipes.length,
      byCuisine: {},
      byDiet: {},
      byProtein: {},
      byAllergen: {},
      notMadeIn14Days: 0,
      neverMade: 0,
      avgPrepTime: 0,
      avgEffort: 0,
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14);

    let totalPrep = 0;
    let totalEffort = 0;

    for (const recipe of this.allRecipes) {
      // Cuisine
      stats.byCuisine[recipe.cuisine] = (stats.byCuisine[recipe.cuisine] || 0) + 1;

      // Diet
      stats.byDiet[recipe.diet] = (stats.byDiet[recipe.diet] || 0) + 1;

      // Proteins
      for (const p of recipe.proteinSources) {
        stats.byProtein[p] = (stats.byProtein[p] || 0) + 1;
      }

      // Allergens
      for (const a of recipe.allergens) {
        stats.byAllergen[a] = (stats.byAllergen[a] || 0) + 1;
      }

      // Time-based
      if (!recipe.lastMade || new Date(recipe.lastMade) < cutoffDate) {
        stats.notMadeIn14Days++;
      }
      if (recipe.timesMade === 0) {
        stats.neverMade++;
      }

      totalPrep += recipe.prepTimeMinutes;
      totalEffort += recipe.effort;
    }

    if (this.allRecipes.length > 0) {
      stats.avgPrepTime = Math.round(totalPrep / this.allRecipes.length);
      stats.avgEffort = Math.round((totalEffort / this.allRecipes.length) * 10) / 10;
    }

    return stats;
  }

  /**
   * Query recipes with filters
   */
  query(input: QueryRecipesInput): RecipeSummary[] {
    if (!this.loaded) this.load();

    let results = this.allRecipes.filter((recipe) => {
      // Cuisine filter (OR logic)
      if (input.cuisines && input.cuisines.length > 0) {
        const cuisineLower = recipe.cuisine.toLowerCase();
        const matchesCuisine = input.cuisines.some(
          (c) => c.toLowerCase() === cuisineLower
        );
        if (!matchesCuisine) return false;
      }

      // Diet filter (minimum level)
      if (input.diet) {
        const requiredLevel = DIET_LEVELS[input.diet];
        const recipeLevel = DIET_LEVELS[recipe.diet];
        if (recipeLevel > requiredLevel) return false;
      }

      // Protein filter (OR - has any of these)
      if (input.proteins && input.proteins.length > 0) {
        const recipeProteins = recipe.proteinSources.map((p) => p.toLowerCase());
        const hasAny = input.proteins.some((p) =>
          recipeProteins.includes(p.toLowerCase())
        );
        // If recipe has proteins, must match. If no proteins, could be veggie option
        if (!hasAny && recipe.proteinSources.length > 0) return false;
      }

      // Exclude proteins
      if (input.excludeProteins && input.excludeProteins.length > 0) {
        const recipeProteins = recipe.proteinSources.map((p) => p.toLowerCase());
        const hasExcluded = input.excludeProteins.some((p) =>
          recipeProteins.includes(p.toLowerCase())
        );
        if (hasExcluded) return false;
      }

      // Allergen-free filter
      if (input.allergenFree && input.allergenFree.length > 0) {
        const recipeAllergens = recipe.allergens.map((a) => a.toLowerCase());
        const hasAllergen = input.allergenFree.some((a) =>
          recipeAllergens.includes(a.toLowerCase())
        );
        if (hasAllergen) return false;
      }

      // Meal type filter (OR)
      if (input.mealTypes && input.mealTypes.length > 0) {
        const recipeMealTypes = recipe.mealTypes.map((m) => m.toLowerCase());
        const hasAny = input.mealTypes.some((m) =>
          recipeMealTypes.includes(m.toLowerCase())
        );
        if (!hasAny) return false;
      }

      // Season filter (includes year-round recipes)
      if (input.season) {
        if (
          recipe.seasonality !== null &&
          !recipe.seasonality.includes(input.season)
        ) {
          return false;
        }
      }

      // Macro profile filter
      if (input.macroProfile && recipe.macroProfile !== input.macroProfile) {
        return false;
      }

      // Max prep time
      if (input.maxPrepMinutes && recipe.prepTimeMinutes > input.maxPrepMinutes) {
        return false;
      }

      // Max cook time
      if (input.maxCookMinutes && recipe.cookTimeMinutes > input.maxCookMinutes) {
        return false;
      }

      // Max effort
      if (input.maxEffort && recipe.effort > input.maxEffort) {
        return false;
      }

      // Tags filter (AND - must have all)
      if (input.tags && input.tags.length > 0) {
        const recipeTags = recipe.tags.map((t) => t.toLowerCase());
        const hasAll = input.tags.every((t) =>
          recipeTags.includes(t.toLowerCase())
        );
        if (!hasAll) return false;
      }

      // Any-tags filter (OR - must have any)
      if (input.anyTags && input.anyTags.length > 0) {
        const recipeTags = recipe.tags.map((t) => t.toLowerCase());
        const hasAny = input.anyTags.some((t) =>
          recipeTags.includes(t.toLowerCase())
        );
        if (!hasAny) return false;
      }

      // Not made since N days
      if (input.notMadeSinceDays) {
        if (recipe.lastMade) {
          const lastMadeDate = new Date(recipe.lastMade);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - input.notMadeSinceDays);
          if (lastMadeDate > cutoffDate) return false;
        }
      }

      // Never made filter
      if (input.neverMade && recipe.timesMade > 0) {
        return false;
      }

      // Exclude specific IDs
      if (input.excludeIds && input.excludeIds.includes(recipe.id)) {
        return false;
      }

      return true;
    });

    // Random shuffle
    if (input.random) {
      results = this.shuffleArray(results);
    }

    // Apply limit
    const limit = input.limit ?? 10;
    results = results.slice(0, limit);

    // Convert to summaries
    return results.map((recipe) => this.toSummary(recipe));
  }

  /**
   * Convert full recipe to summary
   */
  private toSummary(recipe: FullRecipe): RecipeSummary {
    return {
      id: recipe.id,
      name: recipe.name,
      cuisine: recipe.cuisine,
      diet: recipe.diet,
      proteinSources: recipe.proteinSources,
      allergens: recipe.allergens,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
      effort: recipe.effort,
      tags: recipe.tags,
      timesMade: recipe.timesMade,
      lastMade: recipe.lastMade,
    };
  }

  /**
   * Fisher-Yates shuffle
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
