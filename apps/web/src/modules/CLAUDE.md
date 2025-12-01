# Frontend Modules - Claude Code Instructions

> Feature module organization for the HoneyDo web app

## Module Philosophy

HoneyDo uses a **feature-based module structure** where each major feature area is self-contained:

- **Co-located code**: Components, hooks, stores, and utils together
- **Module independence**: Modules don't import directly from each other
- **Shared via events**: Cross-module communication through WebSocket events
- **Shared via packages**: Common types and schemas from `@honeydo/shared`

## Module Structure

```
apps/web/src/modules/
├── CLAUDE.md               # This file
├── shopping/               # Shopping List module (Epic 2)
│   ├── CLAUDE.md          # Module-specific instructions
│   ├── index.ts           # Public exports
│   ├── components/        # UI components
│   ├── hooks/             # Custom React hooks
│   ├── stores/            # Zustand stores
│   └── utils/             # Helper functions
├── recipes/                # Recipes module (Epic 4, future)
│   ├── components/
│   ├── hooks/
│   └── stores/
└── home-automation/        # Home Automation module (Epic 3, future)
    ├── components/
    ├── hooks/
    └── stores/
```

## Module vs Global

### Module-specific (`src/modules/<module>/`)

- Components only used by this feature
- Hooks specific to the feature's data
- Stores for feature-local state
- Utils for feature-specific logic

### Global (`src/components/`, `src/hooks/`, `src/stores/`)

- Reusable UI components (layout, common)
- Hooks used across multiple modules
- Global app state (theme, user, connection)

## Creating a New Module

### 1. Create Module Directory

```
src/modules/new-feature/
├── index.ts
├── components/
│   └── index.ts
├── hooks/
│   └── index.ts
└── stores/
    └── index.ts
```

### 2. Create Module Index

```typescript
// src/modules/new-feature/index.ts
export * from './components';
export * from './hooks';
```

### 3. Add Components

```typescript
// src/modules/new-feature/components/index.ts
export { NewFeaturePage } from './NewFeaturePage';
export { NewFeatureList } from './NewFeatureList';
```

### 4. Add Hooks

```typescript
// src/modules/new-feature/hooks/use-new-feature-sync.ts
import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocketEvent } from '@/services/socket/hooks';

export function useNewFeatureSync() {
  const utils = trpc.useUtils();

  const handleCreated = useCallback((data: NewFeature) => {
    utils.newFeature.getAll.setData(undefined, (old) =>
      old ? [...old, data] : [data]
    );
  }, [utils]);

  useSocketEvent('new-feature:created', handleCreated);

  return { /* ... */ };
}
```

### 5. Add Stores

```typescript
// src/modules/new-feature/stores/ui.ts
import { create } from 'zustand';

interface NewFeatureUIStore {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export const useNewFeatureUIStore = create<NewFeatureUIStore>((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}));
```

### 6. Add Route

```typescript
// src/router.tsx
import { NewFeaturePage } from './modules/new-feature';

const newFeatureRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/new-feature',
  component: NewFeaturePage,
});
```

## Module Patterns

### Component Organization

```
components/
├── index.ts              # Export all public components
├── NewFeaturePage.tsx    # Main page component
├── NewFeatureList.tsx    # List display
├── NewFeatureItem.tsx    # Single item
├── NewFeatureForm.tsx    # Create/edit form
└── NewFeatureEmpty.tsx   # Empty state
```

### Hook Naming

| Pattern | Purpose |
|---------|---------|
| `use-feature-sync.ts` | WebSocket real-time sync |
| `use-feature-actions.ts` | Mutations with optimistic updates |
| `use-feature-filters.ts` | Filter/search state |

### Store Naming

| Pattern | Purpose |
|---------|---------|
| `ui.ts` | UI state (selection, filters, view mode) |
| `undo.ts` | Undo/redo action stack |
| `offline-queue.ts` | Offline operation queue |

## Existing Modules

### Shopping Module (`src/modules/shopping/`)

Complete implementation for Epic 2. See `shopping/CLAUDE.md` for details.

**Components:**
- `ShoppingListPage` - Main page with category grouping
- `ShoppingItem` - Individual item with checkbox
- `QuickAddBar` - Quick add input
- `CategorySection` - Collapsible category section
- `ItemEditSheet` - Edit item details
- `SyncIndicator` - Real-time sync status
- `UndoToast` - Undo recent actions

**Hooks:**
- `useShoppingSync` - WebSocket event handlers

**Stores:**
- `undo.ts` - Undo action stack
- `offline-queue.ts` - Offline operation queue

### Home Automation Module (`src/modules/home/`)

Complete implementation for Epic 3. See `home/CLAUDE.md` for details.

**Components:**
- `HomeAutomationPage` - Main page with tabbed interface
- `HAConnectionSettings` - HA URL/token configuration
- `EntityCard` - Single device with toggle

**Hooks:**
- `useHomeSync` - WebSocket event handlers

### Recipes Module (`src/modules/recipes/`)

Complete implementation for Epic 4. See `recipes/CLAUDE.md` for details.

**Components (preferences/):**
- `PreferencesPage` - Tabbed preferences container
- `TimeConstraints` - Time/effort settings
- `DietaryRestrictions` - Dietary chip management
- `IngredientPreferences` - Love/hate ingredient lists
- `FreeformNotes` - Natural language rules
- `ScheduleSettings` - Weekly auto-suggestion config

**Components (suggestions/):**
- `SuggestionsPage` - Review suggestions container
- `MealSuggestionCard` - Individual meal card
- `RequestSuggestionsDialog` - Date range picker

**Components (meals/):**
- `MealPlanPage` - Weekly calendar view
- `MealCard` - Compact meal row
- `MealDetailSheet` - Full recipe details
- `AudibleDialog` - Meal swap/replacement dialog

**Components (shopping/):**
- `ShoppingGenerationPage` - Ingredient aggregation
- `IngredientRow` - Selectable ingredient row

**Hooks:**
- `useRecipesSync` - WebSocket event handlers

## Import Conventions

```typescript
// Within a module - use relative imports
import { ShoppingItem } from './ShoppingItem';
import { useShoppingSync } from '../hooks/use-shopping-sync';
import { useUndoStore } from '../stores/undo';

// From shared - use package import
import { ShoppingItem, SHOPPING_CATEGORIES } from '@honeydo/shared';

// From other parts of the app - use @ alias
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
```

## Module Communication

### Do NOT Import Between Modules

```typescript
// BAD - direct import between modules
import { RecipeList } from '../recipes/components/RecipeList';

// GOOD - communicate via WebSocket events
// In recipes module, emit event when recipe selected
socketEmitter.emit('recipes:recipe:selected', { recipeId });

// In shopping module, listen for event
useSocketEvent('recipes:recipe:selected', handleRecipeSelected);
```

### Use Shared Types

```typescript
// Both modules import from shared package
import { ShoppingItem, Recipe } from '@honeydo/shared';
```

## Testing Modules

```typescript
// src/modules/shopping/components/__tests__/ShoppingItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ShoppingItem } from '../ShoppingItem';

describe('ShoppingItem', () => {
  it('renders item name', () => {
    render(<ShoppingItem item={mockItem} onEdit={jest.fn()} />);
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('calls onEdit when clicked', () => {
    const onEdit = jest.fn();
    render(<ShoppingItem item={mockItem} onEdit={onEdit} />);

    fireEvent.click(screen.getByText('Milk'));
    expect(onEdit).toHaveBeenCalledWith(mockItem);
  });
});
```

## Checklist: Adding a Module

- [ ] Create module directory under `src/modules/`
- [ ] Create `index.ts` with public exports
- [ ] Create `CLAUDE.md` with module-specific instructions
- [ ] Add components in `components/` directory
- [ ] Add hooks in `hooks/` directory if needed
- [ ] Add stores in `stores/` directory if needed
- [ ] Add route in `src/router.tsx`
- [ ] Add navigation in layout (Sidebar, BottomNav)
- [ ] Set up WebSocket sync hook
- [ ] Add to module registry (if using dynamic modules)

## Files to Reference

- Shopping module example: `src/modules/shopping/`
- Router config: `src/router.tsx`
- Global components: `src/components/`
- Shared types: `packages/shared/src/types/`
- Shared schemas: `packages/shared/src/schemas/`
