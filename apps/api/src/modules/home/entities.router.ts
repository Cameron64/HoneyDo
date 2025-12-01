import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { haEntities } from '../../db/schema';
import { haDomainSchema } from '@honeydo/shared';
import {
  getCachedEntities,
  getEntitiesByDomain,
  refreshStates,
  isHAConnected,
} from '../../services/homeassistant';
import type { HAEntity, HADomain } from '@honeydo/shared';

export const entitiesRouter = router({
  /**
   * Get all cached entities
   */
  getAll: protectedProcedure.query(async () => {
    return getCachedEntities();
  }),

  /**
   * Get entities by domain (light, switch, sensor, etc.)
   */
  getByDomain: protectedProcedure
    .input(z.object({ domain: haDomainSchema }))
    .query(async ({ input }) => {
      return getEntitiesByDomain(input.domain);
    }),

  /**
   * Get a single entity by ID
   */
  getById: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entity = await ctx.db.query.haEntities.findFirst({
        where: eq(haEntities.entityId, input.entityId),
      });

      if (!entity) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Entity not found',
        });
      }

      return {
        entityId: entity.entityId,
        domain: entity.domain as HADomain,
        friendlyName: entity.friendlyName,
        state: entity.state,
        attributes: entity.attributes as Record<string, unknown> | null,
        areaId: entity.areaId,
        lastChanged: null,
        lastUpdated: entity.lastUpdated,
      } satisfies HAEntity;
    }),

  /**
   * Force refresh all entity states from Home Assistant
   */
  refresh: protectedProcedure.mutation(async () => {
    if (!isHAConnected()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Not connected to Home Assistant',
      });
    }

    await refreshStates();
    return { success: true };
  }),

  /**
   * Get entities grouped by domain
   */
  getGroupedByDomain: protectedProcedure.query(async () => {
    const entities = await getCachedEntities();

    const grouped = entities.reduce(
      (acc, entity) => {
        const domain = entity.domain;
        if (!acc[domain]) {
          acc[domain] = [];
        }
        acc[domain].push(entity);
        return acc;
      },
      {} as Record<HADomain, HAEntity[]>
    );

    return grouped;
  }),

  /**
   * Get entities grouped by area
   */
  getGroupedByArea: protectedProcedure.query(async () => {
    const entities = await getCachedEntities();

    const grouped = entities.reduce(
      (acc, entity) => {
        const area = entity.areaId ?? 'unassigned';
        if (!acc[area]) {
          acc[area] = [];
        }
        acc[area].push(entity);
        return acc;
      },
      {} as Record<string, HAEntity[]>
    );

    return grouped;
  }),

  /**
   * Search entities by name
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const entities = await getCachedEntities();
      const queryLower = input.query.toLowerCase();

      return entities.filter(
        (entity) =>
          entity.entityId.toLowerCase().includes(queryLower) ||
          entity.friendlyName?.toLowerCase().includes(queryLower)
      );
    }),
});
