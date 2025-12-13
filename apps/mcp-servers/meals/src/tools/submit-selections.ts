import { tool } from '@anthropic-ai/claude-agent-sdk';
import {
  submitSelectionsInputSchema,
  type SubmitSelectionsResult,
  type MealSuggestion,
  type RecipeData,
  type MealType,
} from '../types.js';
import type { RecipeLookupService } from '../services/recipe-lookup.js';

/**
 * Create the submit_selections MCP tool
 *
 * This tool allows Claude to submit final meal selections.
 * It validates recipe IDs, looks up full recipe data, and returns
 * structured MealSuggestion objects.
 */
export function createSubmitSelectionsTool(recipeLookup: RecipeLookupService) {
  return tool(
    'submit_selections',
    'Submit your final meal selections. Call this after using query_recipes to find suitable recipes. Provide recipe IDs, dates, meal types, and a brief reasoning for your choices.',
    submitSelectionsInputSchema.shape,
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      const { selections, reasoning } = args;

      const suggestions: MealSuggestion[] = [];
      const errors: string[] = [];
      const missingIds: string[] = [];

      for (const selection of selections) {
        const recipe = recipeLookup.getById(selection.id);

        if (!recipe) {
          missingIds.push(selection.id);
          errors.push(`Recipe not found: ${selection.id}`);
          continue;
        }

        // Transform FullRecipe to RecipeData (matching the shared schema)
        const recipeData: RecipeData = {
          name: recipe.name,
          description: '', // Not stored in history
          source: recipe.source,
          sourceUrl: recipe.sourceUrl ?? undefined,
          cuisine: recipe.cuisine,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
          effort: recipe.effort,
          defaultServings: recipe.defaultServings,
          servingsUnit: recipe.servingsUnit,
          ingredients: recipe.ingredients.map((ing) => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            category: ing.category,
          })),
          instructions: recipe.instructions,
          tags: recipe.tags,
          nutrition: recipe.nutrition ?? null,
        };

        suggestions.push({
          date: selection.date,
          mealType: selection.mealType as MealType,
          recipe: recipeData,
        });
      }

      const result: SubmitSelectionsResult = {
        success: missingIds.length === 0 && suggestions.length > 0,
        suggestions,
        reasoning,
        errors: errors.length > 0 ? errors : undefined,
      };

      // Log for debugging
      if (missingIds.length > 0) {
        console.warn('[SubmitSelections] Missing recipe IDs:', missingIds);
      }
      console.log(
        '[SubmitSelections] Submitted',
        suggestions.length,
        'selections'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
