import { useCallback } from 'react';
import { Trash2, Edit2, MoreVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { useUndoStore } from '../stores/undo';
import { formatItemDisplay } from '../utils/parse-item';
import { CATEGORY_MAP, type ShoppingCategoryId } from '@honeydo/shared';
import { cn } from '@/lib/utils';
import type { ShoppingItem as ShoppingItemType } from '@honeydo/shared';

interface ShoppingItemProps {
  item: ShoppingItemType;
  onEdit?: (item: ShoppingItemType) => void;
}

export function ShoppingItem({ item, onEdit }: ShoppingItemProps) {
  const utils = trpc.useUtils();
  const { pushAction } = useUndoStore();

  const checkItem = trpc.shopping.items.check.useMutation({
    onMutate: async ({ id, checked }) => {
      // Optimistic update
      await utils.shopping.lists.getById.cancel({ id: item.listId });
      const previousData = utils.shopping.lists.getById.getData({ id: item.listId });

      utils.shopping.lists.getById.setData({ id: item.listId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items?.map((i) =>
            i.id === id ? { ...i, checked, checkedAt: checked ? new Date().toISOString() : null } : i
          ),
        };
      });

      // Push undo action
      if (checked) {
        pushAction({
          type: 'check',
          itemId: id,
          listId: item.listId,
          label: `Checked "${item.name}"`,
          data: { previousData },
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.shopping.lists.getById.setData({ id: item.listId }, context.previousData);
      }
    },
    onSettled: () => {
      utils.shopping.lists.getById.invalidate({ id: item.listId });
    },
  });

  const removeItem = trpc.shopping.items.remove.useMutation({
    onMutate: async ({ id }) => {
      await utils.shopping.lists.getById.cancel({ id: item.listId });
      const previousData = utils.shopping.lists.getById.getData({ id: item.listId });

      utils.shopping.lists.getById.setData({ id: item.listId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items?.filter((i) => i.id !== id),
        };
      });

      pushAction({
        type: 'delete',
        itemId: id,
        listId: item.listId,
        label: `Deleted "${item.name}"`,
        data: { item, previousData },
      });

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.shopping.lists.getById.setData({ id: item.listId }, context.previousData);
      }
    },
    onSettled: () => {
      utils.shopping.lists.getById.invalidate({ id: item.listId });
    },
  });

  const handleCheck = useCallback(() => {
    checkItem.mutate({ id: item.id, checked: !item.checked });
  }, [item.id, item.checked, checkItem]);

  const handleDelete = useCallback(() => {
    removeItem.mutate({ id: item.id });
  }, [item.id, removeItem]);

  const handleEdit = useCallback(() => {
    onEdit?.(item);
  }, [item, onEdit]);

  const categoryInfo = item.category ? CATEGORY_MAP[item.category as ShoppingCategoryId] : null;
  const displayText = formatItemDisplay(item.name, item.quantity, item.unit);

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors',
        item.checked && 'bg-muted/50 opacity-60'
      )}
    >
      <Checkbox
        checked={item.checked}
        onCheckedChange={handleCheck}
        disabled={checkItem.isPending}
      />

      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm block truncate',
            item.checked && 'line-through text-muted-foreground'
          )}
        >
          {displayText}
        </span>
        {(item.note || categoryInfo) && (
          <div className="flex items-center gap-2 mt-0.5">
            {categoryInfo && (
              <span className="text-xs text-muted-foreground">{categoryInfo.name}</span>
            )}
            {item.note && (
              <span className="text-xs text-muted-foreground truncate">{item.note}</span>
            )}
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleEdit}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
