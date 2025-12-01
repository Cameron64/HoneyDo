# Shopping Module (Frontend) - Claude Code Instructions

> React components, hooks, and stores for the Shopping List feature (Epic 2)

## Module Overview

The Shopping module provides a complete shopping list UI with:
- **Category-grouped display**: Items organized by store section
- **Real-time sync**: WebSocket updates from other household members
- **Optimistic updates**: Instant UI feedback with rollback on error
- **Undo support**: 30-second undo window for destructive actions
- **Offline queue**: Pending operations for offline support (future)

## Module Structure

```
apps/web/src/modules/shopping/
├── CLAUDE.md                    # This file
├── index.ts                     # Public exports
├── components/
│   ├── index.ts                # Component exports
│   ├── ShoppingListPage.tsx    # Main page component
│   ├── ShoppingItem.tsx        # Individual item row
│   ├── QuickAddBar.tsx         # Add item input
│   ├── CategorySection.tsx     # Collapsible category group
│   ├── ItemEditSheet.tsx       # Edit item sheet/modal
│   ├── SyncIndicator.tsx       # Real-time sync status
│   └── UndoToast.tsx           # Undo action toast
├── hooks/
│   └── use-shopping-sync.ts    # WebSocket event handlers
├── stores/
│   ├── undo.ts                 # Undo action stack
│   └── offline-queue.ts        # Offline operation queue
└── utils/
    └── parse-item.ts           # Item display formatting
```

## Component Reference

### ShoppingListPage

Main page component that renders the entire shopping list experience.

**Features:**
- Fetches default list via `trpc.shopping.lists.getDefault`
- Groups unchecked items by category
- Collapsible section for checked items
- "Clear all" button to remove checked items
- Edit sheet for item details

**Key State:**
```typescript
const [editItem, setEditItem] = useState<ShoppingItemType | null>(null);
const [showChecked, setShowChecked] = useState(true);
```

**tRPC Usage:**
```typescript
const { data: list, isLoading } = trpc.shopping.lists.getDefault.useQuery();
useShoppingSync({ listId: list?.id });
```

### ShoppingItem

Individual item row with check/uncheck functionality.

**Props:**
```typescript
interface ShoppingItemProps {
  item: ShoppingItem;
  onEdit: (item: ShoppingItem) => void;
}
```

**Features:**
- Checkbox for check/uncheck
- Swipe to delete (mobile)
- Click to edit
- Shows quantity, unit, and note
- Visual distinction for checked items

### QuickAddBar

Input for quickly adding items to the list.

**Props:**
```typescript
interface QuickAddBarProps {
  listId: string;
}
```

**Features:**
- Single input field
- Auto-categorization on submit
- AI expansion for vague items (future)
- Keyboard submit (Enter)

### CategorySection

Collapsible section grouping items by category.

**Props:**
```typescript
interface CategorySectionProps {
  categoryId: ShoppingCategoryId | 'uncategorized';
  items: ShoppingItem[];
  onEditItem: (item: ShoppingItem) => void;
}
```

**Features:**
- Category icon and name from `SHOPPING_CATEGORIES`
- Item count badge
- Collapsible content
- Store order sorting

### ItemEditSheet

Bottom sheet for editing item details.

**Props:**
```typescript
interface ItemEditSheetProps {
  item: ShoppingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Features:**
- Name, quantity, unit, category, note fields
- Category dropdown with all categories
- Unit dropdown with common units
- Delete button with confirmation

### SyncIndicator

Shows real-time sync status.

**States:**
- Connected (green dot)
- Syncing (animated)
- Disconnected (red dot)
- Offline (yellow dot)

### UndoToast

Toast notification for undoable actions.

**Features:**
- Shows most recent action
- "Undo" button
- Auto-dismiss after 30 seconds
- Stacked for multiple actions

## Hooks Reference

### useShoppingSync

Sets up WebSocket event listeners and updates tRPC cache.

**Usage:**
```typescript
const { invalidateList, invalidateAll } = useShoppingSync({ listId: 'abc123' });
```

**Handled Events:**

| Event | Handler | Cache Update |
|-------|---------|--------------|
| `shopping:list:created` | `handleListCreated` | Add to `lists.getAll` |
| `shopping:list:updated` | `handleListUpdated` | Update in `lists.getAll` and `lists.getById` |
| `shopping:list:archived` | `handleListArchived` | Remove from `lists.getAll` |
| `shopping:item:added` | `handleItemAdded` | Add to `items.getByList` and `lists.getById` |
| `shopping:items:added` | `handleItemsAdded` | Add multiple items |
| `shopping:item:updated` | `handleItemUpdated` | Update item in cache |
| `shopping:item:removed` | `handleItemRemoved` | Remove from cache |
| `shopping:item:checked` | `handleItemChecked` | Update check state |
| `shopping:items:cleared` | `handleItemsCleared` | Remove checked items |
| `shopping:items:reordered` | `handleItemsReordered` | Update sortOrder |

**Pattern:**
```typescript
const handleItemAdded = useCallback((item: ShoppingItem) => {
  if (!listId || item.listId !== listId) return;

  utils.shopping.items.getByList.setData({ listId }, (old) =>
    old ? [...old, item] : [item]
  );

  utils.shopping.lists.getById.setData({ id: listId }, (old) =>
    old ? { ...old, items: [...(old.items ?? []), item] } : undefined
  );
}, [utils, listId]);

useSocketEvent('shopping:item:added', handleItemAdded);
```

## Stores Reference

### useUndoStore

Zustand store for undo functionality.

**State:**
```typescript
interface UndoAction {
  id: string;
  type: 'check' | 'uncheck' | 'delete' | 'clear';
  itemId?: string;
  itemIds?: string[];
  listId: string;
  timestamp: number;
  label: string;
  data?: unknown; // Previous state for restore
}
```

**Actions:**
```typescript
const { pushAction, popAction, getLatest, clearExpired } = useUndoStore();

// Push an undoable action
const id = pushAction({
  type: 'delete',
  itemId: item.id,
  listId: list.id,
  label: `Deleted ${item.name}`,
  data: { item },
});

// Pop and perform undo
const action = popAction(id);
if (action?.type === 'delete') {
  // Restore the item
}
```

**Configuration:**
- `UNDO_TIMEOUT = 30000` (30 seconds)
- `MAX_ACTIONS = 10`
- Auto-expires after timeout

### useOfflineQueueStore (Future)

Zustand store for offline operation queueing.

```typescript
interface OfflineOperation {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

interface OfflineQueueStore {
  operations: OfflineOperation[];
  addOperation: (op: Omit<OfflineOperation, 'id' | 'timestamp'>) => void;
  removeOperation: (id: string) => void;
  processQueue: () => Promise<void>;
}
```

## tRPC Integration

### Queries

```typescript
// Get default list with items
const { data: list } = trpc.shopping.lists.getDefault.useQuery();

// Get specific list
const { data: list } = trpc.shopping.lists.getById.useQuery({ id: listId });

// Get all lists
const { data: lists } = trpc.shopping.lists.getAll.useQuery();

// Get frequent items for suggestions
const { data: frequent } = trpc.shopping.items.getFrequent.useQuery({ limit: 10 });

// Get AI suggestions
const { data: suggestions } = trpc.shopping.ai.suggest.useQuery({
  currentItems: items.map(i => i.name),
});
```

### Mutations with Optimistic Updates

```typescript
const utils = trpc.useUtils();

const checkItem = trpc.shopping.items.check.useMutation({
  onMutate: async ({ id, checked }) => {
    // Cancel outgoing refetches
    await utils.shopping.lists.getById.cancel({ id: listId });

    // Snapshot previous value
    const previous = utils.shopping.lists.getById.getData({ id: listId });

    // Optimistically update
    utils.shopping.lists.getById.setData({ id: listId }, (old) => ({
      ...old!,
      items: old!.items.map((item) =>
        item.id === id ? { ...item, checked } : item
      ),
    }));

    return { previous };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    if (context?.previous) {
      utils.shopping.lists.getById.setData({ id: listId }, context.previous);
    }
  },
  onSettled: () => {
    // Refetch after error or success
    utils.shopping.lists.getById.invalidate({ id: listId });
  },
});
```

### Mutation with Undo Support

```typescript
const { pushAction } = useUndoStore();

const deleteItem = trpc.shopping.items.remove.useMutation({
  onMutate: async ({ id }) => {
    const list = utils.shopping.lists.getById.getData({ id: listId });
    const item = list?.items.find((i) => i.id === id);

    if (item) {
      pushAction({
        type: 'delete',
        itemId: id,
        listId,
        label: `Deleted ${item.name}`,
        data: { item },
      });
    }

    // Optimistic update...
  },
});
```

## Categories and Sorting

### Category Constants

```typescript
import { SHOPPING_CATEGORIES, CATEGORY_MAP, type ShoppingCategoryId } from '@honeydo/shared';

// SHOPPING_CATEGORIES is ordered by typical store layout:
// produce → bakery → deli → meat → dairy → frozen → pantry → snacks → beverages → household → personal → other
```

### Grouping Items by Category

```typescript
const { uncheckedByCategory, checkedItems } = useMemo(() => {
  const unchecked = items.filter((item) => !item.checked);
  const checked = items.filter((item) => item.checked);

  const byCategory = new Map<ShoppingCategoryId | 'uncategorized', ShoppingItem[]>();

  // Initialize in store order
  SHOPPING_CATEGORIES.forEach((cat) => {
    byCategory.set(cat.id, []);
  });
  byCategory.set('uncategorized', []);

  // Distribute items
  unchecked.forEach((item) => {
    const category = item.category || 'uncategorized';
    byCategory.get(category)?.push(item);
  });

  // Remove empty categories
  byCategory.forEach((items, key) => {
    if (items.length === 0) byCategory.delete(key);
  });

  return { uncheckedByCategory: byCategory, checkedItems: checked };
}, [items]);
```

## Styling Patterns

### Item States

```typescript
<div className={cn(
  'flex items-center gap-3 p-3 rounded-lg border',
  item.checked && 'bg-muted/50 opacity-60',
  !item.checked && 'bg-card',
)}>
```

### Category Headers

```typescript
<CollapsibleTrigger className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
  <span className="font-medium text-sm">{category.name}</span>
  <Badge variant="secondary">{items.length}</Badge>
</CollapsibleTrigger>
```

### Responsive Layout

```typescript
// Mobile-first design
<div className="flex flex-col h-full">
  {/* Sticky header */}
  <div className="sticky top-0 bg-background z-10 border-b p-4">
    <QuickAddBar />
  </div>

  {/* Scrollable content */}
  <div className="flex-1 overflow-auto p-4">
    {/* Items */}
  </div>
</div>
```

## Testing

```typescript
// components/__tests__/ShoppingItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ShoppingItem } from '../ShoppingItem';
import { mockItem } from '@/test/fixtures';

describe('ShoppingItem', () => {
  it('renders item name and quantity', () => {
    render(<ShoppingItem item={mockItem} onEdit={jest.fn()} />);

    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('2 gallons')).toBeInTheDocument();
  });

  it('shows checked state visually', () => {
    const checkedItem = { ...mockItem, checked: true };
    const { container } = render(
      <ShoppingItem item={checkedItem} onEdit={jest.fn()} />
    );

    expect(container.firstChild).toHaveClass('opacity-60');
  });

  it('calls check mutation on checkbox click', async () => {
    const { user } = renderWithProviders(
      <ShoppingItem item={mockItem} onEdit={jest.fn()} />
    );

    await user.click(screen.getByRole('checkbox'));

    // Assert mutation was called
  });
});
```

## Files to Reference

- Backend API: `apps/api/src/modules/shopping/CLAUDE.md`
- Shared schemas: `packages/shared/src/schemas/shopping.ts`
- Categories: `packages/shared/src/constants/categories.ts`
- Socket hooks: `apps/web/src/services/socket/hooks.ts`
- UI components: `apps/web/src/components/ui/`
- Feature plan: `docs/epics/2-shopping-list/PLAN.md`
