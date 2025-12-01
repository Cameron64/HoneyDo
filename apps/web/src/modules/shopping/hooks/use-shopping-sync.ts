import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocketEvent } from '@/services/socket/hooks';
import type { ShoppingItem, ShoppingList } from '@honeydo/shared';

interface UseShoppingSyncOptions {
  listId?: string;
}

export function useShoppingSync({ listId }: UseShoppingSyncOptions = {}) {
  const utils = trpc.useUtils();

  // Handle list events
  const handleListCreated = useCallback(
    (list: ShoppingList) => {
      utils.shopping.lists.getAll.setData(undefined, (old) =>
        old ? [...old, list] : [list]
      );
    },
    [utils]
  );

  const handleListUpdated = useCallback(
    (list: ShoppingList) => {
      utils.shopping.lists.getAll.setData(undefined, (old) =>
        old?.map((l) => (l.id === list.id ? list : l))
      );
      if (listId && list.id === listId) {
        utils.shopping.lists.getById.setData({ id: listId }, (old) =>
          old ? { ...old, ...list } : undefined
        );
      }
    },
    [utils, listId]
  );

  const handleListArchived = useCallback(
    ({ id }: { id: string }) => {
      utils.shopping.lists.getAll.setData(undefined, (old) =>
        old?.filter((l) => l.id !== id)
      );
    },
    [utils]
  );

  // Handle item events
  const handleItemAdded = useCallback(
    (item: ShoppingItem) => {
      if (!listId || item.listId !== listId) return;
      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old ? [...old, item] : [item]
      );
      // Also update the list view if it includes items
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old ? { ...old, items: [...(old.items ?? []), item] } : undefined
      );
    },
    [utils, listId]
  );

  const handleItemsAdded = useCallback(
    (items: ShoppingItem[]) => {
      if (!listId || items.length === 0 || items[0].listId !== listId) return;
      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old ? [...old, ...items] : items
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old ? { ...old, items: [...(old.items ?? []), ...items] } : undefined
      );
    },
    [utils, listId]
  );

  const handleItemUpdated = useCallback(
    (item: ShoppingItem) => {
      if (!listId || item.listId !== listId) return;
      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old?.map((i) => (i.id === item.id ? item : i))
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old
          ? { ...old, items: old.items?.map((i) => (i.id === item.id ? item : i)) }
          : undefined
      );
    },
    [utils, listId]
  );

  const handleItemRemoved = useCallback(
    ({ id, listId: itemListId }: { id: string; listId: string }) => {
      if (!listId || itemListId !== listId) return;
      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old?.filter((i) => i.id !== id)
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old ? { ...old, items: old.items?.filter((i) => i.id !== id) } : undefined
      );
    },
    [utils, listId]
  );

  const handleItemChecked = useCallback(
    ({
      id,
      listId: itemListId,
      checked,
      checkedBy,
      checkedAt,
    }: {
      id: string;
      listId: string;
      checked: boolean;
      checkedBy: string | null;
      checkedAt: string | null;
    }) => {
      if (!listId || itemListId !== listId) return;
      const updateItem = (item: ShoppingItem) =>
        item.id === id ? { ...item, checked, checkedBy, checkedAt } : item;

      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old?.map(updateItem)
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old ? { ...old, items: old.items?.map(updateItem) } : undefined
      );
    },
    [utils, listId]
  );

  const handleItemsCleared = useCallback(
    ({ listId: itemListId, itemIds }: { listId: string; itemIds: string[] }) => {
      if (!listId || itemListId !== listId) return;
      const idsSet = new Set(itemIds);
      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old?.filter((i) => !idsSet.has(i.id))
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old
          ? { ...old, items: old.items?.filter((i) => !idsSet.has(i.id)) }
          : undefined
      );
    },
    [utils, listId]
  );

  const handleItemsReordered = useCallback(
    ({ listId: itemListId, itemIds }: { listId: string; itemIds: string[] }) => {
      if (!listId || itemListId !== listId) return;
      // Create a map of id -> new sortOrder
      const orderMap = new Map(itemIds.map((id, i) => [id, i]));

      const sortItems = (items: ShoppingItem[]) =>
        items
          .map((item) => ({
            ...item,
            sortOrder: orderMap.get(item.id) ?? item.sortOrder,
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder);

      utils.shopping.items.getByList.setData({ listId }, (old) =>
        old ? sortItems(old) : undefined
      );
      utils.shopping.lists.getById.setData({ id: listId }, (old) =>
        old ? { ...old, items: old.items ? sortItems(old.items) : [] } : undefined
      );
    },
    [utils, listId]
  );

  // Subscribe to socket events
  useSocketEvent('shopping:list:created', handleListCreated);
  useSocketEvent('shopping:list:updated', handleListUpdated);
  useSocketEvent('shopping:list:archived', handleListArchived);
  useSocketEvent('shopping:item:added', handleItemAdded);
  useSocketEvent('shopping:items:added', handleItemsAdded);
  useSocketEvent('shopping:item:updated', handleItemUpdated);
  useSocketEvent('shopping:item:removed', handleItemRemoved);
  useSocketEvent('shopping:item:checked', handleItemChecked);
  useSocketEvent('shopping:items:cleared', handleItemsCleared);
  useSocketEvent('shopping:items:reordered', handleItemsReordered);

  return {
    invalidateList: () => {
      if (listId) {
        utils.shopping.lists.getById.invalidate({ id: listId });
        utils.shopping.items.getByList.invalidate({ listId });
      }
    },
    invalidateAll: () => {
      utils.shopping.lists.getAll.invalidate();
    },
  };
}
