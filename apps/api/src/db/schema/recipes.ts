import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users';

// ============================================
// Types for JSON columns
// ============================================

export interface CuisinePreference {
  maxPerWeek: number;
  preference: 'love' | 'like' | 'neutral' | 'avoid';
}

export type CuisinePreferences = Record<string, CuisinePreference>;

export type IngredientPreferenceLevel = 'love' | 'like' | 'neutral' | 'dislike' | 'never';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type NoteType = 'general' | 'ingredient' | 'rule' | 'seasonal';

export type DietaryRestrictionScope = 'always' | 'weekly';

export interface DietaryRestriction {
  name: string;
  scope: DietaryRestrictionScope;
  mealsPerWeek?: number; // Only used if scope is 'weekly'
}

export interface RecipeIngredient {
  name: string;
  amount: number | null; // Allow null for "to taste" ingredients
  unit: string | null;
  category: string;
  preparation?: string;
  optional?: boolean;
}

export interface RecipeData {
  name: string;
  description: string;
  source: string;
  sourceUrl?: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  defaultServings: number;
  servingsUnit: string;
  cuisine: string;
  effort: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags?: string[];
}

export interface MealSuggestionItem {
  date: string;
  mealType: MealType;
  recipe: RecipeData;
  accepted: boolean | null;
  servingsOverride: number | null;
  notes: string | null;
}

// ============================================
// Meal Preferences (fixed constraints, one per user)
// ============================================

export const mealPreferences = sqliteTable(
  'meal_preferences',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Cuisine preferences: { "italian": { "maxPerWeek": 2, "preference": "love" }, ... }
    cuisinePreferences: text('cuisine_preferences', { mode: 'json' })
      .$type<CuisinePreferences>()
      .default({}),

    // Dietary restrictions with scope (always vs weekly with count)
    dietaryRestrictions: text('dietary_restrictions', { mode: 'json' })
      .$type<DietaryRestriction[]>()
      .default([]),

    // Time constraints (minutes)
    weeknightMaxMinutes: integer('weeknight_max_minutes').notNull().default(45),
    weekendMaxMinutes: integer('weekend_max_minutes').notNull().default(120),

    // Effort level (1-5)
    weeknightMaxEffort: integer('weeknight_max_effort').notNull().default(3),
    weekendMaxEffort: integer('weekend_max_effort').notNull().default(5),

    // Default servings
    defaultServings: integer('default_servings').notNull().default(2),

    // Timestamps
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    userIdx: index('idx_meal_preferences_user').on(table.userId),
  })
);

// ============================================
// Ingredient Preferences (love/hate lists)
// ============================================

export const ingredientPreferences = sqliteTable(
  'ingredient_preferences',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ingredient: text('ingredient').notNull(),
    preference: text('preference')
      .notNull()
      .$type<IngredientPreferenceLevel>(),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIngredientIdx: index('idx_ingredient_prefs_user_ing').on(
      table.userId,
      table.ingredient
    ),
  })
);

// ============================================
// Freeform Preference Notes
// ============================================

export const mealPreferenceNotes = sqliteTable(
  'meal_preference_notes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteType: text('note_type').notNull().$type<NoteType>(),
    content: text('content').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIdx: index('idx_meal_pref_notes_user').on(table.userId),
  })
);

// ============================================
// Meal Suggestions (from external skill)
// ============================================

export const mealSuggestions = sqliteTable(
  'meal_suggestions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedAt: text('requested_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    dateRangeStart: text('date_range_start').notNull(),
    dateRangeEnd: text('date_range_end').notNull(),

    // Status: pending = awaiting skill, received = got response, reviewed = user processed, expired = old
    status: text('status')
      .notNull()
      .default('pending')
      .$type<'pending' | 'received' | 'reviewed' | 'expired'>(),

    // The actual suggestions (JSON array)
    suggestions: text('suggestions', { mode: 'json' }).$type<MealSuggestionItem[]>(),

    // How many suggestions to show initially (rest are hidden for replacements)
    visibleCount: integer('visible_count'),

    // AI reasoning for transparency
    reasoning: text('reasoning'),

    // Error info if skill failed
    error: text('error'),

    // Timestamps
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    requestedByIdx: index('idx_meal_suggestions_requested_by').on(table.requestedBy),
    statusIdx: index('idx_meal_suggestions_status').on(table.status),
  })
);

// ============================================
// Batch Status Type
// ============================================

export type BatchStatus = 'active' | 'archived' | 'abandoned';

// ============================================
// Batches (logical grouping of meals for a planning period)
// ============================================

export const batches = sqliteTable(
  'batches',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Batch metadata
    name: text('name'), // Optional user-defined name, e.g., "Week of Jan 15"
    dateRangeStart: text('date_range_start').notNull(), // YYYY-MM-DD
    dateRangeEnd: text('date_range_end').notNull(), // YYYY-MM-DD

    // Status
    status: text('status').$type<BatchStatus>().notNull().default('active'),

    // Statistics (computed when archived)
    totalMeals: integer('total_meals'),
    completedMeals: integer('completed_meals'),
    rolledOverMeals: integer('rolled_over_meals'),
    discardedMeals: integer('discarded_meals'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    archivedAt: text('archived_at'),
  },
  (table) => ({
    userStatusIdx: index('idx_batches_user_status').on(table.userId, table.status),
  })
);

// ============================================
// Wizard Sessions (track wizard progress for resumability)
// ============================================

export type MealDispositionType = 'completed' | 'rollover' | 'discard';

export interface MealDispositionRecord {
  mealId: string;
  disposition: MealDispositionType;
}

export interface ManualPickEntry {
  recipeId: string;
  recipeName: string;
  servings: number;
  addedAt: string;
}

export const wizardSessions = sqliteTable('wizard_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Wizard state
  currentStep: integer('current_step').notNull().default(1), // 1-4

  // Step 1 data: meal dispositions
  mealDispositions: text('meal_dispositions', { mode: 'json' }).$type<MealDispositionRecord[]>(),

  // Step 1 result: rollover count (becomes floor for total meal count)
  rolloverCount: integer('rollover_count').default(0), // Meals rolled over from previous batch

  // Step 2a data: meal counts planning
  totalMealCount: integer('total_meal_count'), // Total meals for batch (must be >= rolloverCount)
  manualPickCount: integer('manual_pick_count').default(0), // How many user picks manually (NEW picks, not rollovers)
  // Derived: aiPickCount = totalMealCount - manualPickCount - rolloverCount

  // Step 2b data: manual picks (from library or imported)
  manualPickIds: text('manual_pick_ids', { mode: 'json' }).$type<ManualPickEntry[]>().default([]),

  // Step 2c data: AI suggestion tracking (renamed for clarity)
  targetMealCount: integer('target_meal_count'), // AI target (= totalMealCount - manualPickCount)
  acceptedMealIds: text('accepted_meal_ids', { mode: 'json' }).$type<string[]>(),
  currentSuggestionRequestId: text('current_suggestion_request_id'),

  // Step 3 data: shopping selections
  selectedIngredients: text('selected_ingredients', { mode: 'json' }).$type<string[]>(),
  targetListId: text('target_list_id'),

  // Batch being created
  newBatchId: text('new_batch_id'),
  // Previous batch being archived
  previousBatchId: text('previous_batch_id'),

  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

// ============================================
// Accepted Meals (derived from suggestions)
// ============================================

export const acceptedMeals = sqliteTable(
  'accepted_meals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    suggestionId: text('suggestion_id').references(() => mealSuggestions.id, {
      onDelete: 'set null',
    }),
    suggestionIndex: integer('suggestion_index'),

    // Batch grouping
    batchId: text('batch_id').references(() => batches.id, { onDelete: 'set null' }),

    date: text('date').notNull(),
    mealType: text('meal_type').notNull().$type<MealType>(),

    // Denormalized recipe data (in case suggestion is modified)
    recipeName: text('recipe_name').notNull(),
    recipeData: text('recipe_data', { mode: 'json' }).notNull().$type<RecipeData>(),

    servings: integer('servings').notNull(),

    // Shopping list generation tracking
    shoppingListGenerated: integer('shopping_list_generated', { mode: 'boolean' })
      .notNull()
      .default(false),

    // Completion tracking
    completed: integer('completed', { mode: 'boolean' })
      .notNull()
      .default(false),
    completedAt: text('completed_at'),

    // Rollover tracking
    isRollover: integer('is_rollover', { mode: 'boolean' }).notNull().default(false),
    rolloverFromBatchId: text('rollover_from_batch_id'),

    // Manual pick tracking (user selected from library vs AI suggested)
    isManualPick: integer('is_manual_pick', { mode: 'boolean' }).notNull().default(false),

    // Audible tracking
    isAudible: integer('is_audible', { mode: 'boolean' }).notNull().default(false),
    replacedMealId: text('replaced_meal_id'),

    // User rating for history
    rating: integer('rating'), // 1-5 stars, null if not rated
    userNotes: text('user_notes'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    dateIdx: index('idx_accepted_meals_date').on(table.date),
    dateMealTypeIdx: index('idx_accepted_meals_date_type').on(table.date, table.mealType),
    suggestionIdx: index('idx_accepted_meals_suggestion').on(table.suggestionId),
    batchIdx: index('idx_accepted_meals_batch').on(table.batchId),
  })
);

// ============================================
// Suggestion Schedules (for automatic weekly suggestions)
// ============================================

export const suggestionSchedules = sqliteTable(
  'suggestion_schedules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // When to run (cron-style, simplified)
    dayOfWeek: integer('day_of_week').notNull(), // 0-6 (Sunday-Saturday)
    hour: integer('hour').notNull(), // 0-23

    // What to request
    daysAhead: integer('days_ahead').notNull().default(7), // Plan for next N days

    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastRunAt: text('last_run_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIdx: index('idx_suggestion_schedules_user').on(table.userId),
  })
);

// ============================================
// Relations
// ============================================

export const mealPreferencesRelations = relations(mealPreferences, ({ one }) => ({
  user: one(users, {
    fields: [mealPreferences.userId],
    references: [users.id],
  }),
}));

export const ingredientPreferencesRelations = relations(ingredientPreferences, ({ one }) => ({
  user: one(users, {
    fields: [ingredientPreferences.userId],
    references: [users.id],
  }),
}));

export const mealPreferenceNotesRelations = relations(mealPreferenceNotes, ({ one }) => ({
  user: one(users, {
    fields: [mealPreferenceNotes.userId],
    references: [users.id],
  }),
}));

export const mealSuggestionsRelations = relations(mealSuggestions, ({ one, many }) => ({
  requestedByUser: one(users, {
    fields: [mealSuggestions.requestedBy],
    references: [users.id],
  }),
  acceptedMeals: many(acceptedMeals),
}));

export const acceptedMealsRelations = relations(acceptedMeals, ({ one }) => ({
  suggestion: one(mealSuggestions, {
    fields: [acceptedMeals.suggestionId],
    references: [mealSuggestions.id],
  }),
  batch: one(batches, {
    fields: [acceptedMeals.batchId],
    references: [batches.id],
  }),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  user: one(users, {
    fields: [batches.userId],
    references: [users.id],
  }),
  meals: many(acceptedMeals),
}));

export const wizardSessionsRelations = relations(wizardSessions, ({ one }) => ({
  user: one(users, {
    fields: [wizardSessions.userId],
    references: [users.id],
  }),
  newBatch: one(batches, {
    fields: [wizardSessions.newBatchId],
    references: [batches.id],
  }),
}));

export const suggestionSchedulesRelations = relations(suggestionSchedules, ({ one }) => ({
  user: one(users, {
    fields: [suggestionSchedules.userId],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type MealPreferencesRow = typeof mealPreferences.$inferSelect;
export type NewMealPreferences = typeof mealPreferences.$inferInsert;

export type IngredientPreferenceRow = typeof ingredientPreferences.$inferSelect;
export type NewIngredientPreference = typeof ingredientPreferences.$inferInsert;

export type MealPreferenceNoteRow = typeof mealPreferenceNotes.$inferSelect;
export type NewMealPreferenceNote = typeof mealPreferenceNotes.$inferInsert;

export type MealSuggestionRow = typeof mealSuggestions.$inferSelect;
export type NewMealSuggestion = typeof mealSuggestions.$inferInsert;

export type AcceptedMealRow = typeof acceptedMeals.$inferSelect;
export type NewAcceptedMeal = typeof acceptedMeals.$inferInsert;

export type SuggestionScheduleRow = typeof suggestionSchedules.$inferSelect;
export type NewSuggestionSchedule = typeof suggestionSchedules.$inferInsert;

export type BatchRow = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;

export type WizardSessionRow = typeof wizardSessions.$inferSelect;
export type NewWizardSession = typeof wizardSessions.$inferInsert;
