import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCheck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingItem } from './ShoppingItem';
import { trpc } from '@/lib/trpc';
import { CATEGORY_MAP, type ShoppingCategoryId } from '@honeydo/shared';
import type { ShoppingItem as ShoppingItemType } from '@honeydo/shared';

interface CategorySectionProps {
  categoryId: ShoppingCategoryId | 'uncategorized';
  items: ShoppingItemType[];
  onEditItem?: (item: ShoppingItemType) => void;
  defaultOpen?: boolean;
}

export function CategorySection({
  categoryId,
  items,
  onEditItem,
  defaultOpen = true,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const utils = trpc.useUtils();

  const checkBulk = trpc.shopping.items.checkBulk.useMutation({
    onSuccess: () => {
      // Invalidate both cache keys
      if (items[0]?.listId) {
        utils.shopping.lists.getById.invalidate({ id: items[0].listId });
      }
      utils.shopping.lists.getDefault.invalidate();
    },
  });

  const categoryInfo =
    categoryId === 'uncategorized'
      ? { name: 'Other', icon: 'ShoppingBasket', order: 99 }
      : CATEGORY_MAP[categoryId];

  const uncheckedItems = items.filter((item) => !item.checked);
  const uncheckedCount = uncheckedItems.length;

  const handleCheckAll = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the collapsible
    if (uncheckedItems.length === 0) return;

    checkBulk.mutate({
      ids: uncheckedItems.map((item) => item.id),
      checked: true,
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 p-2 rounded-lg hover:bg-muted transition-colors">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{categoryInfo?.name ?? 'Other'}</span>
          <Badge variant="secondary" className="ml-auto">
            {uncheckedCount} / {items.length}
          </Badge>
        </CollapsibleTrigger>
        {uncheckedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCheckAll}
            disabled={checkBulk.isPending}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            title="Check all items in this category"
          >
            <CheckCheck className="h-4 w-4" />
          </Button>
        )}
      </div>
      <CollapsibleContent className="space-y-2 pt-2">
        {items.map((item) => (
          <ShoppingItem key={item.id} item={item} onEdit={onEditItem} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
