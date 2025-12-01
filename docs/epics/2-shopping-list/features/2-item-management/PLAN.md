# Feature 2.2: Item Management

> Add, edit, delete shopping items.

## Overview

This feature implements the core item management for shopping lists - adding items quickly, editing details, and removing items. The focus is on speed and simplicity for the most common action: adding an item.

## Acceptance Criteria

- [ ] Quick-add input for fast item entry
- [ ] Items display with name, quantity, and category
- [ ] Items can be edited (name, quantity, notes)
- [ ] Items can be deleted (swipe or button)
- [ ] Bulk add via paste (multiple lines)
- [ ] Item shows who added it
- [ ] Optimistic updates for snappy UI

## Technical Details

### Database Schema

```typescript
export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: text('quantity'),         // "2", "1 lb", etc.
  unit: text('unit'),                 // "pieces", "lbs", etc.
  category: text('category'),
  note: text('note'),
  checked: integer('checked', { mode: 'boolean' }).default(false),
  checkedAt: text('checked_at'),
  checkedBy: text('checked_by').references(() => users.id),
  addedBy: text('added_by').references(() => users.id),
  sortOrder: integer('sort_order').default(0),
  googleKeepItemId: text('google_keep_item_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Relations
export const shoppingItemsRelations = relations(shoppingItems, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingItems.listId],
    references: [shoppingLists.id],
  }),
  addedByUser: one(users, {
    fields: [shoppingItems.addedBy],
    references: [users.id],
  }),
  checkedByUser: one(users, {
    fields: [shoppingItems.checkedBy],
    references: [users.id],
  }),
}));
```

### Zod Schemas

```typescript
// packages/shared/src/schemas/shopping.ts
import { z } from 'zod';

export const addItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1).max(200),
  quantity: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  category: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});

export const updateItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  category: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});

export const addBulkSchema = z.object({
  listId: z.string(),
  items: z.array(z.object({
    name: z.string().min(1).max(200),
    quantity: z.string().optional(),
  })).min(1).max(50),
});
```

### tRPC Router

```typescript
// apps/api/src/modules/shopping/items.router.ts
export const itemsRouter = router({
  // Get items for a list
  getByList: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.shoppingItems.findMany({
        where: eq(shoppingItems.listId, input),
        orderBy: [
          asc(shoppingItems.checked),
          asc(shoppingItems.category),
          asc(shoppingItems.sortOrder),
        ],
        with: {
          addedByUser: { columns: { name: true, avatarUrl: true } },
        },
      });
    }),

  // Add single item
  add: protectedProcedure
    .input(addItemSchema)
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.insert(shoppingItems)
        .values({
          id: nanoid(),
          ...input,
          addedBy: ctx.userId,
        })
        .returning();

      // Get user info for broadcast
      const withUser = await ctx.db.query.shoppingItems.findFirst({
        where: eq(shoppingItems.id, item.id),
        with: { addedByUser: { columns: { name: true, avatarUrl: true } } },
      });

      // Broadcast to others
      socketEmitter.toOthers(ctx.userId, 'shopping:item:added', {
        listId: input.listId,
        item: withUser,
      });

      // Track for suggestions
      trackFrequentItem(ctx.userId, input.name, input.category);

      return withUser;
    }),

  // Add multiple items at once
  addBulk: protectedProcedure
    .input(addBulkSchema)
    .mutation(async ({ ctx, input }) => {
      const items = await ctx.db.insert(shoppingItems)
        .values(input.items.map((item, index) => ({
          id: nanoid(),
          listId: input.listId,
          name: item.name,
          quantity: item.quantity,
          addedBy: ctx.userId,
          sortOrder: index,
        })))
        .returning();

      socketEmitter.toOthers(ctx.userId, 'shopping:items:added', {
        listId: input.listId,
        items,
        count: items.length,
      });

      return items;
    }),

  // Update item
  update: protectedProcedure
    .input(updateItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [updated] = await ctx.db.update(shoppingItems)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingItems.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      socketEmitter.toOthers(ctx.userId, 'shopping:item:updated', {
        listId: updated.listId,
        item: updated,
      });

      return updated;
    }),

  // Delete item
  remove: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.shoppingItems.findFirst({
        where: eq(shoppingItems.id, input),
      });

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await ctx.db.delete(shoppingItems)
        .where(eq(shoppingItems.id, input));

      socketEmitter.toOthers(ctx.userId, 'shopping:item:removed', {
        listId: item.listId,
        itemId: input,
      });

      return { success: true };
    }),
});
```

### UI Components

#### Quick Add Bar
```tsx
// apps/web/src/modules/shopping/components/QuickAddBar.tsx
import { useState, useRef } from 'react';
import { trpc } from '../../../lib/trpc';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Plus, Sparkles } from 'lucide-react';
import { parseItemInput } from '../utils/parseItem';

interface QuickAddBarProps {
  listId: string;
  onAIExpand?: (input: string) => void;
}

export function QuickAddBar({ listId, onAIExpand }: QuickAddBarProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const addItem = trpc.shopping.items.add.useMutation({
    onSuccess: () => {
      setInput('');
      inputRef.current?.focus();
      utils.shopping.items.getByList.invalidate(listId);
    },
  });
  const addBulk = trpc.shopping.items.addBulk.useMutation({
    onSuccess: () => {
      setInput('');
      utils.shopping.items.getByList.invalidate(listId);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    // Check for multiple lines (bulk paste)
    const lines = trimmed.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
      addBulk.mutate({
        listId,
        items: lines.map(line => parseItemInput(line)),
      });
      return;
    }

    // Single item
    const parsed = parseItemInput(trimmed);
    addItem.mutate({
      listId,
      ...parsed,
    });
  };

  const showAIButton = input.length > 3 && isExpandableInput(input);

  return (
    <form onSubmit={handleSubmit} className="sticky top-0 z-10 bg-background pb-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add an item..."
            className="pr-10"
          />
          {showAIButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => onAIExpand?.(input)}
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </Button>
          )}
        </div>
        <Button type="submit" disabled={!input.trim() || addItem.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {input.includes('\n') && (
        <p className="mt-1 text-xs text-muted-foreground">
          {input.split('\n').filter(l => l.trim()).length} items will be added
        </p>
      )}
    </form>
  );
}

function isExpandableInput(input: string): boolean {
  const expandableTerms = ['stuff', 'things', 'ingredients', 'items for'];
  return expandableTerms.some(term => input.toLowerCase().includes(term));
}
```

#### Item Row
```tsx
// apps/web/src/modules/shopping/components/ShoppingItem.tsx
import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { Checkbox } from '../../../components/ui/checkbox';
import { Button } from '../../../components/ui/button';
import { Trash2, MoreHorizontal } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SwipeableItem } from './SwipeableItem';

interface ShoppingItemProps {
  item: {
    id: string;
    name: string;
    quantity?: string;
    category?: string;
    checked: boolean;
    addedByUser?: { name: string; avatarUrl?: string };
  };
  listId: string;
  onEdit: () => void;
}

export function ShoppingItem({ item, listId, onEdit }: ShoppingItemProps) {
  const utils = trpc.useUtils();

  const checkItem = trpc.shopping.items.check.useMutation({
    onMutate: async ({ id }) => {
      // Optimistic update
      await utils.shopping.items.getByList.cancel(listId);
      const prev = utils.shopping.items.getByList.getData(listId);

      utils.shopping.items.getByList.setData(listId, (old) =>
        old?.map(i => i.id === id ? { ...i, checked: true } : i)
      );

      return { prev };
    },
    onError: (err, vars, ctx) => {
      utils.shopping.items.getByList.setData(listId, ctx?.prev);
    },
  });

  const removeItem = trpc.shopping.items.remove.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
    },
  });

  const handleCheck = () => {
    if (item.checked) {
      // Uncheck - implement later
    } else {
      checkItem.mutate({ id: item.id });
    }
  };

  return (
    <SwipeableItem onSwipeLeft={() => removeItem.mutate(item.id)}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3',
          item.checked && 'opacity-50'
        )}
        onClick={handleCheck}
      >
        <Checkbox checked={item.checked} />

        <div className="flex-1 min-w-0">
          <p className={cn('font-medium', item.checked && 'line-through')}>
            {item.quantity && (
              <span className="text-muted-foreground mr-1">{item.quantity}</span>
            )}
            {item.name}
          </p>
          {item.category && (
            <p className="text-xs text-muted-foreground">{item.category}</p>
          )}
        </div>

        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </SwipeableItem>
  );
}
```

#### Item Edit Sheet
```tsx
// apps/web/src/modules/shopping/components/ItemEditSheet.tsx
import { useState, useEffect } from 'react';
import { trpc } from '../../../lib/trpc';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { CategorySelect } from './CategorySelect';

interface ItemEditSheetProps {
  item: ShoppingItem | null;
  listId: string;
  open: boolean;
  onClose: () => void;
}

export function ItemEditSheet({ item, listId, open, onClose }: ItemEditSheetProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  const utils = trpc.useUtils();
  const updateItem = trpc.shopping.items.update.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
      onClose();
    },
  });
  const removeItem = trpc.shopping.items.remove.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
      onClose();
    },
  });

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQuantity(item.quantity ?? '');
      setCategory(item.category ?? '');
      setNote(item.note ?? '');
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;
    updateItem.mutate({
      id: item.id,
      name,
      quantity: quantity || undefined,
      category: category || undefined,
      note: note || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Item</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 2, 1 lb, a bunch"
            />
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <CategorySelect value={category} onChange={setCategory} />
          </div>

          <div>
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any additional details..."
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} className="flex-1">
            Save
          </Button>
          <Button
            variant="destructive"
            onClick={() => item && removeItem.mutate(item.id)}
          >
            Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### Input Parsing

```typescript
// apps/web/src/modules/shopping/utils/parseItem.ts
export function parseItemInput(input: string): { name: string; quantity?: string } {
  const trimmed = input.trim();

  // Pattern: "2 milk" or "2x milk" or "2 lbs chicken"
  const quantityMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*([x×])?\s*(.+)$/i);
  if (quantityMatch) {
    return {
      quantity: quantityMatch[1],
      name: quantityMatch[3].trim(),
    };
  }

  // Pattern: "milk x2" or "milk (2)"
  const trailingMatch = trimmed.match(/^(.+?)\s*(?:[x×](\d+)|\((\d+)\))$/i);
  if (trailingMatch) {
    return {
      name: trailingMatch[1].trim(),
      quantity: trailingMatch[2] || trailingMatch[3],
    };
  }

  // Pattern: "2 lbs ground beef"
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(lbs?|oz|kg|g|cups?|gallons?)\s+(.+)$/i);
  if (unitMatch) {
    return {
      quantity: `${unitMatch[1]} ${unitMatch[2]}`,
      name: unitMatch[3].trim(),
    };
  }

  return { name: trimmed };
}
```

## Implementation Steps

1. **Create Database Schema**
   - Add shopping_items table
   - Add relations
   - Run migration

2. **Create tRPC Router**
   - items sub-router
   - CRUD operations
   - WebSocket broadcasts

3. **Create Input Parser**
   - Parse quantity from input
   - Handle common patterns

4. **Build UI Components**
   - QuickAddBar
   - ShoppingItem (swipeable)
   - ItemEditSheet
   - CategorySelect

5. **Add Optimistic Updates**
   - Instant UI feedback
   - Rollback on error

6. **Test Bulk Add**
   - Paste multiple lines
   - Parse each line

## Definition of Done

- [ ] Can add item with Enter key
- [ ] Quantity parsed from input ("2 milk" → qty: 2, name: milk)
- [ ] Items display in list
- [ ] Can edit item in sheet
- [ ] Can delete by swipe or button
- [ ] Bulk paste adds multiple items
- [ ] Optimistic updates feel instant

## Dependencies

- Feature 2.1 (List CRUD) - lists exist
- Epic 1 (Foundation) - tRPC, WebSocket

## Notes

- Swipe gestures need touch handling library (framer-motion or similar)
- Keyboard shortcuts: Enter to add, Escape to cancel edit
- Consider autofocus management for mobile
