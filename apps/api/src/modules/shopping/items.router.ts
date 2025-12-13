import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import {
  createShoppingItemSchema,
  updateShoppingItemSchema,
  checkShoppingItemSchema,
  bulkAddItemsSchema,
  reorderItemsSchema,
  clearCheckedItemsSchema,
  type ShoppingCategoryId,
} from '@honeydo/shared';
import { shoppingItems, shoppingFrequentItems } from '../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { socketEmitter } from '../../services/websocket/emitter';
import { db } from '../../db';
import { updateListTimestamp } from './helpers';

// Helper to track frequent items
async function trackFrequentItem(
  userId: string,
  itemName: string,
  category: ShoppingCategoryId | null
) {
  const normalized = itemName.toLowerCase().trim();

  // Try to find existing
  const existing = await db.query.shoppingFrequentItems.findFirst({
    where: and(
      eq(shoppingFrequentItems.userId, userId),
      eq(shoppingFrequentItems.itemName, normalized)
    ),
  });

  if (existing) {
    await db
      .update(shoppingFrequentItems)
      .set({
        useCount: existing.useCount + 1,
        lastUsedAt: new Date().toISOString(),
        category: category ?? existing.category,
      })
      .where(eq(shoppingFrequentItems.id, existing.id));
  } else {
    await db.insert(shoppingFrequentItems).values({
      userId,
      itemName: normalized,
      category,
    });
  }
}

export const itemsRouter = router({
  // Get items for a list
  getByList: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.shoppingItems.findMany({
        where: eq(shoppingItems.listId, input.listId),
        orderBy: [
          sql`${shoppingItems.checked} ASC`,
          sql`${shoppingItems.sortOrder} ASC`,
        ],
      });
      return items;
    }),

  // Add a single item
  add: protectedProcedure
    .input(createShoppingItemSchema)
    .mutation(async ({ ctx, input }) => {
      // Get max sort order for unchecked items
      const maxSortItem = await ctx.db.query.shoppingItems.findFirst({
        where: and(
          eq(shoppingItems.listId, input.listId),
          eq(shoppingItems.checked, false)
        ),
        orderBy: desc(shoppingItems.sortOrder),
      });
      const sortOrder = (maxSortItem?.sortOrder ?? 0) + 1;

      const [item] = await ctx.db
        .insert(shoppingItems)
        .values({
          listId: input.listId,
          name: input.name,
          quantity: input.quantity ?? null,
          unit: input.unit ?? null,
          category: (input.category as ShoppingCategoryId) ?? null,
          note: input.note ?? null,
          addedBy: ctx.userId,
          sortOrder,
        })
        .returning();

      // Track for suggestions
      trackFrequentItem(ctx.userId, input.name, (input.category as ShoppingCategoryId) ?? null);

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, input.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:item:added', {
        ...item,
        checkedAt: item.checkedAt,
        googleKeepItemId: item.googleKeepItemId,
      });

      return item;
    }),

  // Add multiple items (bulk)
  addBulk: protectedProcedure
    .input(bulkAddItemsSchema)
    .mutation(async ({ ctx, input }) => {
      // Get max sort order
      const maxSortItem = await ctx.db.query.shoppingItems.findFirst({
        where: and(
          eq(shoppingItems.listId, input.listId),
          eq(shoppingItems.checked, false)
        ),
        orderBy: desc(shoppingItems.sortOrder),
      });
      let sortOrder = (maxSortItem?.sortOrder ?? 0) + 1;

      const items = await ctx.db
        .insert(shoppingItems)
        .values(
          input.items.map((item) => ({
            listId: input.listId,
            name: item.name,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            category: (item.category as ShoppingCategoryId) ?? null,
            addedBy: ctx.userId,
            sortOrder: sortOrder++,
          }))
        )
        .returning();

      // Track all for suggestions
      for (const item of input.items) {
        trackFrequentItem(ctx.userId, item.name, (item.category as ShoppingCategoryId) ?? null);
      }

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, input.listId);

      // Emit to other household members
      socketEmitter.toOthers(
        ctx.userId,
        'shopping:items:added',
        items.map((item) => ({
          ...item,
          checkedAt: item.checkedAt,
          googleKeepItemId: item.googleKeepItemId,
        }))
      );

      return items;
    }),

  // Update an item
  update: protectedProcedure
    .input(updateShoppingItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [item] = await ctx.db
        .update(shoppingItems)
        .set({
          name: updates.name,
          quantity: updates.quantity,
          unit: updates.unit,
          category: updates.category as ShoppingCategoryId | null | undefined,
          note: updates.note,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingItems.id, id))
        .returning();

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping item not found',
        });
      }

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, item.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:item:updated', {
        ...item,
        checkedAt: item.checkedAt,
        googleKeepItemId: item.googleKeepItemId,
      });

      return item;
    }),

  // Check/uncheck an item
  check: protectedProcedure
    .input(checkShoppingItemSchema)
    .mutation(async ({ ctx, input }) => {
      const checkedAt = input.checked ? new Date().toISOString() : null;
      const checkedBy = input.checked ? ctx.userId : null;

      const [item] = await ctx.db
        .update(shoppingItems)
        .set({
          checked: input.checked,
          checkedAt,
          checkedBy,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingItems.id, input.id))
        .returning();

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping item not found',
        });
      }

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, item.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:item:checked', {
        id: item.id,
        listId: item.listId,
        checked: item.checked,
        checkedBy: item.checkedBy,
        checkedAt: item.checkedAt,
      });

      return item;
    }),

  // Remove an item
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.shoppingItems.findFirst({
        where: eq(shoppingItems.id, input.id),
      });

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping item not found',
        });
      }

      await ctx.db.delete(shoppingItems).where(eq(shoppingItems.id, input.id));

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, item.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:item:removed', {
        id: input.id,
        listId: item.listId,
      });

      return { success: true };
    }),

  // Check multiple items at once
  checkBulk: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1),
      checked: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const checkedAt = input.checked ? new Date().toISOString() : null;
      const checkedBy = input.checked ? ctx.userId : null;

      // Update all items
      const updatedItems = await Promise.all(
        input.ids.map(async (id) => {
          const [item] = await ctx.db
            .update(shoppingItems)
            .set({
              checked: input.checked,
              checkedAt,
              checkedBy,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(shoppingItems.id, id))
            .returning();
          return item;
        })
      );

      // Get listId from first item for event and timestamp update
      if (updatedItems.length > 0 && updatedItems[0]) {
        await updateListTimestamp(ctx.db, updatedItems[0].listId);

        // Emit to other household members
        socketEmitter.toOthers(ctx.userId, 'shopping:items:checked', {
          ids: input.ids,
          listId: updatedItems[0].listId,
          checked: input.checked,
          checkedBy,
          checkedAt,
        });
      }

      return updatedItems;
    }),

  // Clear all checked items
  clearChecked: protectedProcedure
    .input(clearCheckedItemsSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the checked items first for the event
      const checkedItems = await ctx.db.query.shoppingItems.findMany({
        where: and(
          eq(shoppingItems.listId, input.listId),
          eq(shoppingItems.checked, true)
        ),
      });

      if (checkedItems.length === 0) {
        return { cleared: 0, itemIds: [] };
      }

      const itemIds = checkedItems.map((item) => item.id);

      await ctx.db
        .delete(shoppingItems)
        .where(
          and(
            eq(shoppingItems.listId, input.listId),
            eq(shoppingItems.checked, true)
          )
        );

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, input.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:items:cleared', {
        listId: input.listId,
        itemIds,
      });

      return { cleared: itemIds.length, itemIds };
    }),

  // Reorder items
  reorder: protectedProcedure
    .input(reorderItemsSchema)
    .mutation(async ({ ctx, input }) => {
      // Update sort order for each item
      await Promise.all(
        input.itemIds.map((id, index) =>
          ctx.db
            .update(shoppingItems)
            .set({ sortOrder: index, updatedAt: new Date().toISOString() })
            .where(eq(shoppingItems.id, id))
        )
      );

      // Update list's updatedAt
      await updateListTimestamp(ctx.db, input.listId);

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:items:reordered', {
        listId: input.listId,
        itemIds: input.itemIds,
      });

      return { success: true };
    }),

  // Get frequent items for suggestions
  getFrequent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.shoppingFrequentItems.findMany({
        where: eq(shoppingFrequentItems.userId, ctx.userId),
        orderBy: desc(shoppingFrequentItems.useCount),
        limit: input.limit,
      });
      return items;
    }),
});
