# Epic 4: Recipes & Meal Planning

> AI-powered meal planning that learns your preferences and generates smart shopping lists.

## Overview

The Recipes module takes a fundamentally different approach from typical recipe apps. Instead of building a recipe database manually, you train an **external Claude Code skill** with your cooking history and preferences. That skill generates personalized meal suggestions in **batches** (not tied to specific dates). The app stores preferences, displays suggestions, handles acceptance/rejection with feedback, and creates ingredient-by-ingredient shopping lists that integrate with Epic 2.

**Key Principle**: The Claude Code skill holds the intelligence; the app holds the preferences and workflow.

**What Changed**: This epic uses a **batch-based model** instead of date-based meal planning:
- ~~Calendar/scheduling~~ → Simple batch of N suggestions
- ~~Date assignments~~ → Cook recipes whenever you want
- ~~Meal plans~~ → Active batch + recipe history
- Added: **Audible system** for mid-cook pivots
- Added: **Rejection feedback** that updates preferences

**When this epic is complete**, you'll have:
- A preferences system (fixed constraints + freeform notes) that learns from rejections
- Integration with an external Claude Code skill for batch suggestions
- A review/accept/reject workflow with feedback loop
- **Audible system** for emergency recipe swaps
- Ingredient-level shopping list generation with scaling
- Seamless integration with the main shopping list

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Claude Code                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Recipe Suggestion Skill                     │   │
│  │                                                          │   │
│  │  • Trained on your historical recipes                    │   │
│  │  • Knows: cook times, cuisines, sources, patterns        │   │
│  │  • Receives: preferences, batch size, recent meals       │   │
│  │  • Returns: batch of recipe suggestions with ingredients │   │
│  │  • Handles: Audibles (emergency swaps with constraints)  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP API / CLI call
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        HoneyDo App                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Preferences  │  │ Active Batch │  │  Shopping List     │    │
│  │              │  │              │  │  Generation        │    │
│  │ • Cuisines   │◄─│ • View batch │──│                    │    │
│  │ • Time       │  │ • Complete   │  │ • Ingredient-level │    │
│  │ • Dietary    │  │ • Reject+Why │  │ • Scaling          │    │
│  │ • Notes      │  │ • Audible    │  │ • Add to list      │    │
│  │ • Learns!    │  │ • New batch  │  │                    │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Batch Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACTIVE BATCH                             │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Recipe  │  │ Recipe  │  │ Recipe  │  │ Recipe  │            │
│  │ Active  │  │Completed│  │ Active  │  │ Audible │            │
│  │         │  │ (gray)  │  │         │  │ ░░░░░░░ │            │
│  └─────────┘  └─────────┘  └─────────┘  │ struck  │            │
│                                          ├─────────┤            │
│                                          │ Replace │            │
│                                          │ (above) │            │
│                                          └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User creates new batch
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Completed recipes ──► Recipe History                           │
│  Audible recipes ────► Discarded (no record)                    │
│  Active recipes ─────► Roll over to new batch                   │
└─────────────────────────────────────────────────────────────────┘
```

### Recipe States

| State | Visual | On New Batch | Added to History? |
|-------|--------|--------------|-------------------|
| **Active** | Normal | Rolls over | No |
| **Completed** | Grayed out | Removed | Yes |
| **Audible (original)** | Struck through + grayed | Removed | No |
| **Audible (replacement)** | Normal, positioned above original | Removed | No |

---

## User Stories

### Core Flow
- **As a user**, I want to configure my meal preferences so AI suggestions match my household
- **As a user**, I want to request a batch of N meal suggestions (not tied to dates)
- **As a user**, I want to review suggestions and mark them complete when cooked
- **As a user**, I want to reject suggestions with feedback so the system learns
- **As a user**, I want to see ingredient lists and select which to add to shopping
- **As a user**, I want quantities scaled to my desired servings

### Preferences
- **As a user**, I want to set cuisine frequency preferences (e.g., "Italian 2x/week max")
- **As a user**, I want to specify dietary restrictions and allergies
- **As a user**, I want to set max cook times for weeknight vs weekend meals
- **As a user**, I want to add freeform notes like "we love garlic" or "no raw onions"
- **As a user**, I want to create ingredient love/hate lists
- **As a user**, I want to set rules like "one vegetarian meal per week"
- **As a user**, I want my rejections to automatically update my preferences

### Audible (Emergency Swap)
- **As a user**, I want to call an "audible" when I can't cook a planned recipe
- **As a user**, I want to select a reason (missing ingredient, time crunch, mood change)
- **As a user**, I want to add optional details about the situation
- **As a user**, I want AI to suggest a replacement using remaining ingredients + pantry staples
- **As a user**, I want the original recipe to stay visible (struck through) with the replacement above it
- **As a user**, I want audibles to leave no trace in my recipe history

### Batch Management
- **As a user**, I want to create a new batch which clears completed/audible recipes
- **As a user**, I want incomplete recipes to roll over to the new batch
- **As a user**, I want completed recipes to be added to my history when the batch clears

---

## Goals

1. **Preference-Driven** - AI knows exactly what you like before suggesting
2. **Learning System** - Rejections and feedback improve future suggestions
3. **External Intelligence** - Skill is trained separately, app just consumes
4. **Low Friction** - Review → Cook → Complete in minimal steps
5. **Smart Integration** - Ingredient selection feeds directly to shopping list
6. **Flexible Batches** - No date pressure, cook recipes when you want
7. **Graceful Pivots** - Audible system handles real-life interruptions

---

## Non-Goals (for this epic)

- Training the external Claude Code skill (separate effort)
- ~~Storing a recipe database (comes from skill)~~ → We store recipe history
- ~~Calendar-based meal planning~~ → Batch model instead
- ~~Scheduled automatic suggestions~~ → Manual batch requests only
- Nutritional tracking
- Grocery delivery integration
- Social features
- Step-by-step cooking mode

---

## Data Model

### Tables

```sql
-- User Meal Preferences (fixed constraints)
CREATE TABLE meal_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,

  -- Cuisine preferences (JSON: { "italian": { "max_per_batch": 2, "preference": "love" }, ... })
  cuisine_preferences JSON,

  -- Dietary restrictions (JSON: ["no-shellfish", "low-sodium"])
  dietary_restrictions JSON,

  -- Time constraints (used for audibles and general suggestions)
  quick_meal_max_minutes INTEGER DEFAULT 30,
  standard_meal_max_minutes INTEGER DEFAULT 60,

  -- Meal complexity (1-5 scale)
  default_max_effort INTEGER DEFAULT 3,

  -- Default servings when generating
  default_servings INTEGER DEFAULT 2,

  -- Default batch size
  default_batch_size INTEGER DEFAULT 5,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(user_id)
);

-- Ingredient Preferences (love/hate lists)
-- Also updated by rejection feedback
CREATE TABLE ingredient_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ingredient TEXT NOT NULL,
  preference TEXT NOT NULL CHECK (preference IN ('love', 'like', 'neutral', 'dislike', 'never')),
  notes TEXT,  -- "only when fresh" or "allergic"
  source TEXT DEFAULT 'manual',  -- 'manual' or 'rejection_feedback'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, ingredient)
);

-- Freeform Preference Notes
CREATE TABLE meal_preference_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN ('general', 'ingredient', 'rule', 'seasonal')),
  content TEXT NOT NULL,  -- Natural language: "We love bold flavors"
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',  -- 'manual' or 'rejection_feedback'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recipe Batches (the active meal list)
CREATE TABLE recipe_batches (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE,

  -- Batch state
  is_active INTEGER NOT NULL DEFAULT 1,  -- Only one active batch per user

  -- AI reasoning for the batch
  reasoning TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cleared_at TEXT  -- When new batch was created, clearing this one
);

-- Batch Recipes (recipes in a batch)
CREATE TABLE batch_recipes (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES recipe_batches(id) ON DELETE CASCADE,

  -- Recipe data (denormalized from skill output)
  recipe_name TEXT NOT NULL,
  recipe_data JSON NOT NULL,  -- Full recipe object from skill

  -- State: 'active', 'completed', 'audible_original', 'audible_replacement'
  status TEXT NOT NULL DEFAULT 'active',

  -- For audible replacements, link to original
  audible_original_id TEXT REFERENCES batch_recipes(id) ON DELETE SET NULL,

  -- Audible metadata (for original recipes that were audible'd)
  audible_reason TEXT,  -- 'missing_ingredient', 'time_crunch', 'mood_change', 'other'
  audible_details TEXT,  -- User's additional explanation

  -- Position in list (for ordering, and audible replacement positioning)
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Servings (may differ from recipe default)
  servings INTEGER NOT NULL,

  completed_at TEXT,  -- When marked complete
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rejection Feedback (tracks why recipes were rejected)
CREATE TABLE rejection_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  batch_recipe_id TEXT REFERENCES batch_recipes(id) ON DELETE CASCADE,

  -- What was rejected
  recipe_name TEXT NOT NULL,

  -- Why it was rejected
  reason TEXT NOT NULL,  -- 'dont_like_cuisine', 'dont_like_ingredient', 'too_complex', 'had_recently', 'other'
  details TEXT,  -- User's explanation

  -- What preference update was made (if any)
  preference_update JSON,  -- { "type": "ingredient", "ingredient": "cilantro", "preference": "dislike" }

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recipe History (completed recipes, persisted after batch clears)
CREATE TABLE recipe_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,

  recipe_name TEXT NOT NULL,
  recipe_data JSON NOT NULL,  -- Full recipe object

  servings_cooked INTEGER NOT NULL,
  source_batch_id TEXT,  -- Which batch this came from (may be null if batch deleted)

  cooked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- REMOVED: suggestion_schedules (no more scheduled suggestions)
-- REMOVED: accepted_meals (replaced by batch_recipes)
-- REMOVED: meal_suggestions date_range fields (batch model)
```

### Audible Reasons

```typescript
const AUDIBLE_REASONS = {
  missing_ingredient: 'Missing a crucial ingredient',
  time_crunch: 'Not enough time to cook this',
  mood_change: 'In the mood for something different',
  other: 'Other reason',
} as const;
```

### Rejection Reasons

```typescript
const REJECTION_REASONS = {
  dont_like_cuisine: "Don't like this cuisine",
  dont_like_ingredient: "Don't like an ingredient",
  too_complex: 'Too complex/time-consuming',
  had_recently: 'Had this or similar recently',
  not_in_mood: 'Not in the mood for this',
  other: 'Other reason',
} as const;
```

---

## API Design (tRPC)

```typescript
export const recipesRouter = router({
  // Preferences Management
  preferences: router({
    // Fixed preferences
    get: protectedProcedure.query(...),
    update: protectedProcedure.input(updatePreferencesSchema).mutation(...),

    // Ingredient preferences
    getIngredients: protectedProcedure.query(...),
    setIngredient: protectedProcedure.input(setIngredientPrefSchema).mutation(...),
    removeIngredient: protectedProcedure.input(z.string()).mutation(...),

    // Freeform notes
    getNotes: protectedProcedure.query(...),
    addNote: protectedProcedure.input(addNoteSchema).mutation(...),
    updateNote: protectedProcedure.input(updateNoteSchema).mutation(...),
    deleteNote: protectedProcedure.input(z.string()).mutation(...),

    // Export all preferences (for skill consumption)
    exportAll: protectedProcedure.query(...),
  }),

  // Batch Management
  batch: router({
    // Get active batch (or null)
    getActive: protectedProcedure.query(...),

    // Request new batch of suggestions (creates batch, invokes skill)
    request: protectedProcedure
      .input(z.object({
        count: z.number().min(1).max(10).default(5),
        mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).default(['dinner']),
      }))
      .mutation(...),

    // Create new batch (clears completed/audible, rolls over active)
    createNew: protectedProcedure
      .input(z.object({
        count: z.number().min(1).max(10).default(5),
        mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).default(['dinner']),
      }))
      .mutation(...),

    // Get batch history
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(...),
  }),

  // Recipe Actions (within active batch)
  recipes: router({
    // Mark recipe as completed
    complete: protectedProcedure
      .input(z.object({ recipeId: z.string() }))
      .mutation(...),

    // Reject recipe (removes from batch, requests replacement, updates preferences)
    reject: protectedProcedure
      .input(z.object({
        recipeId: z.string(),
        reason: z.enum(['dont_like_cuisine', 'dont_like_ingredient', 'too_complex', 'had_recently', 'not_in_mood', 'other']),
        details: z.string().optional(),
        ingredientToDislike: z.string().optional(),  // For 'dont_like_ingredient' reason
      }))
      .mutation(...),

    // Audible - swap recipe for emergency replacement
    audible: protectedProcedure
      .input(z.object({
        recipeId: z.string(),
        reason: z.enum(['missing_ingredient', 'time_crunch', 'mood_change', 'other']),
        details: z.string().optional(),
        maxMinutes: z.number().optional(),  // For time_crunch
      }))
      .mutation(...),

    // Update servings for a recipe
    setServings: protectedProcedure
      .input(z.object({
        recipeId: z.string(),
        servings: z.number().min(1),
      }))
      .mutation(...),

    // Reorder recipes in batch
    reorder: protectedProcedure
      .input(z.object({
        recipeIds: z.array(z.string()),  // New order
      }))
      .mutation(...),
  }),

  // Recipe History
  history: router({
    // Get recipe history (paginated)
    list: protectedProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }))
      .query(...),

    // Search history
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(...),

    // Get recently cooked (for avoidance in suggestions)
    getRecent: protectedProcedure
      .input(z.object({ days: z.number().default(14) }))
      .query(...),
  }),

  // Shopping List Generation
  shopping: router({
    // Get ingredients from selected batch recipes
    getIngredients: protectedProcedure
      .input(z.object({
        recipeIds: z.array(z.string()),  // Which recipes to include
      }))
      .query(...),
    // Returns: [{ ingredient, amount, unit, scaledAmount, scaledUnit, fromRecipes, selected }]

    // Add selected ingredients to shopping list
    addToList: protectedProcedure
      .input(z.object({
        listId: z.string(),
        ingredients: z.array(z.object({
          name: z.string(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          category: z.string().optional(),
        })),
      }))
      .mutation(...),
  }),

  // REMOVED: schedule router (no more scheduled suggestions)
});
```

---

## External Skill Integration

### Skill Input Types

The app sends different payloads for different operations:

#### Batch Request Input

```typescript
interface BatchRequestInput {
  // Request type
  type: 'batch';

  // How many recipes to suggest
  count: number;
  mealTypes: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  servings: number;

  // Recent meals (for avoidance - last 14 days from history)
  recentMeals: {
    recipeName: string;
    cuisine: string;
    cookedAt: string;
  }[];

  // Current batch (avoid duplicates)
  currentBatchRecipes: string[];  // Recipe names already in batch

  // Fixed preferences
  preferences: {
    cuisinePreferences: Record<string, { maxPerBatch: number; preference: 'love' | 'like' | 'neutral' | 'avoid' }>;
    dietaryRestrictions: string[];
    quickMealMaxMinutes: number;
    standardMealMaxMinutes: number;
    defaultMaxEffort: number;
  };

  // Ingredient preferences
  ingredientPreferences: {
    ingredient: string;
    preference: 'love' | 'like' | 'neutral' | 'dislike' | 'never';
    notes: string | null;
  }[];

  // Freeform notes
  notes: {
    type: 'general' | 'ingredient' | 'rule' | 'seasonal';
    content: string;
  }[];

  // Context
  context: {
    season: 'spring' | 'summer' | 'fall' | 'winter';
  };
}
```

#### Audible Request Input

```typescript
interface AudibleRequestInput {
  // Request type
  type: 'audible';

  // The recipe being replaced
  originalRecipe: {
    name: string;
    ingredients: { name: string; amount: number; unit: string | null; category: string }[];
    cuisine: string;
  };

  // Why the audible was called
  reason: 'missing_ingredient' | 'time_crunch' | 'mood_change' | 'other';
  details?: string;

  // Constraints
  maxMinutes?: number;  // For time_crunch, otherwise use quick_meal_max

  // Same preferences as batch request
  preferences: { ... };
  ingredientPreferences: { ... };
  notes: { ... };

  // Assumed pantry staples the AI can use
  pantryStaples: string[];  // ['oil', 'salt', 'pepper', 'garlic', 'onion', 'eggs', 'butter', 'flour', ...]
}
```

#### Single Replacement Input (for rejections)

```typescript
interface ReplacementRequestInput {
  // Request type
  type: 'replacement';

  // What's already in the batch (avoid duplicates)
  currentBatchRecipes: string[];

  // Same as batch request but count = 1
  count: 1;
  mealTypes: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  servings: number;

  // All the same preference fields...
  preferences: { ... };
  ingredientPreferences: { ... };
  notes: { ... };
  recentMeals: { ... }[];
  context: { ... };
}
```

### Skill Output

The skill always returns the same structure:

```typescript
interface SkillOutput {
  suggestions: {
    mealType: string;
    recipe: {
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
      effort: number;  // 1-5
      ingredients: {
        name: string;
        amount: number;
        unit: string | null;
        category: string;
        preparation?: string;
        optional?: boolean;
      }[];
      instructions: string[];
      tags?: string[];
    };
  }[];
  reasoning: string;  // Explanation of choices
}
```

### Trigger Methods

**Batch Request (User-Initiated)**:
```typescript
// User clicks "Get Meal Ideas" button
trpc.recipes.batch.request.mutate({
  count: 5,
  mealTypes: ['dinner'],
});
```

**Rejection Replacement (Automatic)**:
```typescript
// When user rejects a recipe, system automatically requests replacement
trpc.recipes.recipes.reject.mutate({
  recipeId: 'recipe-123',
  reason: 'dont_like_ingredient',
  ingredientToDislike: 'cilantro',
});
// → Updates preferences, removes recipe, requests 1 replacement
```

**Audible (User-Initiated)**:
```typescript
// User calls audible on a recipe
trpc.recipes.recipes.audible.mutate({
  recipeId: 'recipe-123',
  reason: 'time_crunch',
  maxMinutes: 20,
});
// → Original marked as audible, replacement generated using remaining ingredients + staples
```

### Pantry Staples (Assumed Available)

For audibles, the AI assumes these staples are available:

```typescript
const PANTRY_STAPLES = [
  // Oils & Fats
  'olive oil', 'vegetable oil', 'butter',
  // Seasonings
  'salt', 'black pepper', 'garlic', 'onion',
  // Basics
  'eggs', 'flour', 'sugar', 'rice', 'pasta',
  // Dairy
  'milk', 'parmesan cheese',
  // Canned/Jarred
  'canned tomatoes', 'chicken broth', 'soy sauce',
  // Aromatics
  'lemon', 'dried herbs',
];
```

---

## WebSocket Events

```typescript
// Server -> Client
'recipes:batch:created'           // { batchId } - New batch created
'recipes:batch:updated'           // { batchId } - Batch state changed
'recipes:recipe:added'            // { batchId, recipe } - New recipe added to batch
'recipes:recipe:completed'        // { batchId, recipeId } - Recipe marked complete
'recipes:recipe:rejected'         // { batchId, recipeId, replacementId } - Recipe rejected, replacement incoming
'recipes:recipe:audible'          // { batchId, originalId, replacementId } - Audible executed
'recipes:shopping:generated'      // { listId, itemCount } - Ingredients added to shopping

// Note: Preferences changes don't need WebSocket (single-user editing)
```

---

## UI Design

### Screens

1. **Main Recipes Page** (`/recipes`) - **PRIMARY SCREEN**
   - Shows active batch of recipes
   - Quick actions per recipe: View, Complete, Audible
   - Visual states: active, completed (grayed), audible (struck + replacement above)
   - "Get Meal Ideas" button (request new batch or add to existing)
   - "New Batch" button (clears completed/audible, rolls over active)
   - AI reasoning display (collapsible)

2. **Recipe Detail** (`/recipes/:id`)
   - Full recipe view (ingredients, instructions)
   - Servings adjustment
   - Complete / Reject / Audible actions
   - Source link

3. **Preferences** (`/recipes/preferences`)
   - Cuisine frequency settings
   - Time/effort constraints
   - Dietary restrictions
   - Ingredient love/hate management
   - Freeform notes editor
   - Batch size default

4. **Shopping Generation** (`/recipes/shop`)
   - Select recipes from batch to include
   - Aggregated ingredient list with checkboxes
   - Quantity adjustment
   - Category grouping
   - "Add to Shopping List" button
   - List selector dropdown

5. **History** (`/recipes/history`)
   - Paginated list of completed recipes
   - Search functionality
   - Click to view recipe details

### Component Hierarchy

```
RecipesModule
├── RecipesPage (main)
│   ├── BatchHeader
│   │   ├── BatchInfo (count, created date)
│   │   ├── GetIdeasButton
│   │   │   └── BatchSizeInput
│   │   └── NewBatchButton
│   │
│   ├── RecipeList
│   │   └── RecipeCard (for each recipe in batch)
│   │       ├── RecipeCardActive
│   │       │   ├── RecipeSummary (name, cuisine, time, effort)
│   │       │   ├── QuickActions
│   │       │   │   ├── ViewButton
│   │       │   │   ├── CompleteButton
│   │       │   │   └── AudibleButton
│   │       │   └── ServingsDisplay
│   │       │
│   │       ├── RecipeCardCompleted
│   │       │   └── (grayed out, same structure)
│   │       │
│   │       └── RecipeCardAudible
│   │           ├── ReplacementRecipe (above, active)
│   │           └── OriginalRecipe (below, struck + grayed)
│   │
│   ├── ReasoningPanel (collapsible)
│   │   └── AI explanation for batch
│   │
│   └── EmptyState
│       └── "Get your first meal ideas" CTA
│
├── RecipeDetailPage
│   ├── RecipeHeader
│   │   ├── Name, Cuisine badge
│   │   ├── TimeEffort (prep, cook, total, effort)
│   │   └── SourceLink
│   ├── ServingsControl
│   ├── IngredientsList
│   │   └── IngredientItem (amount, unit, name, category badge)
│   ├── InstructionsList
│   │   └── InstructionStep (numbered)
│   └── ActionButtons
│       ├── CompleteButton
│       ├── RejectButton → RejectModal
│       └── AudibleButton → AudibleModal
│
├── RejectModal
│   ├── ReasonSelect (dropdown)
│   ├── IngredientSelect (if reason = 'dont_like_ingredient')
│   ├── DetailsInput (optional text)
│   └── ConfirmButton
│
├── AudibleModal
│   ├── ReasonSelect (dropdown)
│   ├── TimeInput (if reason = 'time_crunch')
│   ├── DetailsInput (optional text)
│   └── ConfirmButton
│
├── PreferencesPage
│   ├── CuisinePreferences
│   │   └── CuisineRow (frequency slider, love/avoid toggle)
│   ├── TimeConstraints
│   │   ├── QuickMealSettings
│   │   └── StandardMealSettings
│   ├── DietaryRestrictions
│   │   └── RestrictionChip (toggle)
│   ├── IngredientPreferences
│   │   ├── IngredientSearch
│   │   └── IngredientRow (preference select, notes, source badge)
│   ├── FreeformNotes
│   │   └── NoteCard (type badge, content, source badge, edit/delete)
│   └── BatchSettings
│       └── DefaultBatchSize
│
├── ShoppingGenerationPage
│   ├── RecipeSelector
│   │   └── RecipeCheckbox (select which recipes to include)
│   ├── IngredientList
│   │   └── IngredientRow
│   │       ├── Checkbox
│   │       ├── Name
│   │       ├── ScaledQuantity
│   │       ├── QuantityAdjust
│   │       └── FromRecipes (badges)
│   ├── CategoryHeaders
│   ├── ListSelector
│   └── AddToListButton
│
└── HistoryPage
    ├── SearchInput
    ├── HistoryList
    │   └── HistoryCard
    │       ├── RecipeName
    │       ├── CookedDate
    │       └── Servings
    └── Pagination
```

### Recipe Card States

```
┌────────────────────────────────────────────┐
│  ACTIVE RECIPE                             │
│  ┌──────────────────────────────────────┐  │
│  │ 🍝 Lemon Herb Chicken                │  │
│  │ Mediterranean • 60 min • ⚡⚡⚡       │  │
│  │                                      │  │
│  │ [View] [Complete ✓] [Audible 🔄]    │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  COMPLETED RECIPE (grayed)                 │
│  ┌──────────────────────────────────────┐  │
│  │ ✓ Lemon Herb Chicken                 │  │
│  │ Mediterranean • 60 min • ⚡⚡⚡       │  │
│  │                     (dimmed colors)  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  AUDIBLE RECIPE                            │
│  ┌──────────────────────────────────────┐  │
│  │ 🔄 Quick Garlic Pasta (REPLACEMENT)  │  │
│  │ Italian • 20 min • ⚡                 │  │
│  │ [View] [Complete ✓]                  │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ ̶L̶e̶m̶o̶n̶ ̶H̶e̶r̶b̶ ̶C̶h̶i̶c̶k̶e̶n̶                  │  │
│  │ (struck through, dimmed)             │  │
│  │ Reason: Time crunch                  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

---

## Shopping List Generation

### Flow

1. User selects recipes from active batch to shop for
2. System aggregates all ingredients with scaling
3. User sees ingredient list with checkboxes (all selected by default)
4. User deselects items they already have
5. User can adjust quantities
6. User selects target shopping list
7. User clicks "Add to Shopping List"
8. Items are added to Epic 2 shopping list

### Ingredient Aggregation Logic

```typescript
// Combine same ingredients from multiple recipes
function aggregateIngredients(recipes: BatchRecipe[]): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const recipe of recipes) {
    const recipeData = recipe.recipeData as Recipe;
    const scaleFactor = recipe.servings / recipeData.defaultServings;

    for (const ing of recipeData.ingredients) {
      const key = normalizeIngredient(ing.name);  // "chicken thigh" -> "chicken thighs"
      const scaledAmount = ing.amount * scaleFactor;

      if (map.has(key)) {
        const existing = map.get(key)!;
        // Try to combine amounts (same unit)
        if (existing.unit === ing.unit) {
          existing.totalAmount += scaledAmount;
        } else {
          // Different units - try conversion or keep separate
          const converted = tryConvertUnits(scaledAmount, ing.unit, existing.unit);
          if (converted) {
            existing.totalAmount += converted;
          } else {
            existing.additionalAmounts.push({ amount: scaledAmount, unit: ing.unit });
          }
        }
        existing.fromRecipes.push(recipe.recipeName);
      } else {
        map.set(key, {
          name: ing.name,
          totalAmount: scaledAmount,
          unit: ing.unit,
          category: ing.category,
          additionalAmounts: [],
          fromRecipes: [recipe.recipeName],
          selected: true,
        });
      }
    }
  }

  return Array.from(map.values());
}
```

### Integration with Shopping List (Epic 2)

```typescript
// Add to existing shopping list
trpc.recipes.shopping.addToList.mutate({
  listId: 'list-123',
  ingredients: selectedIngredients.map(ing => ({
    name: ing.name,
    quantity: ing.totalAmount,
    unit: ing.unit,
    category: ing.category,
    note: `From: ${ing.fromRecipes.join(', ')}`,
  })),
});
```

---

## Features Breakdown

### Feature 1: Preferences System
- Fixed preferences (cuisine, time, effort)
- Dietary restrictions
- Ingredient love/hate lists (with source tracking: manual vs rejection feedback)
- Freeform notes (natural language)
- Meal rules (e.g., "one vegetarian per batch")
- Export all preferences for skill
- **NEW**: Automatic preference updates from rejection feedback

### Feature 2: Batch Management & Skill Integration
- Request batch of N suggestions (no date range)
- Batch lifecycle: active → cleared on new batch
- Recipe states: active, completed, audible_original, audible_replacement
- Roll over incomplete recipes to new batch
- Add completed recipes to history on batch clear
- Skill input/output schema
- Error handling for skill failures
- **REMOVED**: Scheduled triggers (manual only)

### Feature 3: Recipe Actions
- Mark recipe as completed (grays out)
- Reject recipe with feedback (reason + details)
- **NEW**: Rejection feedback updates preferences automatically
- **NEW**: Rejection triggers replacement request
- Servings adjustment per recipe
- View recipe details

### Feature 4: Audible System (NEW)
- Call audible on any active recipe
- Select reason: missing ingredient, time crunch, mood change, other
- Add optional details
- AI generates replacement using remaining ingredients + pantry staples
- Original recipe marked as struck through, replacement appears above
- Neither original nor replacement added to history

### Feature 5: Recipe History
- Completed recipes persisted after batch clears
- Paginated history list
- Search functionality
- View past recipe details
- Used for "avoid recently made" in suggestions

### Feature 6: Shopping List Generation
- Select recipes from active batch
- Aggregate ingredients with scaling
- Ingredient-level selection
- Quantity adjustment
- Category grouping
- Add to Epic 2 shopping list

---

## Definition of Done

This epic is complete when:

- [ ] Can configure cuisine, time, and dietary preferences
- [ ] Can manage ingredient love/hate lists
- [ ] Can add/edit/delete freeform preference notes
- [ ] Can export all preferences for external skill
- [ ] Can request a batch of N meal suggestions
- [ ] Can view active batch with recipe cards
- [ ] Can mark recipes as completed (grays out)
- [ ] Can reject recipes with feedback (updates preferences)
- [ ] Can call audible on recipes (generates replacement)
- [ ] Can adjust servings per recipe
- [ ] Can create new batch (clears completed/audible, rolls over active)
- [ ] Completed recipes added to history on batch clear
- [ ] Can view recipe history with search
- [ ] Can generate aggregated ingredient list from selected recipes
- [ ] Can select/deselect ingredients to add
- [ ] Can add selected ingredients to Epic 2 shopping list
- [ ] Real-time sync when batch changes
- [ ] Mobile-friendly UI for all screens

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| External skill unavailable | High | Graceful error, retry mechanism, show error state |
| Skill returns bad data | Medium | Validate against schema, show errors clearly |
| Ingredient aggregation errors | Medium | User can edit quantities before adding |
| Unit conversion failures | Low | Keep original units when conversion unclear |
| Audible generates poor replacement | Medium | User can reject replacement or call another audible |
| Rejection feedback creates bad preferences | Low | User can edit/delete auto-created preferences |

---

## Dependencies

- Epic 1 (Foundation) complete
- Epic 2 (Shopping List) complete (for integration)
- External Claude Code skill (trained separately)
- Recipe history file (`data/recipes/history.json`)

---

## External Skill Notes

The external Claude Code skill will be trained separately with:
- Historical recipe data (your cooking history)
- Recipe sources and patterns
- Cook times and complexity ratings
- Cuisine preferences learned from history

The skill receives preferences + context and returns suggestions. Training the skill is out of scope for this epic.

**New Skill Capabilities**:
- Batch requests (N suggestions at once)
- Single replacement requests (for rejections)
- Audible requests (emergency swaps with ingredient/time constraints)

---

## Features Index

```
docs/epics/4-recipes/features/
├── 1-preferences-system/PLAN.md
├── 2-batch-skill-integration/PLAN.md     # Renamed from external-skill-integration
├── 3-recipe-actions/PLAN.md              # Renamed from suggestion-review
├── 4-audible-system/PLAN.md              # NEW
├── 5-recipe-history/PLAN.md              # NEW (was accepted-meals-view)
└── 6-shopping-list-generation/PLAN.md
```

---

## What Changed from Original Plan

| Original | New |
|----------|-----|
| Date-based meal planning | Batch-based suggestions |
| Calendar view of meals | Simple list of recipes |
| Schedule automatic suggestions | Manual batch requests only |
| Accept/reject suggestions | Complete/reject/audible recipes |
| Accepted meals table | Recipe history table |
| Date range for shopping | Select recipes from batch |
| - | Rejection feedback → preferences |
| - | Audible system for emergency swaps |
| - | Recipe state machine (active/completed/audible) |

---

*Your personal sous chef that knows exactly what you like—and learns from every meal.*
