/**
 * Batches Router
 *
 * Handles batch management operations outside of the wizard workflow.
 */

import { router } from '../../../trpc';
import { protectedProcedure } from '../../../trpc/procedures';
import { z } from 'zod';
import { batches } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getActiveBatch } from './helpers';

export const batchesRouter = router({
  /**
   * Get active batch for current user
   */
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return getActiveBatch(ctx.db, ctx.userId);
  }),

  /**
   * Get batch history
   */
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.batches.findMany({
        where: and(
          eq(batches.userId, ctx.userId),
          eq(batches.status, 'archived')
        ),
        orderBy: desc(batches.archivedAt),
        limit: input.limit,
      });
    }),
});
