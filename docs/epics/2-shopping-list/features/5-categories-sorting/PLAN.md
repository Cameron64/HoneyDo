# Feature 2.5: Categories & Sorting

> Organize items by aisle. Shop faster.

## Overview

This feature adds categories to shopping items and sorts them logically. When you're at the store, items are grouped by section (produce, dairy, meat, etc.) so you can shop aisle by aisle without backtracking.

## Acceptance Criteria

- [ ] Items have category field
- [ ] Items grouped by category in UI
- [ ] Category headers collapsible
- [ ] Manual category selection available
- [ ] Categories sorted in "store order"
- [ ] Drag to reorder within category (optional)
- [ ] Items without category go to "Other"

## Technical Details

### Category List

```typescript
// packages/shared/src/constants/categories.ts
export const SHOPPING_CATEGORIES = [
  { id: 'produce', name: 'Produce', icon: 'Apple', order: 1 },
  { id: 'bakery', name: 'Bakery', icon: 'Croissant', order: 2 },
  { id: 'dairy', name: 'Dairy', icon: 'Milk', order: 3 },
  { id: 'meat', name: 'Meat & Seafood', icon: 'Beef', order: 4 },
  { id: 'deli', name: 'Deli', icon: 'Sandwich', order: 5 },
  { id: 'frozen', name: 'Frozen', icon: 'Snowflake', order: 6 },
  { id: 'pantry', name: 'Pantry', icon: 'Package', order: 7 },
  { id: 'beverages', name: 'Beverages', icon: 'Coffee', order: 8 },
  { id: 'snacks', name: 'Snacks', icon: 'Cookie', order: 9 },
  { id: 'household', name: 'Household', icon: 'Spray', order: 10 },
  { id: 'personal-care', name: 'Personal Care', icon: 'Sparkles', order: 11 },
  { id: 'pharmacy', name: 'Pharmacy', icon: 'Pill', order: 12 },
  { id: 'other', name: 'Other', icon: 'MoreHorizontal', order: 99 },
] as const;

export type ShoppingCategory = typeof SHOPPING_CATEGORIES[number]['id'];

export function getCategoryOrder(categoryId: string | null): number {
  if (!categoryId) return 99;
  const category = SHOPPING_CATEGORIES.find(c => c.id === categoryId);
  return category?.order ?? 99;
}

export function getCategoryName(categoryId: string | null): string {
  if (!categoryId) return 'Other';
  const category = SHOPPING_CATEGORIES.find(c => c.id === categoryId);
  return category?.name ?? 'Other';
}
```

### Sorting Logic

```typescript
// apps/web/src/modules/shopping/utils/sortItems.ts
import { getCategoryOrder } from '@honeydo/shared';

export function sortShoppingItems(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => {
    // Unchecked items first
    if (a.checked !== b.checked) {
      return a.checked ? 1 : -1;
    }

    // Then by category order
    const categoryOrderA = getCategoryOrder(a.category);
    const categoryOrderB = getCategoryOrder(b.category);
    if (categoryOrderA !== categoryOrderB) {
      return categoryOrderA - categoryOrderB;
    }

    // Then by sort order within category
    if (a.sortOrder !== b.sortOrder) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }

    // Finally alphabetically
    return a.name.localeCompare(b.name);
  });
}

export function groupByCategory(items: ShoppingItem[]): Map<string, ShoppingItem[]> {
  const groups = new Map<string, ShoppingItem[]>();

  for (const item of items) {
    const category = item.category ?? 'other';
    const existing = groups.get(category) ?? [];
    groups.set(category, [...existing, item]);
  }

  // Sort groups by category order
  return new Map(
    [...groups.entries()].sort(([a], [b]) =>
      getCategoryOrder(a) - getCategoryOrder(b)
    )
  );
}
```

### UI Components

#### Categorized Item List
```tsx
// apps/web/src/modules/shopping/components/CategorizedItemList.tsx
import { useMemo } from 'react';
import { groupByCategory, sortShoppingItems } from '../utils/sortItems';
import { SHOPPING_CATEGORIES, getCategoryName } from '@honeydo/shared';
import { CategorySection } from './CategorySection';
import { ShoppingItem } from './ShoppingItem';

interface CategorizedItemListProps {
  items: ShoppingItem[];
  listId: string;
  onEditItem: (item: ShoppingItem) => void;
}

export function CategorizedItemList({ items, listId, onEditItem }: CategorizedItemListProps) {
  const { unchecked, checked } = useMemo(() => {
    const sorted = sortShoppingItems(items);
    return {
      unchecked: sorted.filter(i => !i.checked),
      checked: sorted.filter(i => i.checked),
    };
  }, [items]);

  const groupedUnchecked = useMemo(() => groupByCategory(unchecked), [unchecked]);

  return (
    <div className="space-y-4">
      {/* Unchecked items by category */}
      {[...groupedUnchecked.entries()].map(([categoryId, categoryItems]) => (
        <CategorySection
          key={categoryId}
          categoryId={categoryId}
          items={categoryItems}
          listId={listId}
          onEditItem={onEditItem}
        />
      ))}

      {/* Empty state */}
      {unchecked.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <p>Your list is empty!</p>
        </div>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <CategorySection
          categoryId="checked"
          items={checked}
          listId={listId}
          onEditItem={onEditItem}
          isCheckedSection
        />
      )}
    </div>
  );
}
```

#### Category Section
```tsx
// apps/web/src/modules/shopping/components/CategorySection.tsx
import { useState } from 'react';
import { getCategoryName, SHOPPING_CATEGORIES } from '@honeydo/shared';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import * as Icons from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ShoppingItem } from './ShoppingItem';

interface CategorySectionProps {
  categoryId: string;
  items: ShoppingItem[];
  listId: string;
  onEditItem: (item: ShoppingItem) => void;
  isCheckedSection?: boolean;
}

export function CategorySection({
  categoryId,
  items,
  listId,
  onEditItem,
  isCheckedSection = false,
}: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(!isCheckedSection);

  const category = SHOPPING_CATEGORIES.find(c => c.id === categoryId);
  const Icon = category?.icon ? Icons[category.icon as keyof typeof Icons] : Icons.Package;
  const name = isCheckedSection ? `Checked (${items.length})` : getCategoryName(categoryId);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium hover:bg-muted">
        {!isCheckedSection && Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <span className={cn(isCheckedSection && 'text-muted-foreground')}>
          {name}
        </span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          {!isCheckedSection && <span className="text-xs">{items.length}</span>}
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className={cn('space-y-2 pt-2', isCheckedSection && 'opacity-60')}>
          {items.map((item) => (
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
  );
}
```

#### Category Select
```tsx
// apps/web/src/modules/shopping/components/CategorySelect.tsx
import { SHOPPING_CATEGORIES } from '@honeydo/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import * as Icons from 'lucide-react';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
  return (
    <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No category</SelectItem>
        {SHOPPING_CATEGORIES.filter(c => c.id !== 'other').map((category) => {
          const Icon = Icons[category.icon as keyof typeof Icons];
          return (
            <SelectItem key={category.id} value={category.id}>
              <div className="flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4" />}
                {category.name}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
```

### Drag to Reorder (Optional)

Using @dnd-kit for drag and drop:

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --filter @honeydo/web
```

```tsx
// apps/web/src/modules/shopping/components/SortableItemList.tsx
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { trpc } from '../../../lib/trpc';

export function SortableItemList({ items, listId, categoryId }: Props) {
  const reorder = trpc.shopping.items.reorder.useMutation();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(i => i.id === active.id);
      const newIndex = items.findIndex(i => i.id === over.id);

      // Calculate new order
      const newItems = arrayMove(items, oldIndex, newIndex);
      const updates = newItems.map((item, index) => ({
        id: item.id,
        sortOrder: index,
      }));

      reorder.mutate({ listId, items: updates });
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={item.id} item={item} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

### Reorder API

```typescript
// apps/api/src/modules/shopping/items.router.ts
reorder: protectedProcedure
  .input(z.object({
    listId: z.string(),
    items: z.array(z.object({
      id: z.string(),
      sortOrder: z.number(),
    })),
  }))
  .mutation(async ({ ctx, input }) => {
    // Batch update sort orders
    await Promise.all(
      input.items.map(({ id, sortOrder }) =>
        ctx.db.update(shoppingItems)
          .set({ sortOrder })
          .where(eq(shoppingItems.id, id))
      )
    );

    socketEmitter.toOthers(ctx.userId, 'shopping:items:reordered', {
      listId: input.listId,
      items: input.items,
    });

    return { success: true };
  }),
```

## Implementation Steps

1. **Define Categories**
   - Shared constants
   - Category type, name, icon, order

2. **Add Sorting Utils**
   - sortShoppingItems function
   - groupByCategory function

3. **Build Category UI**
   - CategorySection component
   - CategorizedItemList wrapper
   - CategorySelect for editing

4. **Add Category Field to Items**
   - Already in schema
   - Add to add/edit forms

5. **Implement Drag to Reorder** (optional)
   - Install @dnd-kit
   - Create sortable wrapper
   - Add reorder API

6. **Test Sorting**
   - Items group correctly
   - New items sort properly
   - Categories collapse/expand

## Definition of Done

- [ ] Items display grouped by category
- [ ] Category headers show icon and count
- [ ] Categories are collapsible
- [ ] Items without category show in "Other"
- [ ] Category selectable when editing item
- [ ] Categories sorted in store order
- [ ] (Optional) Drag to reorder works

## Dependencies

- Feature 2.2 (Item Management) - items exist
- Feature 2.7 (AI Features) - auto-categorization

## Notes

- Category order can be customized per store (future)
- Consider "smart" category (AI-suggested based on name)
- Print/share view could show by category
