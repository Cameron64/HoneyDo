# Recipes Module (Frontend) - Claude Code Instructions

> React components, hooks, and stores for the Meal Planning feature (Epic 4)

## Module Overview

The Recipes module provides an AI-powered meal planning UI with:
- **Preferences management**: Configure cuisines, time constraints, dietary restrictions, ingredients, and freeform rules
- **Batch wizard**: Multi-step workflow for meal planning with AI suggestions
- **Suggestion workflow**: Request, review, accept/reject AI-generated meal suggestions
- **Meal calendar**: View and manage accepted meals by date
- **Shopping integration**: Generate aggregated shopping lists from meal ingredients
- **Recipe/batch history**: Browse past meals and suggestion batches
- **Real-time sync**: WebSocket updates for multi-device coordination and activity streaming

## Module Structure

```
apps/web/src/modules/recipes/
├── CLAUDE.md                    # This file
├── index.ts                     # Public exports
├── components/
│   ├── index.ts                 # Component exports
│   ├── RecipesPage.tsx          # Main landing/dashboard page
│   ├── common/                  # Shared recipe components
│   │   └── RecipeDetailSheet.tsx    # Full recipe detail bottom sheet
│   ├── import/                  # Recipe import
│   │   └── RecipeImportSheet.tsx    # Import recipe from URL
│   ├── preferences/             # Preferences management
│   │   ├── PreferencesPage.tsx  # Tabbed preferences container
│   │   ├── TimeConstraints.tsx  # Time/effort settings
│   │   ├── DietaryRestrictions.tsx  # Dietary chip management
│   │   ├── IngredientPreferences.tsx  # Love/hate ingredient lists
│   │   ├── FreeformNotes.tsx    # Natural language rules
│   │   └── ScheduleSettings.tsx # Weekly auto-suggestion config
│   ├── suggestions/             # Suggestion workflow (legacy standalone)
│   │   ├── SuggestionsPage.tsx  # Review suggestions container
│   │   ├── MealSuggestionCard.tsx  # Individual meal card
│   │   └── RequestSuggestionsDialog.tsx  # Date range picker
│   ├── meals/                   # Meal plan calendar
│   │   ├── MealPlanPage.tsx     # Weekly calendar view
│   │   ├── MealCard.tsx         # Compact meal row
│   │   ├── MealDetailSheet.tsx  # Full recipe details
│   │   ├── AudibleDialog.tsx    # Meal swap/replacement dialog
│   │   └── BatchManagementPage.tsx  # Manage active batch meals
│   ├── shopping/                # Shopping list generation
│   │   ├── ShoppingGenerationPage.tsx  # Ingredient aggregation
│   │   └── IngredientRow.tsx    # Selectable ingredient row
│   ├── wizard/                  # Multi-step batch wizard
│   │   ├── NewBatchWizard.tsx   # Main wizard controller
│   │   ├── WizardProgress.tsx   # Step progress indicator
│   │   ├── LibraryPickerSheet.tsx   # Recipe library browser for manual picks
│   │   └── steps/               # Individual step components
│   │       ├── ManageBatchStep.tsx      # Step 1: Handle previous batch
│   │       ├── MealDispositionCard.tsx  # Disposition selector for a meal
│   │       ├── PlanBatchStep.tsx        # Step 2a: Configure meal counts
│   │       ├── ManualPicksStep.tsx      # Step 2b: Manual recipe selection
│   │       ├── GetSuggestionsStep.tsx   # Step 2c: AI suggestion review
│   │       ├── SuggestionProgress.tsx   # Progress indicator for suggestions
│   │       ├── ManageShoppingStep.tsx   # Step 3: Ingredient selection
│   │       └── CompletionStep.tsx       # Step 4: Summary
│   └── history/                 # Recipe/batch history
│       ├── BatchHistoryPage.tsx    # Past batch list
│       └── RecipeHistoryPage.tsx   # Full recipe library
├── hooks/
│   └── use-recipes-sync.ts      # WebSocket event handlers
└── stores/
    └── activity.ts              # AI activity message state
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

### BatchManagementPage

Manage meals in the active batch outside of the wizard.

**Features:**
- View all meals in current batch
- Mark meals as completed
- Remove meals from batch
- Navigate to full meal details

### RecipeDetailSheet (common/)

Reusable bottom sheet for viewing full recipe details.

**Features:**
- Full ingredient list with quantities
- Step-by-step instructions
- Nutrition info (if available)
- Time and effort indicators
- Source attribution with link

### RecipeImportSheet (import/)

Bottom sheet for importing recipes from URLs.

**Features:**
- URL input field
- Auto-extraction using recipe scraper service
- Preview before adding to library
- Error handling for unsupported sites

### ShoppingGenerationPage

Aggregate and select ingredients for shopping list.

**Features:**
- Select all/none controls
- Category-grouped ingredients
- Quantity adjustment
- List selector dropdown
- Sticky add button

## Wizard Components

### NewBatchWizard

Main wizard controller component that manages the 4-step workflow.

**Features:**
- Session management (start/abandon)
- Step navigation via `session.currentStep`
- Real-time sync via `useRecipesSync()`
- Cancel confirmation dialog
- Error/loading states

```typescript
// Route: /recipes/wizard (full-screen layout, no app shell)
function NewBatchWizard() {
  const { data: wizardData } = trpc.recipes.wizard.start.useQuery();
  const session = wizardData?.session;

  const renderStep = () => {
    switch (session.currentStep) {
      case 1: return <ManageBatchStep session={session} onStepComplete={refetch} />;
      case 2: return <GetSuggestionsStep session={session} onStepComplete={refetch} />;
      case 3: return <ManageShoppingStep session={session} onStepComplete={refetch} />;
      case 4: return <CompletionStep session={session} onFinish={handleFinish} />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header>
        <WizardProgress currentStep={session.currentStep} totalSteps={4} />
      </header>
      <main>{renderStep()}</main>
    </div>
  );
}
```

### WizardProgress

Visual step progress indicator.

**Features:**
- Numbered steps with labels
- Active/completed/pending states
- Responsive (icons on mobile, text on larger screens)

### ManageBatchStep (Step 1)

Handle leftover meals from previous batch.

**Features:**
- List of previous batch meals via `MealDispositionCard`
- Disposition selector: Rollover / Completed / Discard
- Complete step button

### MealDispositionCard

Individual meal card with disposition selector.

**Features:**
- Displays meal name, date, and type
- Radio buttons for disposition action
- Visual feedback for selected state

### PlanBatchStep (Step 2a)

Configure how many meals to plan by type.

**Features:**
- Number inputs for each meal type (breakfast, lunch, dinner, snack)
- Shows current target total
- Validates minimum meal count
- Continue to manual picks or AI suggestions

### ManualPicksStep (Step 2b)

Manually select recipes from the library.

**Features:**
- Opens `LibraryPickerSheet` to browse recipes
- List of current manual picks
- Remove picks
- Skip to AI suggestions or complete step

### LibraryPickerSheet

Bottom sheet for browsing and selecting recipes from history.

**Features:**
- Search by name or cuisine
- Filter by tags
- Recipe cards with key info
- Select button to add as manual pick

### GetSuggestionsStep (Step 2c)

Request and review AI suggestions one-by-one.

**Features:**
- Progress indicator via `SuggestionProgress`
- Activity message streaming from AI
- Current suggestion card with accept/decline
- Target count adjustment
- Request more suggestions button
- Hidden pool management

### SuggestionProgress

Visual progress indicator for suggestion acceptance.

**Features:**
- Accepted/target count display
- Progress bar visualization
- Hidden pool count indicator
- Animated progress transitions

**Activity Streaming:**
```typescript
// Listen for real-time activity messages
useSocketEvent('recipes:activity', (data) => {
  setActivityMessage(data.message);
  setProgress(data.progress);
});
```

### ManageShoppingStep (Step 3)

Select ingredients to add to shopping list.

**Features:**
- Aggregated ingredients from accepted meals
- Select all/none controls
- List selector dropdown
- Skip option (don't add to shopping)

### CompletionStep (Step 4)

Summary and finish.

**Features:**
- Batch summary stats
- Accepted meals list
- Shopping list status
- Return to recipes button

## History Components

### BatchHistoryPage

Browse past suggestion batches.

**Features:**
- List of past batches with dates
- Meal count and status
- Click to view batch details

### RecipeHistoryPage

Browse the full recipe library.

**Features:**
- Search by name/cuisine
- Filter by tags
- Recipe cards with key info
- Click for full details

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
| `recipes:activity` | `handleActivity` | Update activity message state |
| `recipes:wizard:step-complete` | `handleStepComplete` | Invalidate wizard session |

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

// Wizard
trpc.recipes.wizard.start.useQuery()
trpc.recipes.wizard.getSession.useQuery()
trpc.recipes.wizard.getCurrentBatchMeals.useQuery()
trpc.recipes.wizard.getSuggestionProgress.useQuery()
trpc.recipes.wizard.getCurrentSuggestion.useQuery()
trpc.recipes.wizard.getShoppingPreview.useQuery()
trpc.recipes.wizard.getExistingLists.useQuery()
trpc.recipes.wizard.getCompletionSummary.useQuery()
trpc.recipes.wizard.getActiveBatch.useQuery()
trpc.recipes.wizard.getBatchHistory.useQuery()

// History
trpc.recipes.history.getRecipes.useQuery()
trpc.recipes.history.getBatches.useQuery()
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

// Wizard
trpc.recipes.wizard.abandon.useMutation()
trpc.recipes.wizard.setMealDispositions.useMutation()
trpc.recipes.wizard.completeStep1.useMutation()
trpc.recipes.wizard.setTargetCount.useMutation()
trpc.recipes.wizard.requestMoreSuggestions.useMutation()
trpc.recipes.wizard.fetchMoreHiddenSuggestions.useMutation()
trpc.recipes.wizard.acceptSuggestion.useMutation()
trpc.recipes.wizard.declineSuggestion.useMutation()
trpc.recipes.wizard.completeStep2.useMutation()
trpc.recipes.wizard.completeStep3.useMutation()
trpc.recipes.wizard.finishWizard.useMutation()
```

## URL Routes

```
/recipes                 - Landing/dashboard
/recipes/wizard          - New batch wizard (full-screen layout)
/recipes/preferences     - Edit all preferences
/recipes/suggestions     - Review & accept meals (legacy)
/recipes/plan            - View meal plan by date
/recipes/shop            - Generate & confirm shopping list
/recipes/history         - Browse recipe library
/recipes/batches         - View past batches
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
