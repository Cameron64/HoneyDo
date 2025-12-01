# Recipes Module (Frontend) - Claude Code Instructions

> React components, hooks, and stores for the Meal Planning feature (Epic 4)

## Module Overview

The Recipes module provides an AI-powered meal planning UI with:
- **Preferences management**: Configure cuisines, time constraints, dietary restrictions, ingredients, and freeform rules
- **Suggestion workflow**: Request, review, accept/reject AI-generated meal suggestions
- **Meal calendar**: View and manage accepted meals by date
- **Shopping integration**: Generate aggregated shopping lists from meal ingredients
- **Real-time sync**: WebSocket updates for multi-device coordination

## Module Structure

```
apps/web/src/modules/recipes/
├── CLAUDE.md                    # This file
├── index.ts                     # Public exports
├── components/
│   ├── index.ts                 # Component exports
│   ├── RecipesPage.tsx          # Main landing/dashboard page
│   ├── preferences/             # Preferences management
│   │   ├── PreferencesPage.tsx  # Tabbed preferences container
│   │   ├── TimeConstraints.tsx  # Time/effort settings
│   │   ├── DietaryRestrictions.tsx  # Dietary chip management
│   │   ├── IngredientPreferences.tsx  # Love/hate ingredient lists
│   │   ├── FreeformNotes.tsx    # Natural language rules
│   │   └── ScheduleSettings.tsx # Weekly auto-suggestion config
│   ├── suggestions/             # Suggestion workflow
│   │   ├── SuggestionsPage.tsx  # Review suggestions container
│   │   ├── MealSuggestionCard.tsx  # Individual meal card
│   │   └── RequestSuggestionsDialog.tsx  # Date range picker
│   ├── meals/                   # Meal plan calendar
│   │   ├── MealPlanPage.tsx     # Weekly calendar view
│   │   ├── MealCard.tsx         # Compact meal row
│   │   ├── MealDetailSheet.tsx  # Full recipe details
│   │   └── AudibleDialog.tsx    # Meal swap/replacement dialog
│   └── shopping/                # Shopping list generation
│       ├── ShoppingGenerationPage.tsx  # Ingredient aggregation
│       └── IngredientRow.tsx    # Selectable ingredient row
└── hooks/
    └── use-recipes-sync.ts      # WebSocket event handlers
```

## Component Reference

### RecipesPage

Main landing page with quick access cards and upcoming meals preview.

**Features:**
- Quick action cards for Suggestions, Plan, Shopping, Preferences
- Badge indicators for pending items
- Upcoming meals list (next 7 days)

### PreferencesPage

Tabbed interface for all preference management.

**Tabs:**
- Time: Weeknight/weekend time and effort limits
- Dietary: Restriction chips with custom entry
- Ingredients: Love/like/dislike/never lists
- Notes: Freeform natural language rules
- Schedule: Weekly auto-suggestion configuration

### SuggestionsPage

Review and accept/reject AI-generated meal suggestions.

**Features:**
- Status banners (pending, error, all reviewed)
- Accept All button for bulk acceptance
- Individual meal cards with servings control
- AI reasoning display

### MealSuggestionCard

Individual suggestion with accept/reject controls.

**Features:**
- Quick info (time, effort, cuisine)
- Servings adjustment (+/-)
- Expandable details (ingredients, instructions)
- Visual state (pending, accepted, rejected)

### MealPlanPage

Weekly calendar view of accepted meals.

**Features:**
- This Week/Next Week presets
- Week navigation (prev/next chevrons)
- Day sections with friendly labels (Today, Tomorrow)
- Click to open detail sheet
- Audible (swap) functionality for meal replacement

### AudibleDialog

Dialog for requesting an AI-powered meal replacement (swap feature).

**Features:**
- Reason selection (missing ingredient, time crunch, mood change, other)
- Optional details textarea
- Shows current meal info
- Async processing with success/progress state
- Invalidates relevant queries on completion

### ShoppingGenerationPage

Aggregate and select ingredients for shopping list.

**Features:**
- Select all/none controls
- Category-grouped ingredients
- Quantity adjustment
- List selector dropdown
- Sticky add button

## Hooks Reference

### useRecipesSync

Sets up WebSocket event listeners and updates tRPC cache.

**Handled Events:**

| Event | Handler | Cache Update |
|-------|---------|--------------|
| `recipes:suggestions:received` | `handleSuggestionsReceived` | Invalidate suggestions |
| `recipes:suggestions:updated` | `handleSuggestionsUpdated` | Invalidate suggestions |
| `recipes:suggestions:error` | `handleSuggestionsError` | Invalidate suggestions |
| `recipes:meal:accepted` | `handleMealAccepted` | Invalidate meals |
| `recipes:meal:removed` | `handleMealRemoved` | Invalidate meals |
| `recipes:meal:completed` | `handleMealCompleted` | Invalidate meals |
| `recipes:shopping:generated` | `handleShoppingGenerated` | Invalidate meals |

## tRPC Integration

### Queries

```typescript
// Preferences
trpc.recipes.preferences.get.useQuery()
trpc.recipes.preferences.getIngredients.useQuery()
trpc.recipes.preferences.getNotes.useQuery()

// Suggestions
trpc.recipes.suggestions.getCurrent.useQuery()
trpc.recipes.suggestions.getById.useQuery({ id })

// Meals
trpc.recipes.meals.getRange.useQuery({ start, end })
trpc.recipes.meals.getUpcoming.useQuery({ days: 7 })
trpc.recipes.meals.getPendingShoppingCount.useQuery()

// Shopping
trpc.recipes.shopping.getIngredients.useQuery({ start, end })
trpc.recipes.shopping.getAvailableLists.useQuery()

// Schedule
trpc.recipes.schedule.get.useQuery()
```

### Mutations

```typescript
// Preferences
trpc.recipes.preferences.update.useMutation()
trpc.recipes.preferences.setIngredient.useMutation()
trpc.recipes.preferences.removeIngredient.useMutation()
trpc.recipes.preferences.addNote.useMutation()
trpc.recipes.preferences.updateNote.useMutation()
trpc.recipes.preferences.deleteNote.useMutation()

// Suggestions
trpc.recipes.suggestions.request.useMutation()
trpc.recipes.suggestions.acceptMeal.useMutation()
trpc.recipes.suggestions.rejectMeal.useMutation()
trpc.recipes.suggestions.setServings.useMutation()
trpc.recipes.suggestions.acceptAll.useMutation()

// Meals
trpc.recipes.meals.remove.useMutation()
trpc.recipes.meals.markCompleted.useMutation()
trpc.recipes.meals.audible.useMutation()

// Shopping
trpc.recipes.shopping.addToList.useMutation()

// Schedule
trpc.recipes.schedule.set.useMutation()
trpc.recipes.schedule.enable.useMutation()
trpc.recipes.schedule.disable.useMutation()
trpc.recipes.schedule.triggerNow.useMutation()
```

## URL Routes

```
/recipes                 - Landing/dashboard
/recipes/preferences     - Edit all preferences
/recipes/suggestions     - Review & accept meals
/recipes/plan            - View meal plan by date
/recipes/shop            - Generate & confirm shopping list
```

## Styling Patterns

### Meal Card States

```typescript
<Card className={cn(
  'transition-all',
  isAccepted && 'bg-green-500/5 border-green-500',
  isRejected && 'opacity-50 bg-muted',
)}>
```

### Badge Indicators

```typescript
// New suggestions
{hasNewSuggestions && (
  <Badge variant="default">{pendingSuggestions} new</Badge>
)}

// Pending shopping
{(pendingCount ?? 0) > 0 && (
  <Badge variant="outline" className="border-orange-500 text-orange-600">
    {pendingCount} meals
  </Badge>
)}
```

### Date Formatting

```typescript
function formatMealDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.getTime() === today.getTime()) return 'Today';
  // ...
}
```

## Type Imports

All types are imported from `@honeydo/shared`:

```typescript
import type {
  MealPreferences,
  IngredientPreference,
  MealPreferenceNote,
  MealSuggestions,
  MealSuggestionItem,
  AcceptedMeal,
  AggregatedIngredient,
  MealType,
  NoteType,
  IngredientPreferenceLevel,
} from '@honeydo/shared';
```

## Files to Reference

- Backend API: `apps/api/src/modules/recipes/CLAUDE.md`
- Shared schemas: `packages/shared/src/schemas/recipes.ts`
- Socket hooks: `apps/web/src/services/socket/hooks.ts`
- UI components: `apps/web/src/components/ui/`
- Feature plan: `docs/epics/4-recipes/PLAN.md`
