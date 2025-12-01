# Feature 2.1: List CRUD

> Create, read, update, delete shopping lists.

## Overview

This feature implements the basic list management for the Shopping List module. While the initial UI will focus on a single default list, the data model supports multiple lists for future expansion.

## Acceptance Criteria

- [ ] Default list created automatically for new users
- [ ] List can be renamed
- [ ] List displays in the UI with item count
- [ ] Lists can be archived (soft delete)
- [ ] Data model supports multiple lists
- [ ] tRPC routes for all CRUD operations

## Technical Details

### Database Schema

```typescript
// Already defined in epic plan, implemented in db/schema
export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().default('Shopping List'),
  createdBy: text('created_by').references(() => users.id),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  googleKeepId: text('google_keep_id'),
  googleKeepSyncEnabled: integer('google_keep_sync_enabled', { mode: 'boolean' }).default(false),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
```

### tRPC Router

```typescript
// apps/api/src/modules/shopping/router.ts
import { z } from 'zod';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { shoppingLists } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const listsRouter = router({
  // Get all lists for household (non-archived)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.isArchived, false),
      orderBy: [desc(shoppingLists.isDefault), asc(shoppingLists.name)],
      with: {
        items: {
          columns: { id: true, checked: true },
        },
      },
    });
  }),

  // Get single list by ID
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input),
        with: {
          items: true,
          createdByUser: {
            columns: { name: true, avatarUrl: true },
          },
        },
      });

      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return list;
    }),

  // Get default list (or create one)
  getDefault: protectedProcedure.query(async ({ ctx }) => {
    let defaultList = await ctx.db.query.shoppingLists.findFirst({
      where: and(
        eq(shoppingLists.isDefault, true),
        eq(shoppingLists.isArchived, false)
      ),
    });

    // Create default list if none exists
    if (!defaultList) {
      const [created] = await ctx.db.insert(shoppingLists)
        .values({
          id: nanoid(),
          name: 'Shopping List',
          createdBy: ctx.userId,
          isDefault: true,
        })
        .returning();
      defaultList = created;
    }

    return defaultList;
  }),

  // Create new list
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const [list] = await ctx.db.insert(shoppingLists)
        .values({
          id: nanoid(),
          name: input.name,
          createdBy: ctx.userId,
        })
        .returning();

      return list;
    }),

  // Update list
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      googleKeepSyncEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [updated] = await ctx.db.update(shoppingLists)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingLists.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Broadcast update to household
      socketEmitter.toHousehold('shopping:list:updated', { list: updated });

      return updated;
    }),

  // Archive list (soft delete)
  archive: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input),
      });

      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (list.isDefault) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot archive the default list',
        });
      }

      await ctx.db.update(shoppingLists)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(eq(shoppingLists.id, input));

      socketEmitter.toHousehold('shopping:list:archived', { listId: input });

      return { success: true };
    }),

  // Restore archived list
  restore: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(shoppingLists)
        .set({ isArchived: false, updatedAt: new Date().toISOString() })
        .where(eq(shoppingLists.id, input));

      return { success: true };
    }),
});
```

### UI Components

#### List Header
```tsx
// apps/web/src/modules/shopping/components/ListHeader.tsx
import { trpc } from '../../../lib/trpc';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { MoreHorizontal, Pencil, Check } from 'lucide-react';
import { useState } from 'react';

interface ListHeaderProps {
  listId: string;
  name: string;
  itemCount: number;
  checkedCount: number;
}

export function ListHeader({ listId, name, itemCount, checkedCount }: ListHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const updateList = trpc.shopping.lists.update.useMutation();

  const handleSave = () => {
    if (editName.trim() && editName !== name) {
      updateList.mutate({ id: listId, name: editName.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between pb-4">
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            className="text-xl font-bold"
          />
          <Button size="icon" variant="ghost" onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{name}</h1>
          <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {checkedCount}/{itemCount} items
        </span>
        <ListMenu listId={listId} />
      </div>
    </div>
  );
}
```

#### List Menu
```tsx
// apps/web/src/modules/shopping/components/ListMenu.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Button } from '../../../components/ui/button';
import { MoreHorizontal, Archive, RefreshCw, Settings } from 'lucide-react';

interface ListMenuProps {
  listId: string;
}

export function ListMenu({ listId }: ListMenuProps) {
  const archiveList = trpc.shopping.lists.archive.useMutation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync with Google Keep
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          List settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => archiveList.mutate(listId)}
        >
          <Archive className="mr-2 h-4 w-4" />
          Archive list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Auto-Create Default List

On first access to shopping module, ensure a default list exists:

```typescript
// apps/web/src/modules/shopping/hooks/useDefaultList.ts
import { trpc } from '../../../lib/trpc';

export function useDefaultList() {
  return trpc.shopping.lists.getDefault.useQuery(undefined, {
    staleTime: Infinity, // Doesn't change often
    refetchOnWindowFocus: false,
  });
}
```

## Implementation Steps

1. **Create Database Schema**
   - Add shopping_lists table to schema
   - Run migration

2. **Create tRPC Router**
   - lists sub-router with all CRUD operations
   - Register under shopping router

3. **Create UI Components**
   - ListHeader with edit functionality
   - ListMenu with actions

4. **Implement Auto-Create Logic**
   - getDefault creates if not exists
   - Called on module load

5. **Add WebSocket Events**
   - list:updated
   - list:archived

6. **Test CRUD Operations**
   - Create, read, update, archive
   - Verify WebSocket broadcasts

## Definition of Done

- [ ] Default list auto-created for new users
- [ ] List name editable inline
- [ ] Archive works (list hidden but not deleted)
- [ ] WebSocket events broadcast changes
- [ ] API returns item counts with list

## Dependencies

- Epic 1 (Foundation) complete
- Feature 2.2 (Item Management) for full testing

## Notes

- Future: Multiple list support with list switcher
- Future: Shared lists across households
- Future: List templates (weekly groceries, etc.)
