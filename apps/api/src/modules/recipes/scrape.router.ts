/**
 * Recipe Scrape Router
 *
 * Handles scraping recipes from URLs and saving them to the library.
 */

import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { scrapeUrlSchema, saveScrapedRecipeSchema } from '@honeydo/shared';
import { recipeScraperService } from '../../services/recipe-scraper';
import { getRecipeDataService, type HistoryRecipe } from '../../services/recipe-data';
import { nanoid } from 'nanoid';

export const scrapeRouter = router({
  /**
   * Scrape a recipe from a URL
   *
   * Returns structured recipe data that can be edited and saved
   */
  fromUrl: protectedProcedure
    .input(scrapeUrlSchema)
    .mutation(async ({ input }) => {
      try {
        const scrapedRecipe = await recipeScraperService.scrape(input.url);
        return scrapedRecipe;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to scrape recipe',
        });
      }
    }),

  /**
   * Save a scraped (and potentially edited) recipe to the library
   *
   * Creates a new recipe in history.json with a unique ID
   */
  saveToLibrary: protectedProcedure
    .input(saveScrapedRecipeSchema)
    .mutation(async ({ input }) => {
      const recipeDataService = getRecipeDataService();

      // Check for duplicate by name (case-insensitive)
      const existing = await recipeDataService.getByName(input.name);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A recipe named "${input.name}" already exists in your library`,
        });
      }

      // Build the full recipe object
      const newRecipe: HistoryRecipe = {
        id: `r_${nanoid(10)}`,
        name: input.name,
        source: input.source,
        sourceUrl: input.sourceUrl,
        cuisine: input.cuisine,
        diet: input.diet ?? null,
        proteinSources: input.proteinSources ?? [],
        allergens: input.allergens ?? [],
        macroProfile: input.macroProfile ?? null,
        mealTypes: input.mealTypes ?? ['dinner'],
        seasonality: input.seasonality ?? null,
        prepTimeMinutes: input.prepTimeMinutes,
        cookTimeMinutes: input.cookTimeMinutes,
        totalTimeMinutes: input.totalTimeMinutes,
        effort: input.effort,
        defaultServings: input.defaultServings,
        servingsUnit: input.servingsUnit ?? 'servings',
        ingredients: input.ingredients.map(ing => ({
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          category: ing.category,
        })),
        instructions: input.instructions,
        tags: input.tags ?? [],
        rating: null,
        timesMade: 0,
        lastMade: null,
      };

      // Save to library
      await recipeDataService.upsert(newRecipe);

      return {
        success: true,
        recipe: newRecipe,
      };
    }),

  /**
   * Get available cuisines for the dropdown
   */
  getCuisines: protectedProcedure.query(async () => {
    const recipeDataService = getRecipeDataService();
    return recipeDataService.getCuisines();
  }),
});
