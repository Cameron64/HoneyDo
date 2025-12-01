import { useState, useMemo } from 'react';
import { ShoppingCart, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { QuickAddBar } from './QuickAddBar';
import { ShoppingItem } from './ShoppingItem';
import { CategorySection } from './CategorySection';
import { ItemEditSheet } from './ItemEditSheet';
import { UndoToast } from './UndoToast';
import { SyncIndicator } from './SyncIndicator';
import { useShoppingSync } from '../hooks/use-shopping-sync';
import { useUndoStore } from '../stores/undo';
import { SHOPPING_CATEGORIES, type ShoppingCategoryId } from '@honeydo/shared';
import type { ShoppingItem as ShoppingItemType } from '@honeydo/shared';

export function ShoppingListPage() {
  const [editItem, setEditItem] = useState<ShoppingItemType | null>(null);
  const [showChecked, setShowChecked] = useState(true);

  // Fetch default list with items
  const { data: list, isLoading, error } = trpc.shopping.lists.getDefault.useQuery();

  // Set up real-time sync
  useShoppingSync({ listId: list?.id });

  const utils = trpc.useUtils();
  const { pushAction } = useUndoStore();

  const clearChecked = trpc.shopping.items.clearChecked.useMutation({
    onMutate: async () => {
      if (!list) return;
      const checkedItems = list.items?.filter((item) => item.checked) ?? [];
      if (checkedItems.length === 0) return;

      pushAction({
        type: 'clear',
        listId: list.id,
        itemIds: checkedItems.map((item) => item.id),
        label: `Cleared ${checkedItems.length} items`,
        data: { items: checkedItems },
      });
    },
    onSuccess: () => {
      if (list) {
        utils.shopping.lists.getById.invalidate({ id: list.id });
        utils.shopping.lists.getDefault.invalidate();
      }
    },
  });

  // Group items by category and checked status
  const { uncheckedByCategory, checkedItems } = useMemo(() => {
    if (!list?.items) {
      return { uncheckedByCategory: new Map(), checkedItems: [] };
    }

    const unchecked = list.items.filter((item) => !item.checked);
    const checked = list.items.filter((item) => item.checked);

    // Group unchecked by category
    const byCategory = new Map<ShoppingCategoryId | 'uncategorized', ShoppingItemType[]>();

    // Initialize with all categories in store order
    SHOPPING_CATEGORIES.forEach((cat) => {
      byCategory.set(cat.id, []);
    });
    byCategory.set('uncategorized', []);

    // Distribute items
    unchecked.forEach((item) => {
      const category = (item.category as ShoppingCategoryId) || 'uncategorized';
      const existing = byCategory.get(category) ?? [];
      byCategory.set(category, [...existing, item]);
    });

    // Remove empty categories
    byCategory.forEach((items, key) => {
      if (items.length === 0) {
        byCategory.delete(key);
      }
    });

    return { uncheckedByCategory: byCategory, checkedItems: checked };
  }, [list?.items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-destructive mb-2">Error loading shopping list</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No shopping list found</p>
      </div>
    );
  }

  const totalItems = list.items?.length ?? 0;
  const uncheckedCount = list.items?.filter((item) => !item.checked).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">{list.name}</h1>
              <p className="text-sm text-muted-foreground">
                {uncheckedCount} of {totalItems} items remaining
              </p>
            </div>
            <SyncIndicator />
          </div>
          <QuickAddBar listId={list.id} />
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">Your list is empty</p>
            <p className="text-sm text-muted-foreground">
              Add items above to get started
            </p>
          </div>
        ) : (
          <>
            {/* Unchecked items by category */}
            {Array.from(uncheckedByCategory.entries()).map(([category, items]) => (
              <CategorySection
                key={category}
                categoryId={category}
                items={items}
                onEditItem={setEditItem}
              />
            ))}

            {/* Checked items section */}
            {checkedItems.length > 0 && (
              <Collapsible open={showChecked} onOpenChange={setShowChecked}>
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                    {showChecked ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm text-muted-foreground">
                      Checked
                    </span>
                    <Badge variant="secondary">{checkedItems.length}</Badge>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearChecked.mutate({ listId: list.id })}
                    disabled={clearChecked.isPending}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear all
                  </Button>
                </div>
                <CollapsibleContent className="space-y-2 pt-2">
                  {checkedItems.map((item) => (
                    <ShoppingItem key={item.id} item={item} onEdit={setEditItem} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      {/* Edit sheet */}
      <ItemEditSheet
        item={editItem}
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
      />

      {/* Undo toast */}
      <UndoToast />
    </div>
  );
}
