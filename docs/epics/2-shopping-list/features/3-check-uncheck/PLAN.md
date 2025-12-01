# Feature 2.3: Check/Uncheck Flow

> Mark items as done. Clear what you've got.

## Overview

This feature implements the check/uncheck flow - the core interaction when shopping. Tap an item to check it off, see it move to the bottom dimmed, clear all checked items when done.

## Acceptance Criteria

- [ ] Tap item to check it off
- [ ] Checked items move to "Checked" section (bottom)
- [ ] Checked items are dimmed with strikethrough
- [ ] Track who checked the item and when
- [ ] Tap checked item to uncheck
- [ ] "Clear checked" button removes all checked items
- [ ] Undo for accidental checks (within session)
- [ ] Real-time sync of check state

## Technical Details

### tRPC Routes

```typescript
// apps/api/src/modules/shopping/items.router.ts
export const itemsRouter = router({
  // ... other routes

  // Check item
  check: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(shoppingItems)
        .set({
          checked: true,
          checkedAt: new Date().toISOString(),
          checkedBy: ctx.userId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingItems.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      socketEmitter.toOthers(ctx.userId, 'shopping:item:checked', {
        listId: updated.listId,
        itemId: input.id,
        checkedBy: ctx.userId,
      });

      return updated;
    }),

  // Uncheck item
  uncheck: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(shoppingItems)
        .set({
          checked: false,
          checkedAt: null,
          checkedBy: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingItems.id, input))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      socketEmitter.toOthers(ctx.userId, 'shopping:item:unchecked', {
        listId: updated.listId,
        itemId: input,
      });

      return updated;
    }),

  // Clear all checked items
  clearChecked: protectedProcedure
    .input(z.string()) // listId
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db.delete(shoppingItems)
        .where(and(
          eq(shoppingItems.listId, input),
          eq(shoppingItems.checked, true)
        ))
        .returning({ id: shoppingItems.id });

      socketEmitter.toHousehold('shopping:items:cleared', {
        listId: input,
        clearedCount: deleted.length,
        clearedBy: ctx.userId,
      });

      return { clearedCount: deleted.length };
    }),
});
```

### Undo System

Track recently checked items for undo capability:

```typescript
// apps/web/src/modules/shopping/stores/undo.ts
import { create } from 'zustand';

interface UndoAction {
  type: 'check' | 'delete';
  itemId: string;
  listId: string;
  item: ShoppingItem; // Full item data for restoration
  timestamp: number;
}

interface UndoState {
  actions: UndoAction[];
  addAction: (action: Omit<UndoAction, 'timestamp'>) => void;
  popAction: () => UndoAction | undefined;
  clearOld: () => void;
}

const UNDO_TIMEOUT = 30 * 1000; // 30 seconds

export const useUndoStore = create<UndoState>((set, get) => ({
  actions: [],

  addAction: (action) => {
    set((state) => ({
      actions: [...state.actions, { ...action, timestamp: Date.now() }].slice(-10),
    }));
  },

  popAction: () => {
    const actions = get().actions;
    const latest = actions[actions.length - 1];

    if (latest && Date.now() - latest.timestamp < UNDO_TIMEOUT) {
      set({ actions: actions.slice(0, -1) });
      return latest;
    }

    return undefined;
  },

  clearOld: () => {
    set((state) => ({
      actions: state.actions.filter(
        (a) => Date.now() - a.timestamp < UNDO_TIMEOUT
      ),
    }));
  },
}));
```

### UI Components

#### Item List with Sections
```tsx
// apps/web/src/modules/shopping/components/ItemList.tsx
import { useMemo } from 'react';
import { ShoppingItem } from './ShoppingItem';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface ItemListProps {
  items: ShoppingItem[];
  listId: string;
  onEditItem: (item: ShoppingItem) => void;
}

export function ItemList({ items, listId, onEditItem }: ItemListProps) {
  const { unchecked, checked } = useMemo(() => ({
    unchecked: items.filter(i => !i.checked),
    checked: items.filter(i => i.checked),
  }), [items]);

  return (
    <div className="space-y-2">
      {/* Unchecked items */}
      {unchecked.map((item) => (
        <ShoppingItem
          key={item.id}
          item={item}
          listId={listId}
          onEdit={() => onEditItem(item)}
        />
      ))}

      {/* Empty state */}
      {unchecked.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <p>Your list is empty!</p>
          <p className="text-sm">Add some items above</p>
        </div>
      )}

      {/* Checked items section */}
      {checked.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground">
            <span>Checked ({checked.length})</span>
            <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              {checked.map((item) => (
                <ShoppingItem
                  key={item.id}
                  item={item}
                  listId={listId}
                  onEdit={() => onEditItem(item)}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
```

#### Clear Checked Button
```tsx
// apps/web/src/modules/shopping/components/ClearCheckedButton.tsx
import { trpc } from '../../../lib/trpc';
import { Button } from '../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

interface ClearCheckedButtonProps {
  listId: string;
  checkedCount: number;
}

export function ClearCheckedButton({ listId, checkedCount }: ClearCheckedButtonProps) {
  const utils = trpc.useUtils();
  const clearChecked = trpc.shopping.items.clearChecked.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
    },
  });

  if (checkedCount === 0) {
    return null;
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Clear {checkedCount} checked
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear checked items?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {checkedCount} checked items from the list.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => clearChecked.mutate(listId)}>
            Clear items
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

#### Undo Toast
```tsx
// apps/web/src/modules/shopping/components/UndoToast.tsx
import { useEffect, useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { useUndoStore } from '../stores/undo';
import { Button } from '../../../components/ui/button';
import { Undo2 } from 'lucide-react';

export function UndoToast() {
  const [visible, setVisible] = useState(false);
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const { actions, popAction } = useUndoStore();

  const utils = trpc.useUtils();
  const uncheckItem = trpc.shopping.items.uncheck.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(lastAction?.listId);
    },
  });

  useEffect(() => {
    if (actions.length > 0) {
      setLastAction(actions[actions.length - 1]);
      setVisible(true);

      const timeout = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [actions]);

  const handleUndo = () => {
    const action = popAction();
    if (action?.type === 'check') {
      uncheckItem.mutate(action.itemId);
    }
    setVisible(false);
  };

  if (!visible || !lastAction) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-4 md:left-auto md:right-4 md:w-80">
      <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-lg">
        <span className="text-sm">
          {lastAction.type === 'check' && `Checked "${lastAction.item.name}"`}
        </span>
        <Button variant="ghost" size="sm" onClick={handleUndo}>
          <Undo2 className="mr-1 h-4 w-4" />
          Undo
        </Button>
      </div>
    </div>
  );
}
```

### Optimistic Check Handling

```tsx
// In ShoppingItem component
const checkItem = trpc.shopping.items.check.useMutation({
  onMutate: async ({ id }) => {
    // Cancel any outgoing refetches
    await utils.shopping.items.getByList.cancel(listId);

    // Snapshot previous value
    const prev = utils.shopping.items.getByList.getData(listId);

    // Optimistically update
    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.map(item =>
        item.id === id
          ? { ...item, checked: true, checkedAt: new Date().toISOString() }
          : item
      )
    );

    // Add to undo store
    const item = prev?.find(i => i.id === id);
    if (item) {
      useUndoStore.getState().addAction({
        type: 'check',
        itemId: id,
        listId,
        item,
      });
    }

    return { prev };
  },
  onError: (err, vars, ctx) => {
    // Rollback on error
    if (ctx?.prev) {
      utils.shopping.items.getByList.setData(listId, ctx.prev);
    }
  },
  onSettled: () => {
    // Refetch after mutation
    utils.shopping.items.getByList.invalidate(listId);
  },
});
```

### Real-time Check Sync

```tsx
// apps/web/src/modules/shopping/hooks/useShoppingSync.ts
import { useSocketEvent } from '../../../services/socket/hooks';
import { trpc } from '../../../lib/trpc';

export function useShoppingSync(listId: string) {
  const utils = trpc.useUtils();

  useSocketEvent('shopping:item:checked', (data) => {
    if (data.listId === listId) {
      utils.shopping.items.getByList.setData(listId, (old) =>
        old?.map(item =>
          item.id === data.itemId
            ? { ...item, checked: true, checkedBy: data.checkedBy }
            : item
        )
      );
    }
  });

  useSocketEvent('shopping:item:unchecked', (data) => {
    if (data.listId === listId) {
      utils.shopping.items.getByList.setData(listId, (old) =>
        old?.map(item =>
          item.id === data.itemId
            ? { ...item, checked: false, checkedBy: null }
            : item
        )
      );
    }
  });

  useSocketEvent('shopping:items:cleared', (data) => {
    if (data.listId === listId) {
      utils.shopping.items.getByList.setData(listId, (old) =>
        old?.filter(item => !item.checked)
      );
    }
  });
}
```

## Implementation Steps

1. **Add tRPC Routes**
   - check mutation
   - uncheck mutation
   - clearChecked mutation

2. **Create Undo Store**
   - Track recent actions
   - Time-limited undo window

3. **Build UI Components**
   - ItemList with sections
   - ClearCheckedButton with confirmation
   - UndoToast

4. **Implement Optimistic Updates**
   - Instant check/uncheck
   - Rollback on error
   - Store previous state for undo

5. **Add Real-time Sync**
   - Listen for check events
   - Update local state

6. **Test Flow**
   - Check items
   - Verify section separation
   - Test undo within window
   - Test clear checked

## Definition of Done

- [ ] Tap to check works
- [ ] Checked items move to bottom section
- [ ] Checked items are dimmed/strikethrough
- [ ] Who checked is tracked
- [ ] Tap again to uncheck
- [ ] Clear checked removes all checked
- [ ] Undo works within 30 seconds
- [ ] Real-time sync for check state

## Dependencies

- Feature 2.2 (Item Management) - items exist
- Feature 1.6 (WebSocket) - real-time sync

## Notes

- Consider animation for check/uncheck
- Sound feedback option (future)
- Badge on clear button showing count
