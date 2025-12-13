import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Path to the recipe history JSON file
// Use import.meta.url for reliable path resolution regardless of cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From apps/api/src/modules/recipes/ -> ../../../../.. -> repo root
const HISTORY_FILE_PATH = path.join(__dirname, '..', '..', '..', '..', '..', 'data', 'recipes', 'history.json');

// Nutrition schema
const nutritionSchema = z.object({
  calories: z.number().nonnegative().nullable(),
  protein: z.number().nonnegative().nullable(),
  carbohydrates: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  fiber: z.number().nonnegative().nullable().optional(),
  sugar: z.number().nonnegative().nullable().optional(),
  sodium: z.number().nonnegative().nullable().optional(),
  saturatedFat: z.number().nonnegative().nullable().optional(),
  cholesterol: z.number().nonnegative().nullable().optional(),
  servingSize: z.string().nullable().optional(),
}).nullable().optional();

// Schema for a recipe in history
const historyRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullable().optional(),
  cuisine: z.string(),
  diet: z.string().nullable().optional(),
  proteinSources: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  macroProfile: z.string().nullable().optional(),
  mealTypes: z.array(z.string()),
  seasonality: z.array(z.string()).nullable().optional(),
  prepTimeMinutes: z.number(),
  cookTimeMinutes: z.number(),
  totalTimeMinutes: z.number(),
  effort: z.number().min(1).max(5),
  defaultServings: z.number(),
  servingsUnit: z.string().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.number().nullable(),
    unit: z.string().nullable(),
    category: z.string(),
  })),
  instructions: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  rating: z.number().min(1).max(5).nullable().optional(),
  timesMade: z.number().optional(),
  lastMade: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  nutrition: nutritionSchema,
});

const historyFileSchema = z.object({
  recipes: z.array(historyRecipeSchema),
  metadata: z.object({
    lastUpdated: z.string(),
    totalRecipes: z.number(),
  }),
});

export type HistoryRecipe = z.infer<typeof historyRecipeSchema>;

// Helper to read the history file
async function readHistoryFile(): Promise<z.infer<typeof historyFileSchema>> {
  try {
    const content = await fs.readFile(HISTORY_FILE_PATH, 'utf-8');
    return historyFileSchema.parse(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, return empty history
      console.warn(`[history.router] Recipe history file not found at: ${HISTORY_FILE_PATH}`);
      return {
        recipes: [],
        metadata: {
          lastUpdated: new Date().toISOString().split('T')[0],
          totalRecipes: 0,
        },
      };
    }
    // Log Zod validation errors
    if (error instanceof z.ZodError) {
      console.error(`[history.router] Schema validation failed:`, error.issues.slice(0, 3));
    } else {
      console.error(`[history.router] Error reading history file:`, error);
    }
    throw error;
  }
}

// Helper to write the history file
async function writeHistoryFile(data: z.infer<typeof historyFileSchema>): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(HISTORY_FILE_PATH);
  await fs.mkdir(dir, { recursive: true });

  // Update metadata
  data.metadata.lastUpdated = new Date().toISOString().split('T')[0];
  data.metadata.totalRecipes = data.recipes.length;

  await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export const historyRouter = router({
  // Get all recipes from history
  getAll: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      cuisine: z.string().optional(),
      sortBy: z.enum(['name', 'lastMade', 'rating', 'timesMade']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const history = await readHistoryFile();
      let recipes = [...history.recipes];

      // Apply search filter
      if (input?.search) {
        const searchLower = input.search.toLowerCase();
        recipes = recipes.filter(
          (r) =>
            r.name.toLowerCase().includes(searchLower) ||
            r.source.toLowerCase().includes(searchLower) ||
            r.cuisine.toLowerCase().includes(searchLower)
        );
      }

      // Apply cuisine filter
      if (input?.cuisine) {
        recipes = recipes.filter(
          (r) => r.cuisine.toLowerCase() === input.cuisine!.toLowerCase()
        );
      }

      // Apply sorting
      const sortBy = input?.sortBy ?? 'name';
      const sortOrder = input?.sortOrder ?? 'asc';

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
            comparison = (a.timesMade ?? 0) - (b.timesMade ?? 0);
            break;
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      return {
        recipes,
        metadata: history.metadata,
      };
    }),

  // Get a single recipe by ID
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ input }) => {
      const history = await readHistoryFile();
      const recipe = history.recipes.find((r) => r.id === input);

      if (!recipe) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recipe not found',
        });
      }

      return recipe;
    }),

  // Delete a recipe from history
  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ input }) => {
      const history = await readHistoryFile();
      const index = history.recipes.findIndex((r) => r.id === input);

      if (index === -1) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recipe not found',
        });
      }

      const deleted = history.recipes.splice(index, 1)[0];
      await writeHistoryFile(history);

      return { success: true, deletedRecipe: deleted };
    }),

  // Get unique cuisines from history (for filtering)
  getCuisines: protectedProcedure.query(async () => {
    const history = await readHistoryFile();
    const cuisineSet = new Set(history.recipes.map((r) => r.cuisine));
    const cuisines = Array.from(cuisineSet).sort();
    return cuisines;
  }),
});
