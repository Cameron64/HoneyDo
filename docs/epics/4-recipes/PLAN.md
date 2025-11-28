# Epic 4: Recipes

> What's for dinner? Solved.

## Overview

The Recipes module closes the loop between planning meals and buying ingredients. It's where you store your favorite recipes, plan your week's meals, and generate shopping lists automatically. Combined with AI, it becomes a personal sous chef that knows what you like, what you have, and what you should make.

**When this epic is complete**, you'll have:
- A personal recipe book with easy import
- Meal planning calendar
- Automatic shopping list generation from meal plans
- AI-powered recipe suggestions and modifications
- Integration with the Shopping List module

---

## User Stories

### Core
- **As a user**, I want to save recipes so I can find them later
- **As a user**, I want to plan meals for the week so I know what to cook
- **As a user**, I want to generate a shopping list from my meal plan
- **As a user**, I want to import recipes from websites I find

### AI Enhancement
- **As a user**, I want to ask "what can I make with chicken and rice?"
- **As a user**, I want to scale a recipe for more servings
- **As a user**, I want substitution suggestions when I'm missing an ingredient
- **As a user**, I want recipe suggestions based on what's in season

---

## Goals

1. **Single Source of Truth** - All our recipes in one place
2. **Reduce Friction** - From "what's for dinner?" to "here's the plan" in minutes
3. **Smart Integration** - Recipes and shopping lists work together
4. **AI Augmented** - Suggestions, scaling, substitutions without manual work

---

## Non-Goals (for this epic)

- Nutritional tracking / calorie counting
- Grocery delivery integration
- Social features (sharing with others outside household)
- Cooking timers / step-by-step mode (future polish)
- Inventory tracking (what's in the pantry) - future module

---

## Data Model

### Tables

```sql
-- Recipes
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,                        -- Where it came from
  source_name TEXT,                       -- "NYT Cooking", "Mom's recipe", etc.
  image_url TEXT,

  -- Timing
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  total_time_minutes INTEGER,

  -- Servings
  servings INTEGER,
  servings_unit TEXT,                     -- "servings", "cookies", "cups", etc.

  -- Content (stored as JSON for flexibility)
  ingredients JSON NOT NULL,              -- Array of ingredient objects
  instructions JSON NOT NULL,             -- Array of step objects

  -- Organization
  tags JSON,                              -- ["quick", "vegetarian", "comfort food"]
  cuisine TEXT,                           -- "Italian", "Mexican", etc.
  category TEXT,                          -- "main", "side", "dessert", "breakfast"
  difficulty TEXT,                        -- "easy", "medium", "hard"

  -- Metadata
  rating INTEGER,                         -- 1-5 stars
  notes TEXT,                             -- Personal notes
  times_made INTEGER DEFAULT 0,
  last_made_at DATETIME,

  -- Ownership
  created_by TEXT REFERENCES users(id),
  is_shared BOOLEAN DEFAULT true,         -- Visible to whole household

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ingredient structure (within JSON)
-- {
--   "name": "chicken breast",
--   "amount": "2",
--   "unit": "lbs",
--   "preparation": "boneless, skinless",
--   "optional": false,
--   "group": "main"  // For grouping in complex recipes
-- }

-- Instruction structure (within JSON)
-- {
--   "step": 1,
--   "text": "Preheat oven to 375°F",
--   "time_minutes": 10,  // Optional
--   "image_url": null    // Optional
-- }

-- Meal Plans
CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL,                -- 'breakfast', 'lunch', 'dinner', 'snack'
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  custom_meal TEXT,                       -- If not from a recipe (e.g., "Leftovers")
  notes TEXT,
  servings_override INTEGER,              -- If different from recipe default
  created_by TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, meal_type)
);

-- Recipe Collections (future, but schema ready)
CREATE TABLE recipe_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_by TEXT REFERENCES users(id),
  is_shared BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipe_collection_items (
  collection_id TEXT REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE CASCADE,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, recipe_id)
);

-- Generated Shopping Lists (from meal plans)
CREATE TABLE meal_plan_shopping_lists (
  id TEXT PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shopping_list_id TEXT REFERENCES shopping_lists(id),
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  generated_by TEXT REFERENCES users(id)
);
```

---

## API Design (tRPC)

```typescript
export const recipesRouter = router({
  // Recipes
  recipes: router({
    getAll: protectedProcedure.query(...),
    getById: protectedProcedure.input(z.string()).query(...),
    search: protectedProcedure.input(searchSchema).query(...),
    create: protectedProcedure.input(createRecipeSchema).mutation(...),
    update: protectedProcedure.input(updateRecipeSchema).mutation(...),
    delete: protectedProcedure.input(z.string()).mutation(...),
    importFromUrl: protectedProcedure.input(z.string().url()).mutation(...),
    recordMade: protectedProcedure.input(z.string()).mutation(...), // Increment times_made
  }),

  // Meal Planning
  mealPlan: router({
    getWeek: protectedProcedure.input(z.date()).query(...), // Gets week containing date
    getRange: protectedProcedure.input(dateRangeSchema).query(...),
    set: protectedProcedure.input(setMealSchema).mutation(...),
    clear: protectedProcedure.input(clearMealSchema).mutation(...),
    generateShoppingList: protectedProcedure.input(dateRangeSchema).mutation(...),
  }),

  // AI Features
  ai: router({
    suggestRecipes: protectedProcedure.input(suggestSchema).query(...),
    parseRecipeFromUrl: protectedProcedure.input(z.string().url()).mutation(...),
    scaleRecipe: protectedProcedure.input(scaleSchema).mutation(...),
    suggestSubstitutions: protectedProcedure.input(substitutionSchema).query(...),
    whatCanIMake: protectedProcedure.input(ingredientsSchema).query(...),
  }),
});
```

---

## WebSocket Events

```typescript
// Server -> Client
'recipes:recipe:created'        // { recipe }
'recipes:recipe:updated'        // { recipe }
'recipes:recipe:deleted'        // { recipeId }
'recipes:meal-plan:updated'     // { date, mealType, meal }
'recipes:shopping-list:generated' // { listId, itemCount }
```

---

## UI Design

### Screens

1. **Recipe List** (Main Screen)
   - Search bar
   - Filter chips (category, cuisine, tags)
   - Recipe cards in grid/list view
   - Quick add button
   - "What can I make?" AI button

2. **Recipe Detail**
   - Hero image
   - Title, source, timing
   - Ingredients list (with checkboxes for cooking)
   - Instructions (step by step)
   - Scale servings control
   - "Add to meal plan" button
   - "I made this" button
   - Edit/delete

3. **Add/Edit Recipe**
   - Manual entry form
   - Import from URL
   - Photo upload
   - Ingredient list builder
   - Instruction list builder
   - Tags and metadata

4. **Meal Planner**
   - Week view (scrollable)
   - Day columns with meal slots
   - Drag recipes to slots
   - "Generate shopping list" button
   - Navigation between weeks

5. **Import Preview**
   - Shows parsed recipe from URL
   - Edit before saving
   - Handle parsing errors gracefully

### Component Hierarchy

```
RecipesPage
├── SearchBar
├── FilterChips
├── RecipeGrid
│   └── RecipeCard
│       ├── Image
│       ├── Title
│       ├── Meta (time, difficulty)
│       └── Tags
└── FloatingActions
    ├── AddRecipeButton
    └── WhatCanIMakeButton

RecipeDetailPage
├── HeroImage
├── RecipeHeader
│   ├── Title
│   ├── Source
│   └── TimingBadges
├── ServingsControl
├── IngredientsSection
│   └── IngredientItem (checkable)
├── InstructionsSection
│   └── InstructionStep
└── ActionBar
    ├── AddToMealPlanButton
    └── IMadeThisButton

MealPlannerPage
├── WeekNavigation
├── WeekGrid
│   └── DayColumn
│       └── MealSlot
│           ├── BreakfastSlot
│           ├── LunchSlot
│           ├── DinnerSlot
│           └── SnackSlot
└── GenerateListButton
```

---

## Recipe Import (AI-Powered)

### Web Scraping + AI Parsing

**Flow**:
1. User pastes URL
2. Backend fetches page HTML
3. Try structured data first (JSON-LD, microdata)
4. Fall back to AI parsing if needed
5. Present parsed recipe for confirmation
6. User edits and saves

**AI Parsing Prompt**:
```
Parse this recipe webpage content into structured data.

Content:
{HTML or text content}

Return JSON:
{
  "name": string,
  "description": string,
  "prepTime": number | null,  // minutes
  "cookTime": number | null,
  "totalTime": number | null,
  "servings": number | null,
  "servingsUnit": string | null,
  "ingredients": [
    {
      "name": string,
      "amount": string | null,
      "unit": string | null,
      "preparation": string | null
    }
  ],
  "instructions": [
    {
      "step": number,
      "text": string
    }
  ],
  "tags": string[],
  "cuisine": string | null,
  "category": string | null,
  "imageUrl": string | null
}

If you cannot parse a field, set it to null. Always return valid JSON.
```

---

## Shopping List Integration

### Generate from Meal Plan

**Flow**:
1. User selects date range (e.g., next week)
2. System collects all recipes in that range
3. Aggregates ingredients (combining duplicates)
4. Creates shopping list with items
5. Links shopping list to meal plan for reference

**Aggregation Logic**:
- Same ingredient name → combine amounts
- Handle unit conversion where possible (2 cups + 1 cup = 3 cups)
- Group by category
- Exclude pantry staples (user-configurable list)

**AI Enhancement**:
- Suggest pantry items that might be running low
- Flag items user might already have
- Recommend quantities based on household size

---

## AI Features

### "What Can I Make?"

**Input**: List of ingredients user has

**Prompt**:
```
Given these ingredients the user has on hand:
{ingredients list}

And these recipes in their collection:
{recipe summaries}

Suggest recipes they can make, prioritizing:
1. Recipes they can make with exactly what they have
2. Recipes needing 1-2 additional items
3. Quick recipes if it's close to mealtime

Return JSON:
{
  "exactMatches": [{ "recipeId": string, "name": string }],
  "almostMatches": [{ "recipeId": string, "name": string, "missing": string[] }],
  "suggestions": [{ "idea": string, "description": string }]  // Not in collection
}
```

### Recipe Scaling

**Input**: Recipe + desired servings

**Prompt**:
```
Scale this recipe from {original} servings to {desired} servings.

Original ingredients:
{ingredients}

Return the scaled ingredients with adjusted amounts. Handle:
- Fractional amounts appropriately (don't say "0.33 eggs")
- Reasonable rounding
- Notes for items that don't scale linearly (like spices)

Return JSON array of ingredients with scaled amounts.
```

### Substitutions

**Input**: Recipe + ingredient to substitute

**Prompt**:
```
The user is making "{recipe name}" but doesn't have "{ingredient}".

Suggest substitutions considering:
- Flavor profile
- Texture
- Availability (common items)
- Dietary restrictions if mentioned

Return JSON:
{
  "substitutions": [
    {
      "replacement": string,
      "amount": string,
      "notes": string  // Any adjustments needed
    }
  ],
  "canOmit": boolean,
  "omitNotes": string | null
}
```

---

## Features Breakdown

### Feature 1: Recipe CRUD
- Create recipe manually
- Edit existing recipes
- Delete recipes
- View recipe list with search
- Filter by tags, cuisine, category
- Rate recipes (1-5 stars)

### Feature 2: Recipe Import
- Import from URL
- AI-powered parsing
- Preview and edit before save
- Handle common recipe sites
- Fallback for unusual formats

### Feature 3: Recipe Detail View
- Full recipe display
- Ingredient checkboxes (for cooking)
- Step-by-step instructions
- Servings scaler
- "I made this" tracking
- Add to meal plan

### Feature 4: Meal Planning
- Week view calendar
- Drag and drop recipes
- Custom meals (not from recipes)
- Servings override
- Week navigation
- Meal type slots (breakfast, lunch, dinner, snack)

### Feature 5: Shopping List Generation
- Select date range
- Aggregate ingredients
- Create linked shopping list
- Edit generated list
- Exclude pantry staples

### Feature 6: AI Features
- "What can I make?" suggestions
- Recipe scaling
- Ingredient substitutions
- Recipe suggestions based on preferences
- Parse recipes from URLs

---

## Definition of Done

This epic is complete when:

- [ ] Can create, edit, delete recipes
- [ ] Can import recipes from URLs
- [ ] Meal planner shows week view
- [ ] Can drag recipes to meal slots
- [ ] Can generate shopping list from meal plan
- [ ] Shopping list items link to source recipes
- [ ] AI can suggest "what can I make"
- [ ] AI can scale recipes
- [ ] Module follows established patterns
- [ ] Real-time sync for meal plan changes

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recipe parsing fails | Medium | Graceful fallback, manual entry always available |
| Ingredient aggregation errors | Medium | User can edit generated list |
| Complex unit conversions | Low | Keep original units when conversion unclear |
| Recipe sites block scraping | Medium | Support common sites, manual entry fallback |

---

## Dependencies

- Epic 1 (Foundation) complete
- Epic 2 (Shopping List) complete (for integration)
- Anthropic API key (for AI features)

---

## Features Index

```
docs/epics/4-recipes/features/
├── 1-recipe-crud/PLAN.md
├── 2-recipe-import/PLAN.md
├── 3-recipe-detail/PLAN.md
├── 4-meal-planning/PLAN.md
├── 5-shopping-list-generation/PLAN.md
└── 6-ai-features/PLAN.md
```

---

*This module turns "what's for dinner?" from a daily stress into a solved problem.*
