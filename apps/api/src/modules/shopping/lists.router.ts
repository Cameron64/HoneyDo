import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { z } from 'zod';
import {
  createShoppingListSchema,
  updateShoppingListSchema,
} from '@honeydo/shared';
import { shoppingLists, shoppingItems } from '../../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { socketEmitter } from '../../services/websocket/emitter';

export const listsRouter = router({
  // Get all lists (non-archived)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const lists = await ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.isArchived, false),
      orderBy: [desc(shoppingLists.isDefault), desc(shoppingLists.updatedAt)],
    });
    return lists;
  }),

  // Get default list (or create one if none exists)
  getDefault: protectedProcedure.query(async ({ ctx }) => {
    // Try to find existing default list
    const defaultList = await ctx.db.query.shoppingLists.findFirst({
      where: and(
        eq(shoppingLists.isDefault, true),
        eq(shoppingLists.isArchived, false)
      ),
      with: {
        items: {
          orderBy: [asc(shoppingItems.checked), asc(shoppingItems.sortOrder)],
        },
      },
    });

    // Create default list if none exists
    if (!defaultList) {
      const [newList] = await ctx.db
        .insert(shoppingLists)
        .values({
          name: 'Shopping List',
          isDefault: true,
          createdBy: ctx.userId,
        })
        .returning();

      // Return with empty items array (matching the type from findFirst with relations)
      return {
        ...newList,
        items: [],
      };
    }

    return defaultList;
  }),

  // Get list by ID with items
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input.id),
        with: {
          items: {
            orderBy: [asc(shoppingItems.checked), asc(shoppingItems.sortOrder)],
          },
        },
      });

      if (!list) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping list not found',
        });
      }

      return list;
    }),

  // Create a new list
  create: protectedProcedure
    .input(createShoppingListSchema)
    .mutation(async ({ ctx, input }) => {
      const [list] = await ctx.db
        .insert(shoppingLists)
        .values({
          name: input.name,
          createdBy: ctx.userId,
        })
        .returning();

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:list:created', {
        ...list,
        googleKeepId: list.googleKeepId,
        lastSyncedAt: list.lastSyncedAt,
      });

      return list;
    }),

  // Update a list
  update: protectedProcedure
    .input(updateShoppingListSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [list] = await ctx.db
        .update(shoppingLists)
        .set({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingLists.id, id))
        .returning();

      if (!list) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping list not found',
        });
      }

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:list:updated', {
        ...list,
        googleKeepId: list.googleKeepId,
        lastSyncedAt: list.lastSyncedAt,
      });

      return list;
    }),

  // Archive a list (soft delete)
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Don't allow archiving the default list
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input.id),
      });

      if (!list) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping list not found',
        });
      }

      if (list.isDefault) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot archive the default shopping list',
        });
      }

      await ctx.db
        .update(shoppingLists)
        .set({
          isArchived: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingLists.id, input.id));

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:list:archived', { id: input.id });

      return { success: true };
    }),

  // Restore an archived list
  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [list] = await ctx.db
        .update(shoppingLists)
        .set({
          isArchived: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(shoppingLists.id, input.id))
        .returning();

      if (!list) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Shopping list not found',
        });
      }

      // Emit to other household members
      socketEmitter.toOthers(ctx.userId, 'shopping:list:created', {
        ...list,
        googleKeepId: list.googleKeepId,
        lastSyncedAt: list.lastSyncedAt,
      });

      return list;
    }),

  // Get archived lists
  getArchived: protectedProcedure.query(async ({ ctx }) => {
    const lists = await ctx.db.query.shoppingLists.findMany({
      where: eq(shoppingLists.isArchived, true),
      orderBy: desc(shoppingLists.updatedAt),
    });
    return lists;
  }),
});
