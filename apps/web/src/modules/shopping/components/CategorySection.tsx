import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ShoppingItem } from './ShoppingItem';
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

  const categoryInfo =
    categoryId === 'uncategorized'
      ? { name: 'Other', icon: 'ShoppingBasket', order: 99 }
      : CATEGORY_MAP[categoryId];

  const uncheckedCount = items.filter((item) => !item.checked).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted transition-colors">
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
      <CollapsibleContent className="space-y-2 pt-2">
        {items.map((item) => (
          <ShoppingItem key={item.id} item={item} onEdit={onEditItem} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
