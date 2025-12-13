import { z } from 'zod';

// ============================================
// Enum Schemas
// ============================================

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const noteTypeSchema = z.enum(['general', 'ingredient', 'rule', 'seasonal']);
export const ingredientPreferenceLevelSchema = z.enum(['love', 'like', 'neutral', 'dislike', 'never']);
export const cuisinePreferenceLevelSchema = z.enum(['love', 'like', 'neutral', 'avoid']);
export const suggestionStatusSchema = z.enum(['pending', 'received', 'reviewed', 'expired']);
export const dietaryRestrictionScopeSchema = z.enum(['always', 'weekly']);

// ============================================
// Cuisine Preferences
// ============================================

export const cuisinePreferenceSchema = z.object({
  maxPerWeek: z.number().min(0).max(7),
  preference: cuisinePreferenceLevelSchema,
});

export const cuisinePreferencesSchema = z.record(z.string(), cuisinePreferenceSchema);

// ============================================
// Dietary Restrictions
// ============================================

export const dietaryRestrictionSchema = z.object({
  name: z.string().min(1),
  scope: dietaryRestrictionScopeSchema,
  mealsPerWeek: z.number().min(1).max(21).optional(), // Only used if scope is 'weekly'
});

// ============================================
// Recipe and Ingredient Schemas
// ============================================

export const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative().nullable(), // Allow null for "to taste" ingredients
  unit: z.string().nullable(),
  category: z.string(),
  preparation: z.string().optional(),
  optional: z.boolean().optional(),
});

// Nutrition/macros information (per serving)
export const nutritionSchema = z.object({
  calories: z.number().nonnegative().nullable(), // kcal
  protein: z.number().nonnegative().nullable(), // grams
  carbohydrates: z.number().nonnegative().nullable(), // grams
  fat: z.number().nonnegative().nullable(), // grams
  fiber: z.number().nonnegative().nullable().optional(), // grams
  sugar: z.number().nonnegative().nullable().optional(), // grams
  sodium: z.number().nonnegative().nullable().optional(), // mg
  saturatedFat: z.number().nonnegative().nullable().optional(), // grams
  cholesterol: z.number().nonnegative().nullable().optional(), // mg
  servingSize: z.string().nullable().optional(), // e.g., "1/8 of the recipe"
});

export const recipeDataSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  source: z.string(),
  sourceUrl: z.preprocess(
    val => val === null ? undefined : val,
    z.string().url().optional()
  ), // Normalize null to undefined
  prepTimeMinutes: z.number().nonnegative(),
  cookTimeMinutes: z.number().nonnegative(),
  totalTimeMinutes: z.number().nonnegative(),
  defaultServings: z.number().positive(),
  servingsUnit: z.string(),
  cuisine: z.string(),
  effort: z.number().min(1).max(5),
  ingredients: z.array(recipeIngredientSchema),
  instructions: z.array(z.string()),
  tags: z.array(z.string()).optional(),
  nutrition: nutritionSchema.nullable().optional(), // Per-serving nutrition data
});

// ============================================
// Meal Preference Schemas
// ============================================

export const mealPreferencesSchema = z.object({
  id: z.string(),
  userId: z.string(),
  cuisinePreferences: cuisinePreferencesSchema.nullable(),
  dietaryRestrictions: z.array(dietaryRestrictionSchema).nullable(),
  weeknightMaxMinutes: z.number().min(10).max(180),
  weekendMaxMinutes: z.number().min(10).max(300),
  weeknightMaxEffort: z.number().min(1).max(5),
  weekendMaxEffort: z.number().min(1).max(5),
  defaultServings: z.number().min(1).max(12),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const updateMealPreferencesSchema = z.object({
  cuisinePreferences: cuisinePreferencesSchema.optional(),
  dietaryRestrictions: z.array(dietaryRestrictionSchema).optional(),
  weeknightMaxMinutes: z.number().min(10).max(180).optional(),
  weekendMaxMinutes: z.number().min(10).max(300).optional(),
  weeknightMaxEffort: z.number().min(1).max(5).optional(),
  weekendMaxEffort: z.number().min(1).max(5).optional(),
  defaultServings: z.number().min(1).max(12).optional(),
});

// ============================================
// Ingredient Preference Schemas
// ============================================

export const ingredientPreferenceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ingredient: z.string(),
  preference: ingredientPreferenceLevelSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const setIngredientPreferenceSchema = z.object({
  ingredient: z.string().min(1, 'Ingredient name is required').max(100),
  preference: ingredientPreferenceLevelSchema,
  notes: z.string().max(500).optional(),
});

// ============================================
// Meal Preference Notes Schemas
// ============================================

export const mealPreferenceNoteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  noteType: noteTypeSchema,
  content: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const addNoteSchema = z.object({
  noteType: noteTypeSchema,
  content: z.string().min(1, 'Note content is required').max(1000),
});

export const updateNoteSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// Meal Suggestion Schemas
// ============================================

export const mealSuggestionItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  mealType: mealTypeSchema,
  recipe: recipeDataSchema,
  accepted: z.boolean().nullable(),
  servingsOverride: z.number().positive().nullable(),
  notes: z.string().nullable(),
});

export const mealSuggestionsSchema = z.object({
  id: z.string(),
  requestedBy: z.string(),
  requestedAt: z.string(),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  status: suggestionStatusSchema,
  suggestions: z.array(mealSuggestionItemSchema).nullable(),
  visibleCount: z.number().nullable(), // How many suggestions are visible (rest are hidden backups)
  reasoning: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const requestSuggestionsSchema = z.object({
  dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  mealTypes: z.array(mealTypeSchema).default(['dinner']),
});

export const acceptMealSchema = z.object({
  suggestionId: z.string(),
  mealIndex: z.number().nonnegative(),
  servings: z.number().min(1).max(20).optional(),
});

export const rejectMealSchema = z.object({
  suggestionId: z.string(),
  mealIndex: z.number().nonnegative(),
});

export const setServingsSchema = z.object({
  suggestionId: z.string(),
  mealIndex: z.number().nonnegative(),
  servings: z.number().min(1).max(20),
});

export const fetchMoreSuggestionsSchema = z.object({
  suggestionId: z.string(),
  mealIndex: z.number().nonnegative(), // Index of the meal to get alternatives for
  count: z.number().min(1).max(5).default(3), // How many alternatives to fetch
});

// ============================================
// Accepted Meals Schemas
// ============================================

export const acceptedMealSchema = z.object({
  id: z.string(),
  suggestionId: z.string().nullable(),
  suggestionIndex: z.number().nullable(),
  date: z.string(),
  mealType: mealTypeSchema,
  recipeName: z.string(),
  recipeData: recipeDataSchema,
  servings: z.number(),
  shoppingListGenerated: z.boolean(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const dateRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
});

// ============================================
// Schedule Schemas
// ============================================

export const suggestionScheduleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  dayOfWeek: z.number().min(0).max(6),
  hour: z.number().min(0).max(23),
  daysAhead: z.number().min(1).max(14),
  isActive: z.boolean(),
  lastRunAt: z.string().nullable(),
  createdAt: z.string(),
});

export const setScheduleSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  hour: z.number().min(0).max(23),
  daysAhead: z.number().min(1).max(14).default(7),
});

// ============================================
// Shopping List Generation Schemas
// ============================================

export const aggregatedIngredientSchema = z.object({
  key: z.string(),
  name: z.string(),
  totalAmount: z.number(),
  unit: z.string().nullable(),
  category: z.string(),
  fromMeals: z.array(z.string()),
  selected: z.boolean(),
  additionalAmounts: z.array(z.object({
    amount: z.number(),
    unit: z.string(),
  })).optional(),
});

export const addIngredientsToListSchema = z.object({
  listId: z.string(),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
    note: z.string().optional(),
    fromMeals: z.array(z.string()).optional(),
  })),
  mealIds: z.array(z.string()),
});

// ============================================
// Skill Integration Schemas
// ============================================

export const skillInputSchema = z.object({
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
  mealTypes: z.array(mealTypeSchema),
  servings: z.number(),
  suggestionsCount: z.number().min(1).max(21), // How many suggestions to generate
  recentMeals: z.array(z.object({
    date: z.string(),
    mealType: z.string(),
    recipeName: z.string(),
    cuisine: z.string(),
  })),
  preferences: z.object({
    cuisinePreferences: z.record(z.string(), z.object({
      maxPerWeek: z.number(),
      preference: z.string(),
    })),
    dietaryRestrictions: z.array(dietaryRestrictionSchema),
    weeknightMaxMinutes: z.number(),
    weekendMaxMinutes: z.number(),
    weeknightMaxEffort: z.number(),
    weekendMaxEffort: z.number(),
  }),
  ingredientPreferences: z.array(z.object({
    ingredient: z.string(),
    preference: z.string(),
    notes: z.string().nullable(),
  })),
  notes: z.array(z.object({
    type: z.string(),
    content: z.string(),
  })),
  context: z.object({
    season: z.enum(['spring', 'summer', 'fall', 'winter']),
    currentDate: z.string(),
  }),
});

export const mealSuggestionSchema = z.object({
  date: z.string(),
  mealType: z.string(),
  recipe: recipeDataSchema,
});

export const skillOutputSchema = z.object({
  suggestions: z.array(mealSuggestionSchema),
  reasoning: z.string(),
});

// ============================================
// Preferences Export Schema
// ============================================

export const exportedPreferencesSchema = z.object({
  preferences: z.object({
    cuisinePreferences: cuisinePreferencesSchema,
    dietaryRestrictions: z.array(dietaryRestrictionSchema),
    weeknightMaxMinutes: z.number(),
    weekendMaxMinutes: z.number(),
    weeknightMaxEffort: z.number(),
    weekendMaxEffort: z.number(),
  }),
  ingredientPreferences: z.array(z.object({
    ingredient: z.string(),
    preference: z.string(),
    notes: z.string().nullable(),
  })),
  notes: z.array(z.object({
    type: z.string(),
    content: z.string(),
  })),
});

// ============================================
// Batch Schemas
// ============================================

export const batchStatusSchema = z.enum(['active', 'archived', 'abandoned']);
export const mealDispositionSchema = z.enum(['completed', 'rollover', 'discard']);

export const batchSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  status: batchStatusSchema,
  totalMeals: z.number().nullable(),
  completedMeals: z.number().nullable(),
  rolledOverMeals: z.number().nullable(),
  discardedMeals: z.number().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});

export const createBatchSchema = z.object({
  name: z.string().max(100).optional(),
  dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
});

// ============================================
// Wizard Session Schemas
// ============================================

export const mealDispositionRecordSchema = z.object({
  mealId: z.string(),
  disposition: mealDispositionSchema,
});

// Manual pick entry (user selected from library or imported)
export const manualPickEntrySchema = z.object({
  recipeId: z.string(),
  recipeName: z.string(),
  servings: z.number().int().min(1).max(20),
  addedAt: z.string(),
});

export const wizardSessionSchema = z.object({
  id: z.string(),
  currentStep: z.number().min(1).max(4),
  mealDispositions: z.array(mealDispositionRecordSchema).nullable(),
  // Step 1 result: rollover count (floor for total meal count)
  rolloverCount: z.number().default(0),
  // Step 2a: Meal counts planning
  totalMealCount: z.number().nullable(),
  manualPickCount: z.number().default(0),
  // Step 2b: Manual picks
  manualPickIds: z.array(manualPickEntrySchema).nullable(),
  // Step 2c: AI suggestions (targetMealCount = aiCount)
  targetMealCount: z.number().nullable(),
  acceptedMealIds: z.array(z.string()).nullable(),
  newBatchId: z.string().nullable(),
  previousBatchId: z.string().nullable(),
});

export const setMealDispositionsSchema = z.object({
  dispositions: z.array(mealDispositionRecordSchema),
});

export const setTargetCountSchema = z.object({
  count: z.number().min(1).max(21),
});

// Step 2a: Set meal counts (total and manual pick breakdown)
export const setMealCountsSchema = z.object({
  total: z.number().int().min(1).max(21),
  manualPicks: z.number().int().min(0).max(21),
}).refine(data => data.manualPicks <= data.total, {
  message: "Manual picks cannot exceed total meals",
});

// Step 2b: Add a manual pick from library
export const addManualPickSchema = z.object({
  recipeId: z.string(),
  servings: z.number().int().min(1).max(20).default(4),
});

// Step 2b: Remove a manual pick
export const removeManualPickSchema = z.object({
  recipeId: z.string(),
});

export const completeShoppingSchema = z.object({
  selectedIngredients: z.array(z.string()),
  listAction: z.enum(['replace', 'append', 'new']),
  listId: z.string().optional(),
  newListName: z.string().max(100).optional(),
});

// ============================================
// Wizard Response Schemas
// ============================================

export const wizardMealSchema = z.object({
  id: z.string(),
  date: z.string(),
  mealType: mealTypeSchema,
  recipeName: z.string(),
  recipeData: recipeDataSchema,
  servings: z.number(),
  completed: z.boolean(),
  isAudible: z.boolean(),
  suggestedDisposition: mealDispositionSchema,
});

export const wizardProgressSchema = z.object({
  targetCount: z.number(),
  acceptedCount: z.number(),
  pendingSuggestionCount: z.number(),
});

export const wizardCompletionSummarySchema = z.object({
  newMeals: z.number(),
  rollovers: z.number(),
  archivedToHistory: z.number(),
  shoppingItems: z.number(),
  listId: z.string().nullable(),
  listName: z.string().nullable(),
  batchId: z.string(),
});

// ============================================
// Recipe Scraping Schemas
// ============================================

export const scrapeUrlSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
});

export const scrapedIngredientSchema = z.object({
  name: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  category: z.string(),
});

export const scrapedRecipeSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  sourceUrl: z.string().url(),
  source: z.string(), // Extracted domain name
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  totalTimeMinutes: z.number().nullable(),
  defaultServings: z.number().nullable(),
  ingredients: z.array(scrapedIngredientSchema),
  instructions: z.array(z.string()),
  image: z.string().nullable(),
});

export const saveScrapedRecipeSchema = z.object({
  // Required fields
  name: z.string().min(1, 'Recipe name is required'),
  source: z.string().min(1, 'Source is required'),
  sourceUrl: z.string().url().nullable(),
  cuisine: z.string().min(1, 'Cuisine is required'),

  // Time and effort
  prepTimeMinutes: z.number().nonnegative(),
  cookTimeMinutes: z.number().nonnegative(),
  totalTimeMinutes: z.number().nonnegative(),
  effort: z.number().min(1).max(5),

  // Servings
  defaultServings: z.number().positive(),
  servingsUnit: z.string().default('servings'),

  // Recipe content
  ingredients: z.array(scrapedIngredientSchema).min(1, 'At least one ingredient is required'),
  instructions: z.array(z.string()),

  // Optional metadata
  description: z.string().nullable().optional(),
  diet: z.enum(['vegan', 'vegetarian', 'pescatarian', 'omnivore']).nullable().optional(),
  proteinSources: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  macroProfile: z.enum(['protein-heavy', 'carb-heavy', 'balanced', 'light']).nullable().optional(),
  mealTypes: z.array(mealTypeSchema).default(['dinner']),
  seasonality: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// ============================================
// Inferred Types
// ============================================

// Enum types
export type MealType = z.infer<typeof mealTypeSchema>;
export type NoteType = z.infer<typeof noteTypeSchema>;
export type IngredientPreferenceLevel = z.infer<typeof ingredientPreferenceLevelSchema>;
export type CuisinePreferenceLevel = z.infer<typeof cuisinePreferenceLevelSchema>;
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;
export type DietaryRestrictionScope = z.infer<typeof dietaryRestrictionScopeSchema>;

// Dietary restriction types
export type DietaryRestriction = z.infer<typeof dietaryRestrictionSchema>;

// Preference types
export type CuisinePreference = z.infer<typeof cuisinePreferenceSchema>;
export type CuisinePreferences = z.infer<typeof cuisinePreferencesSchema>;
export type MealPreferences = z.infer<typeof mealPreferencesSchema>;
export type UpdateMealPreferencesInput = z.infer<typeof updateMealPreferencesSchema>;

// Ingredient preference types
export type IngredientPreference = z.infer<typeof ingredientPreferenceSchema>;
export type SetIngredientPreferenceInput = z.infer<typeof setIngredientPreferenceSchema>;

// Note types
export type MealPreferenceNote = z.infer<typeof mealPreferenceNoteSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

// Recipe types
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type Nutrition = z.infer<typeof nutritionSchema>;
export type RecipeData = z.infer<typeof recipeDataSchema>;

// Suggestion types
export type MealSuggestionItem = z.infer<typeof mealSuggestionItemSchema>;
export type MealSuggestions = z.infer<typeof mealSuggestionsSchema>;
export type RequestSuggestionsInput = z.infer<typeof requestSuggestionsSchema>;
export type AcceptMealInput = z.infer<typeof acceptMealSchema>;
export type RejectMealInput = z.infer<typeof rejectMealSchema>;
export type SetServingsInput = z.infer<typeof setServingsSchema>;
export type FetchMoreSuggestionsInput = z.infer<typeof fetchMoreSuggestionsSchema>;

// Accepted meal types
export type AcceptedMeal = z.infer<typeof acceptedMealSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;

// Schedule types
export type SuggestionSchedule = z.infer<typeof suggestionScheduleSchema>;
export type SetScheduleInput = z.infer<typeof setScheduleSchema>;

// Shopping integration types
export type AggregatedIngredient = z.infer<typeof aggregatedIngredientSchema>;
export type AddIngredientsToListInput = z.infer<typeof addIngredientsToListSchema>;

// Skill integration types
export type MealSuggestion = z.infer<typeof mealSuggestionSchema>;
export type SkillInput = z.infer<typeof skillInputSchema>;
export type SkillOutput = z.infer<typeof skillOutputSchema>;

// Export types
export type ExportedPreferences = z.infer<typeof exportedPreferencesSchema>;

// Batch types
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type MealDisposition = z.infer<typeof mealDispositionSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

// Wizard types
export type ManualPickEntry = z.infer<typeof manualPickEntrySchema>;
export type MealDispositionRecord = z.infer<typeof mealDispositionRecordSchema>;
export type WizardSession = z.infer<typeof wizardSessionSchema>;
export type SetMealDispositionsInput = z.infer<typeof setMealDispositionsSchema>;
export type SetTargetCountInput = z.infer<typeof setTargetCountSchema>;
export type SetMealCountsInput = z.infer<typeof setMealCountsSchema>;
export type AddManualPickInput = z.infer<typeof addManualPickSchema>;
export type RemoveManualPickInput = z.infer<typeof removeManualPickSchema>;
export type CompleteShoppingInput = z.infer<typeof completeShoppingSchema>;
export type WizardMeal = z.infer<typeof wizardMealSchema>;
export type WizardProgress = z.infer<typeof wizardProgressSchema>;
export type WizardCompletionSummary = z.infer<typeof wizardCompletionSummarySchema>;

// Scraping types
export type ScrapeUrlInput = z.infer<typeof scrapeUrlSchema>;
export type ScrapedIngredient = z.infer<typeof scrapedIngredientSchema>;
export type ScrapedRecipe = z.infer<typeof scrapedRecipeSchema>;
export type SaveScrapedRecipeInput = z.infer<typeof saveScrapedRecipeSchema>;
