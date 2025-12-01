import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc } from 'drizzle-orm';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { haFavorites } from '../../db/schema';
import { addFavoriteSchema, updateFavoriteSchema, reorderFavoritesSchema } from '@honeydo/shared';
import type { HAFavorite, HAEntityWithFavorite, HADomain } from '@honeydo/shared';

export const favoritesRouter = router({
  /**
   * Get user's favorites
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const favorites = await ctx.db.query.haFavorites.findMany({
      where: eq(haFavorites.userId, ctx.userId),
      orderBy: [haFavorites.sortOrder],
    });

    return favorites as HAFavorite[];
  }),

  /**
   * Get favorites with entity data
   */
  getAllWithEntities: protectedProcedure.query(async ({ ctx }) => {
    const favorites = await ctx.db.query.haFavorites.findMany({
      where: eq(haFavorites.userId, ctx.userId),
      orderBy: [haFavorites.sortOrder],
    });

    // Get all entities that are favorites
    const entityIds = favorites.map((f) => f.entityId);
    const entities = await ctx.db.query.haEntities.findMany({
      where: (table, { inArray }) => inArray(table.entityId, entityIds),
    });

    // Map entities with favorite info
    const entityMap = new Map(entities.map((e) => [e.entityId, e]));

    return favorites.map((fav) => {
      const entity = entityMap.get(fav.entityId);
      return {
        entityId: fav.entityId,
        domain: entity?.domain as HADomain ?? 'sensor',
        friendlyName: fav.displayName ?? entity?.friendlyName ?? fav.entityId,
        state: entity?.state ?? 'unavailable',
        attributes: entity?.attributes as Record<string, unknown> | null ?? null,
        areaId: entity?.areaId ?? null,
        lastChanged: null,
        lastUpdated: entity?.lastUpdated ?? null,
        isFavorite: true,
        favorite: fav as HAFavorite,
      } satisfies HAEntityWithFavorite;
    });
  }),

  /**
   * Add entity to favorites
   */
  add: protectedProcedure.input(addFavoriteSchema).mutation(async ({ ctx, input }) => {
    // Check if already a favorite
    const existing = await ctx.db.query.haFavorites.findFirst({
      where: and(
        eq(haFavorites.userId, ctx.userId),
        eq(haFavorites.entityId, input.entityId)
      ),
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Entity is already a favorite',
      });
    }

    // Get max sort order
    const maxOrder = await ctx.db.query.haFavorites.findFirst({
      where: eq(haFavorites.userId, ctx.userId),
      orderBy: [desc(haFavorites.sortOrder)],
    });

    const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;

    const [favorite] = await ctx.db
      .insert(haFavorites)
      .values({
        userId: ctx.userId,
        entityId: input.entityId,
        displayName: input.displayName,
        icon: input.icon,
        sortOrder,
      })
      .returning();

    return favorite as HAFavorite;
  }),

  /**
   * Update a favorite
   */
  update: protectedProcedure.input(updateFavoriteSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.haFavorites.findFirst({
      where: and(eq(haFavorites.id, input.id), eq(haFavorites.userId, ctx.userId)),
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Favorite not found',
      });
    }

    const [updated] = await ctx.db
      .update(haFavorites)
      .set({
        displayName: input.displayName,
        icon: input.icon,
      })
      .where(eq(haFavorites.id, input.id))
      .returning();

    return updated as HAFavorite;
  }),

  /**
   * Remove from favorites
   */
  remove: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(haFavorites)
        .where(
          and(eq(haFavorites.userId, ctx.userId), eq(haFavorites.entityId, input.entityId))
        );

      return { success: true };
    }),

  /**
   * Reorder favorites
   */
  reorder: protectedProcedure.input(reorderFavoritesSchema).mutation(async ({ ctx, input }) => {
    // Update sort order for each favorite
    for (let i = 0; i < input.favoriteIds.length; i++) {
      await ctx.db
        .update(haFavorites)
        .set({ sortOrder: i })
        .where(and(eq(haFavorites.id, input.favoriteIds[i]), eq(haFavorites.userId, ctx.userId)));
    }

    return { success: true };
  }),
});
