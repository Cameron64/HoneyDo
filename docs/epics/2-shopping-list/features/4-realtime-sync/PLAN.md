# Feature 2.4: Real-time Sync

> Both users see the same list, instantly.

## Overview

This feature ensures that changes made by one user appear immediately for the other user. When your spouse adds "milk" to the list, it shows up on your phone within a second - no refresh needed.

## Acceptance Criteria

- [ ] Items added by one user appear for others instantly
- [ ] Items updated by one user update for others instantly
- [ ] Items deleted by one user disappear for others instantly
- [ ] Check/uncheck syncs in real-time
- [ ] Offline changes queue and sync when reconnected
- [ ] Conflict resolution handles simultaneous edits
- [ ] Sync indicator shows status

## Technical Details

### Event Types

```typescript
// packages/shared/src/types/shopping-events.ts
export interface ShoppingItemEvent {
  listId: string;
  item: {
    id: string;
    name: string;
    quantity?: string;
    category?: string;
    checked: boolean;
    addedBy?: string;
    addedByUser?: { name: string; avatarUrl?: string };
  };
  userId: string; // Who made the change
}

export interface ShoppingEvents {
  'shopping:item:added': ShoppingItemEvent;
  'shopping:item:updated': ShoppingItemEvent;
  'shopping:item:removed': { listId: string; itemId: string; userId: string };
  'shopping:item:checked': { listId: string; itemId: string; checkedBy: string };
  'shopping:item:unchecked': { listId: string; itemId: string };
  'shopping:items:added': { listId: string; items: ShoppingItem[]; count: number };
  'shopping:items:cleared': { listId: string; clearedCount: number; clearedBy: string };
  'shopping:list:updated': { list: ShoppingList };
  'shopping:list:archived': { listId: string };
}
```

### Server-side Emission

All mutations emit events to other connected users:

```typescript
// apps/api/src/modules/shopping/items.router.ts
import { socketEmitter } from '../../services/websocket/emitter';

add: protectedProcedure
  .input(addItemSchema)
  .mutation(async ({ ctx, input }) => {
    // ... save to database

    // Emit to others (not the sender)
    socketEmitter.toOthers(ctx.userId, 'shopping:item:added', {
      listId: input.listId,
      item: itemWithUser,
      userId: ctx.userId,
    });

    return itemWithUser;
  }),
```

### Client-side Listeners

```typescript
// apps/web/src/modules/shopping/hooks/useShoppingSync.ts
import { useEffect } from 'react';
import { useSocketEvent } from '../../../services/socket/hooks';
import { trpc } from '../../../lib/trpc';
import { useToast } from '../../../hooks/useToast';

export function useShoppingSync(listId: string) {
  const utils = trpc.useUtils();
  const { toast } = useToast();

  // Item added
  useSocketEvent('shopping:item:added', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) => {
      if (!old) return [data.item];
      // Avoid duplicates
      if (old.some(i => i.id === data.item.id)) return old;
      return [...old, data.item];
    });

    // Optional: show notification
    toast({
      description: `${data.item.addedByUser?.name} added "${data.item.name}"`,
    });
  });

  // Item updated
  useSocketEvent('shopping:item:updated', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.map(item =>
        item.id === data.item.id ? { ...item, ...data.item } : item
      )
    );
  });

  // Item removed
  useSocketEvent('shopping:item:removed', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.filter(item => item.id !== data.itemId)
    );
  });

  // Item checked
  useSocketEvent('shopping:item:checked', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.map(item =>
        item.id === data.itemId
          ? { ...item, checked: true, checkedBy: data.checkedBy }
          : item
      )
    );
  });

  // Item unchecked
  useSocketEvent('shopping:item:unchecked', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.map(item =>
        item.id === data.itemId
          ? { ...item, checked: false, checkedBy: null }
          : item
      )
    );
  });

  // Items cleared
  useSocketEvent('shopping:items:cleared', (data) => {
    if (data.listId !== listId) return;

    utils.shopping.items.getByList.setData(listId, (old) =>
      old?.filter(item => !item.checked)
    );

    toast({
      description: `${data.clearedCount} checked items cleared`,
    });
  });
}
```

### Offline Queue

When offline, mutations should be queued and replayed when back online:

```typescript
// apps/web/src/modules/shopping/stores/offline-queue.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface QueuedAction {
  id: string;
  type: 'add' | 'update' | 'remove' | 'check' | 'uncheck';
  payload: unknown;
  timestamp: number;
}

interface OfflineQueueState {
  queue: QueuedAction[];
  isOnline: boolean;
  addToQueue: (action: Omit<QueuedAction, 'id' | 'timestamp'>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  setOnline: (online: boolean) => void;
}

export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      isOnline: navigator.onLine,

      addToQueue: (action) => {
        set((state) => ({
          queue: [...state.queue, {
            ...action,
            id: nanoid(),
            timestamp: Date.now(),
          }],
        }));
      },

      removeFromQueue: (id) => {
        set((state) => ({
          queue: state.queue.filter(a => a.id !== id),
        }));
      },

      clearQueue: () => set({ queue: [] }),

      setOnline: (online) => set({ isOnline: online }),
    }),
    {
      name: 'shopping-offline-queue',
    }
  )
);
```

### Offline-aware Mutations

```typescript
// apps/web/src/modules/shopping/hooks/useOfflineAwareMutation.ts
import { useOfflineQueue } from '../stores/offline-queue';
import { nanoid } from 'nanoid';

export function useOfflineAwareAddItem(listId: string) {
  const { isOnline, addToQueue } = useOfflineQueue();
  const utils = trpc.useUtils();

  const addItem = trpc.shopping.items.add.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
    },
  });

  const addItemOfflineAware = async (input: AddItemInput) => {
    if (isOnline) {
      return addItem.mutateAsync(input);
    }

    // Offline: add to local state and queue
    const tempId = `temp-${nanoid()}`;
    const tempItem = {
      id: tempId,
      ...input,
      checked: false,
      createdAt: new Date().toISOString(),
      _pending: true, // Mark as pending sync
    };

    // Optimistically add to UI
    utils.shopping.items.getByList.setData(listId, (old) =>
      old ? [...old, tempItem] : [tempItem]
    );

    // Queue for later sync
    addToQueue({
      type: 'add',
      payload: { ...input, tempId },
    });

    return tempItem;
  };

  return {
    mutate: addItemOfflineAware,
    isPending: addItem.isPending,
  };
}
```

### Sync on Reconnect

```typescript
// apps/web/src/modules/shopping/hooks/useOfflineSync.ts
import { useEffect } from 'react';
import { useOfflineQueue } from '../stores/offline-queue';
import { trpc } from '../../../lib/trpc';

export function useOfflineSync(listId: string) {
  const { queue, isOnline, removeFromQueue, clearQueue } = useOfflineQueue();
  const utils = trpc.useUtils();

  const addItem = trpc.shopping.items.add.useMutation();
  const updateItem = trpc.shopping.items.update.useMutation();
  const removeItem = trpc.shopping.items.remove.useMutation();
  const checkItem = trpc.shopping.items.check.useMutation();
  const uncheckItem = trpc.shopping.items.uncheck.useMutation();

  useEffect(() => {
    if (!isOnline || queue.length === 0) return;

    const syncQueue = async () => {
      for (const action of queue) {
        try {
          switch (action.type) {
            case 'add':
              await addItem.mutateAsync(action.payload);
              break;
            case 'update':
              await updateItem.mutateAsync(action.payload);
              break;
            case 'remove':
              await removeItem.mutateAsync(action.payload);
              break;
            case 'check':
              await checkItem.mutateAsync(action.payload);
              break;
            case 'uncheck':
              await uncheckItem.mutateAsync(action.payload);
              break;
          }
          removeFromQueue(action.id);
        } catch (error) {
          console.error('Failed to sync action:', action, error);
          // Keep in queue for retry
        }
      }

      // Refresh from server to ensure consistency
      utils.shopping.items.getByList.invalidate(listId);
    };

    syncQueue();
  }, [isOnline, queue.length]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => useOfflineQueue.getState().setOnline(true);
    const handleOffline = () => useOfflineQueue.getState().setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}
```

### Sync Indicator

```tsx
// apps/web/src/modules/shopping/components/SyncIndicator.tsx
import { useOfflineQueue } from '../stores/offline-queue';
import { useSocket } from '../../../services/socket/hooks';
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';

export function SyncIndicator() {
  const { queue, isOnline } = useOfflineQueue();
  const { status } = useSocket();

  const pendingCount = queue.length;

  let Icon = Cloud;
  let color = 'text-green-500';
  let label = 'Synced';

  if (!isOnline) {
    Icon = CloudOff;
    color = 'text-yellow-500';
    label = 'Offline';
  } else if (status !== 'connected') {
    Icon = CloudOff;
    color = 'text-orange-500';
    label = 'Connecting...';
  } else if (pendingCount > 0) {
    Icon = RefreshCw;
    color = 'text-blue-500';
    label = `Syncing ${pendingCount}...`;
  }

  return (
    <div className={cn('flex items-center gap-1 text-xs', color)} title={label}>
      <Icon className={cn('h-3 w-3', pendingCount > 0 && 'animate-spin')} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
```

### Conflict Resolution

When two users edit the same item simultaneously:

```typescript
// apps/api/src/modules/shopping/items.router.ts
update: protectedProcedure
  .input(updateItemSchema.extend({
    expectedVersion: z.string().optional(), // updatedAt timestamp
  }))
  .mutation(async ({ ctx, input }) => {
    const { id, expectedVersion, ...updates } = input;

    // Check for conflicts
    const current = await ctx.db.query.shoppingItems.findFirst({
      where: eq(shoppingItems.id, id),
    });

    if (!current) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // If expectedVersion provided and doesn't match, there's a conflict
    if (expectedVersion && current.updatedAt !== expectedVersion) {
      // For now, last write wins
      // Future: could return conflict and let client decide
      console.log('Conflict detected, last write wins');
    }

    const [updated] = await ctx.db.update(shoppingItems)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(shoppingItems.id, id))
      .returning();

    socketEmitter.toOthers(ctx.userId, 'shopping:item:updated', {
      listId: updated.listId,
      item: updated,
      userId: ctx.userId,
    });

    return updated;
  }),
```

## Implementation Steps

1. **Define Event Types**
   - Shared types package
   - All shopping events

2. **Server-side Emission**
   - Emit from all mutations
   - Use toOthers for changes

3. **Client-side Listeners**
   - Hook for all events
   - Update React Query cache

4. **Offline Queue**
   - Zustand store with persist
   - Queue mutations when offline

5. **Sync on Reconnect**
   - Process queue on online
   - Invalidate cache after sync

6. **Sync Indicator**
   - Show sync status
   - Pending count display

7. **Test Scenarios**
   - Two browsers, add items
   - Offline add, then reconnect
   - Simultaneous edits

## Definition of Done

- [ ] Items sync between two users instantly
- [ ] All CRUD operations emit events
- [ ] Client updates cache on events
- [ ] Offline adds are queued
- [ ] Queue processes on reconnect
- [ ] Sync indicator shows status
- [ ] No duplicate items on sync

## Dependencies

- Feature 1.6 (WebSocket) - socket infrastructure
- Feature 2.2 (Item Management) - items exist

## Notes

- Consider debouncing rapid updates
- Large queues could cause issues - consider limit
- May need conflict UI for complex conflicts (future)
