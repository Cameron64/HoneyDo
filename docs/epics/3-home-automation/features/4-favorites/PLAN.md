# Feature 3.4: Favorites

> Your most-used devices, one tap away.

## Overview

This feature allows users to mark frequently used entities as favorites, displaying them prominently on the home automation dashboard for quick access.

## Acceptance Criteria

- [ ] Add entity to favorites
- [ ] Remove from favorites
- [ ] Favorites displayed on dashboard
- [ ] Reorder favorites
- [ ] Custom display name optional
- [ ] Per-user favorites

## Technical Details

### Database Schema

```typescript
export const haFavorites = sqliteTable('ha_favorites', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityId: text('entity_id').notNull(),
  displayName: text('display_name'),       // Custom name override
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Unique constraint: user + entity
```

### tRPC Router

```typescript
// apps/api/src/modules/home/favorites.router.ts
export const favoritesRouter = router({
  // Get user's favorites
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const favorites = await ctx.db.query.haFavorites.findMany({
      where: eq(haFavorites.userId, ctx.userId),
      orderBy: asc(haFavorites.sortOrder),
    });

    // Enrich with entity data
    const entityIds = favorites.map(f => f.entityId);
    const entities = await ctx.db.query.haEntities.findMany({
      where: inArray(haEntities.entityId, entityIds),
    });

    const entityMap = new Map(entities.map(e => [e.entityId, e]));

    return favorites.map(fav => ({
      ...fav,
      entity: entityMap.get(fav.entityId),
    }));
  }),

  // Add to favorites
  add: protectedProcedure
    .input(z.object({
      entityId: z.string(),
      displayName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get max sort order
      const existing = await ctx.db.query.haFavorites.findMany({
        where: eq(haFavorites.userId, ctx.userId),
        orderBy: desc(haFavorites.sortOrder),
        limit: 1,
      });

      const maxOrder = existing[0]?.sortOrder ?? 0;

      const [favorite] = await ctx.db.insert(haFavorites)
        .values({
          userId: ctx.userId,
          entityId: input.entityId,
          displayName: input.displayName,
          sortOrder: maxOrder + 1,
        })
        .returning();

      return favorite;
    }),

  // Remove from favorites
  remove: protectedProcedure
    .input(z.string()) // favoriteId
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(haFavorites)
        .where(and(
          eq(haFavorites.id, input),
          eq(haFavorites.userId, ctx.userId),
        ));

      return { success: true };
    }),

  // Update favorite (name, order)
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      displayName: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      await ctx.db.update(haFavorites)
        .set(updates)
        .where(and(
          eq(haFavorites.id, id),
          eq(haFavorites.userId, ctx.userId),
        ));

      return { success: true };
    }),

  // Reorder favorites
  reorder: protectedProcedure
    .input(z.array(z.object({
      id: z.string(),
      sortOrder: z.number(),
    })))
    .mutation(async ({ ctx, input }) => {
      for (const item of input) {
        await ctx.db.update(haFavorites)
          .set({ sortOrder: item.sortOrder })
          .where(and(
            eq(haFavorites.id, item.id),
            eq(haFavorites.userId, ctx.userId),
          ));
      }

      return { success: true };
    }),
});
```

### UI Components

#### Favorites Grid
```tsx
// apps/web/src/modules/home/components/FavoritesGrid.tsx
import { trpc } from '../../../lib/trpc';
import { EntityControl } from './controls/EntityControl';
import { Plus } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';

export function FavoritesGrid() {
  const { data: favorites, isLoading } = trpc.home.favorites.getAll.useQuery();
  const reorder = trpc.home.favorites.reorder.useMutation();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !favorites) return;

    const oldIndex = favorites.findIndex(f => f.id === active.id);
    const newIndex = favorites.findIndex(f => f.id === over.id);

    const newOrder = arrayMove(favorites, oldIndex, newIndex);
    const updates = newOrder.map((fav, index) => ({
      id: fav.id,
      sortOrder: index,
    }));

    reorder.mutate(updates);
  };

  if (isLoading) return <Spinner />;

  if (!favorites?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-muted-foreground mb-2">No favorites yet</p>
          <p className="text-sm text-muted-foreground">
            Long-press any device to add it to favorites
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={favorites.map(f => f.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {favorites.map((favorite) => (
            <SortableFavoriteCard key={favorite.id} favorite={favorite} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableFavoriteCard({ favorite }: { favorite: Favorite }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favorite.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <FavoriteCard favorite={favorite} />
    </div>
  );
}
```

#### Favorite Card
```tsx
// apps/web/src/modules/home/components/FavoriteCard.tsx
export function FavoriteCard({ favorite }: Props) {
  const [showMenu, setShowMenu] = useState(false);

  if (!favorite.entity) {
    return (
      <Card className="opacity-50">
        <CardContent className="p-3">
          <p className="text-sm text-muted-foreground">Entity not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <EntityControl
          entity={{
            ...favorite.entity,
            friendlyName: favorite.displayName ?? favorite.entity.friendlyName,
          }}
          compact
        />
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => setShowMenu(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive"
          onClick={() => removeFavorite(favorite.id)}
        >
          <Trash className="mr-2 h-4 w-4" />
          Remove from favorites
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

#### Add to Favorites (from entity list)
```tsx
// apps/web/src/modules/home/components/AddToFavoritesDialog.tsx
export function AddToFavoritesDialog({ entityId, open, onClose }: Props) {
  const [displayName, setDisplayName] = useState('');
  const { data: entity } = trpc.home.entities.getById.useQuery(entityId);
  const addFavorite = trpc.home.favorites.add.useMutation({
    onSuccess: () => {
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Favorites</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <EntityIcon domain={entity?.domain} />
            </div>
            <div>
              <p className="font-medium">{entity?.friendlyName}</p>
              <p className="text-sm text-muted-foreground">{entityId}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="displayName">Custom name (optional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={entity?.friendlyName ?? ''}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => addFavorite.mutate({
              entityId,
              displayName: displayName || undefined,
            })}
          >
            Add to Favorites
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Implementation Steps

1. **Create Database Schema**
   - ha_favorites table
   - Unique constraint

2. **Build Favorites Router**
   - CRUD operations
   - Reorder mutation

3. **Create UI Components**
   - FavoritesGrid
   - FavoriteCard
   - AddToFavoritesDialog

4. **Add Drag to Reorder**
   - Install @dnd-kit
   - Sortable wrapper

5. **Add Context Menu**
   - Long-press on mobile
   - Right-click on desktop

## Definition of Done

- [ ] Can add entity to favorites
- [ ] Favorites display on dashboard
- [ ] Can reorder by dragging
- [ ] Custom name works
- [ ] Can remove from favorites
- [ ] Per-user favorites

## Dependencies

- Feature 3.2 (Entities) - entity data
- Feature 3.3 (Controls) - EntityControl component

## Notes

- Consider max favorites limit
- Favorites sync across devices
- Could add widget support later
