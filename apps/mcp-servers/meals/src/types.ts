import { z } from 'zod';

// ============================================================================
// Full Recipe (matches data/recipes/history.json structure)
// ============================================================================

// Nutrition data (per serving)
export interface RecipeNutrition {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  saturatedFat?: number | null;
  cholesterol?: number | null;
  servingSize?: string | null;
}

export interface FullRecipe {
  id: string;
  name: string;
  source: string;
  sourceUrl: string | null;
  cuisine: string;
  diet: 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';
  proteinSources: string[];
  allergens: string[];
  macroProfile: 'protein-heavy' | 'carb-heavy' | 'balanced' | 'light';
  mealTypes: string[];
  seasonality: string[] | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: Array<{
    name: string;
    amount: number | null;
    unit: string | null;
    category: string;
  }>;
  instructions: string[];
  tags: string[];
  rating: number | null;
  timesMade: number;
  lastMade: string | null;
  nutrition?: RecipeNutrition | null;
}

// ============================================================================
// Query Recipes Tool
// ============================================================================

export const queryRecipesInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(10)
    .describe('Maximum number of results to return (default 10, max 50)'),
  random: z.boolean().optional().default(false)
    .describe('Shuffle results for variety'),
  notMadeSinceDays: z.number().int().min(1).optional()
    .describe('Exclude recipes made within the last N days'),
  neverMade: z.boolean().optional()
    .describe('Only return recipes that have never been made'),
  cuisines: z.array(z.string()).optional()
    .describe('Filter by cuisines (OR logic) - e.g., ["Mexican", "Italian"]'),
  diet: z.enum(['vegan', 'vegetarian', 'pescatarian', 'omnivore']).optional()
    .describe('Minimum diet level - filters to this level or stricter'),
  proteins: z.array(z.string()).optional()
    .describe('Must have any of these protein sources (OR logic)'),
  excludeProteins: z.array(z.string()).optional()
    .describe('Exclude recipes with these protein sources'),
  allergenFree: z.array(z.string()).optional()
    .describe('Must NOT contain these allergens (e.g., ["dairy", "gluten", "nuts"])'),
  mealTypes: z.array(z.string()).optional()
    .describe('Filter by meal types (OR logic) - e.g., ["dinner", "lunch"]'),
  season: z.enum(['spring', 'summer', 'fall', 'winter']).optional()
    .describe('Filter by season (includes year-round recipes)'),
  macroProfile: z.enum(['protein-heavy', 'carb-heavy', 'balanced', 'light']).optional()
    .describe('Filter by macro profile'),
  maxPrepMinutes: z.number().int().min(1).optional()
    .describe('Maximum prep time in minutes'),
  maxCookMinutes: z.number().int().min(1).optional()
    .describe('Maximum cook time in minutes'),
  maxEffort: z.number().int().min(1).max(5).optional()
    .describe('Maximum effort level (1-5 scale)'),
  tags: z.array(z.string()).optional()
    .describe('Must have ALL of these tags (AND logic)'),
  anyTags: z.array(z.string()).optional()
    .describe('Must have ANY of these tags (OR logic)'),
  excludeIds: z.array(z.string()).optional()
    .describe('Exclude specific recipe IDs'),
  getStats: z.boolean().optional()
    .describe('Return database statistics instead of recipes'),
});

export type QueryRecipesInput = z.infer<typeof queryRecipesInputSchema>;

// Recipe summary returned by query (not full recipe data)
export interface RecipeSummary {
  id: string;
  name: string;
  cuisine: string;
  diet: string;
  proteinSources: string[];
  allergens: string[];
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  tags: string[];
  timesMade: number;
  lastMade: string | null;
}

export interface RecipeStats {
  total: number;
  byCuisine: Record<string, number>;
  byDiet: Record<string, number>;
  byProtein: Record<string, number>;
  byAllergen: Record<string, number>;
  notMadeIn14Days: number;
  neverMade: number;
  avgPrepTime: number;
  avgEffort: number;
}

export interface QueryRecipesResult {
  recipes?: RecipeSummary[];
  stats?: RecipeStats;
  count: number;
  message: string;
}

// ============================================================================
// Submit Selections Tool
// ============================================================================

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof mealTypeSchema>;

export const selectionSchema = z.object({
  id: z.string().describe('Recipe ID from the database'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format'),
  mealType: mealTypeSchema.describe('Type of meal'),
});

export type Selection = z.infer<typeof selectionSchema>;

export const submitSelectionsInputSchema = z.object({
  selections: z.array(selectionSchema).min(1).max(21)
    .describe('Array of meal selections with recipe IDs, dates, and meal types'),
  reasoning: z.string().min(1).max(1000)
    .describe('Brief explanation of why these recipes were selected'),
});

export type SubmitSelectionsInput = z.infer<typeof submitSelectionsInputSchema>;

// Ingredient from recipe
export interface RecipeIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
}

// Recipe data in the format expected by the API (matches @honeydo/shared RecipeData)
export interface RecipeData {
  name: string;
  description: string;
  source: string;
  sourceUrl?: string;
  cuisine: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  nutrition?: RecipeNutrition | null;
}

// A single meal suggestion with full recipe data
export interface MealSuggestion {
  date: string;
  mealType: MealType;
  recipe: RecipeData;
}

export interface SubmitSelectionsResult {
  success: boolean;
  suggestions: MealSuggestion[];
  reasoning: string;
  errors?: string[];
}
