import { tool } from '@anthropic-ai/claude-agent-sdk';
import { queryRecipesInputSchema, type QueryRecipesResult } from '../types.js';
import type { RecipeLookupService } from '../services/recipe-lookup.js';

/**
 * Create the query_recipes MCP tool
 *
 * This tool allows Claude to search and filter the recipe database
 * with various criteria like cuisine, allergens, prep time, etc.
 */
export function createQueryRecipesTool(recipeLookup: RecipeLookupService) {
  return tool(
    'query_recipes',
    'Search and filter the recipe database. Use this to find suitable recipes based on criteria like cuisine, allergens, prep time, effort level, etc. Returns recipe summaries with IDs that can be used with submit_selections.',
    queryRecipesInputSchema.shape,
    async (args): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      // Handle stats request
      if (args.getStats) {
        const stats = recipeLookup.getStats();
        const result: QueryRecipesResult = {
          stats,
          count: stats.total,
          message: `Database has ${stats.total} recipes. ${stats.notMadeIn14Days} not made in 14 days, ${stats.neverMade} never made.`,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Query recipes with filters
      const recipes = recipeLookup.query(args);

      const result: QueryRecipesResult = {
        recipes,
        count: recipes.length,
        message:
          recipes.length > 0
            ? `Found ${recipes.length} recipes matching your criteria.`
            : 'No recipes found matching your criteria. Try relaxing some filters.',
      };

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
