// Server
export {
  createMealsMcpServer,
  type MealsMcpServerConfig,
  type MealsMcpServerResult,
} from './server.js';

// Types
export type {
  // Full recipe from history.json
  FullRecipe,
  // Query tool types
  QueryRecipesInput,
  RecipeSummary,
  RecipeStats,
  QueryRecipesResult,
  // Submit tool types
  MealType,
  Selection,
  SubmitSelectionsInput,
  RecipeIngredient,
  RecipeData,
  MealSuggestion,
  SubmitSelectionsResult,
} from './types.js';

// Schemas (for validation)
export {
  queryRecipesInputSchema,
  submitSelectionsInputSchema,
  selectionSchema,
  mealTypeSchema,
} from './types.js';

// Services (for testing/direct use)
export { RecipeLookupService } from './services/recipe-lookup.js';
