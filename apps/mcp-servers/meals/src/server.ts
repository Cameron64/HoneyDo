import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { RecipeLookupService } from './services/recipe-lookup.js';
import { createQueryRecipesTool } from './tools/query-recipes.js';
import { createSubmitSelectionsTool } from './tools/submit-selections.js';

export interface MealsMcpServerConfig {
  /**
   * Path to the recipes history JSON file
   * Default: data/recipes/history.json relative to cwd
   */
  recipesHistoryPath: string;
}

export interface MealsMcpServerResult {
  /**
   * The MCP server instance to pass to Claude SDK
   */
  server: ReturnType<typeof createSdkMcpServer>;

  /**
   * Reload recipes from disk (useful for hot-reload)
   */
  reloadRecipes: () => void;

  /**
   * Get the recipe lookup service (for testing/debugging)
   */
  getRecipeLookup: () => RecipeLookupService;
}

/**
 * Create the HoneyDo Meals MCP server
 *
 * This server provides two tools:
 * - query_recipes: Search and filter the recipe database
 * - submit_selections: Submit final meal selections with recipe IDs
 *
 * @example
 * ```typescript
 * const { server, reloadRecipes } = createMealsMcpServer({
 *   recipesHistoryPath: './data/recipes/history.json',
 * });
 *
 * // Pass to Claude SDK
 * const result = await session.runQuery({
 *   prompt: '...',
 *   mcpServers: { 'honeydo-meals': server },
 * });
 * ```
 */
export function createMealsMcpServer(
  config: MealsMcpServerConfig
): MealsMcpServerResult {
  // Create recipe lookup service
  const recipeLookup = new RecipeLookupService(config.recipesHistoryPath);
  recipeLookup.load();

  // Create tools
  const queryRecipesTool = createQueryRecipesTool(recipeLookup);
  const submitSelectionsTool = createSubmitSelectionsTool(recipeLookup);

  // Create MCP server
  const server = createSdkMcpServer({
    name: 'honeydo-meals',
    version: '1.0.0',
    tools: [queryRecipesTool, submitSelectionsTool],
  });

  console.log('[MealsMcpServer] Created with', recipeLookup.getAllIds().length, 'recipes');

  return {
    server,
    reloadRecipes: () => recipeLookup.reload(),
    getRecipeLookup: () => recipeLookup,
  };
}
