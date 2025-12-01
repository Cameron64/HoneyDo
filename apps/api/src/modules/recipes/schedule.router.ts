import { router, TRPCError } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { setScheduleSchema } from '@honeydo/shared';
import { suggestionSchedules } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const scheduleRouter = router({
  // Get user's suggestion schedule
  get: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.suggestionSchedules.findFirst({
      where: eq(suggestionSchedules.userId, ctx.userId),
    });
  }),

  // Set/update the suggestion schedule
  set: protectedProcedure
    .input(setScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if schedule exists
      const existing = await ctx.db.query.suggestionSchedules.findFirst({
        where: eq(suggestionSchedules.userId, ctx.userId),
      });

      if (existing) {
        // Update existing
        const [updated] = await ctx.db
          .update(suggestionSchedules)
          .set({
            dayOfWeek: input.dayOfWeek,
            hour: input.hour,
            daysAhead: input.daysAhead,
            isActive: true,
          })
          .where(eq(suggestionSchedules.userId, ctx.userId))
          .returning();

        return updated;
      }

      // Create new
      const [created] = await ctx.db
        .insert(suggestionSchedules)
        .values({
          userId: ctx.userId,
          dayOfWeek: input.dayOfWeek,
          hour: input.hour,
          daysAhead: input.daysAhead,
          isActive: true,
        })
        .returning();

      return created;
    }),

  // Disable automatic suggestions
  disable: protectedProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.suggestionSchedules.findFirst({
      where: eq(suggestionSchedules.userId, ctx.userId),
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No schedule found',
      });
    }

    const [updated] = await ctx.db
      .update(suggestionSchedules)
      .set({
        isActive: false,
      })
      .where(eq(suggestionSchedules.userId, ctx.userId))
      .returning();

    return updated;
  }),

  // Enable automatic suggestions
  enable: protectedProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.suggestionSchedules.findFirst({
      where: eq(suggestionSchedules.userId, ctx.userId),
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No schedule found. Please set a schedule first.',
      });
    }

    const [updated] = await ctx.db
      .update(suggestionSchedules)
      .set({
        isActive: true,
      })
      .where(eq(suggestionSchedules.userId, ctx.userId))
      .returning();

    return updated;
  }),

  // Manually trigger suggestions now (uses schedule's daysAhead)
  triggerNow: protectedProcedure.mutation(async ({ ctx }) => {
    const schedule = await ctx.db.query.suggestionSchedules.findFirst({
      where: eq(suggestionSchedules.userId, ctx.userId),
    });

    const daysAhead = schedule?.daysAhead ?? 7;

    // Calculate date range
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Update last run time
    if (schedule) {
      await ctx.db
        .update(suggestionSchedules)
        .set({ lastRunAt: new Date().toISOString() })
        .where(eq(suggestionSchedules.userId, ctx.userId));
    }

    // Return the parameters - the actual suggestion request
    // should be done via suggestions.request with these params
    // This is just a convenience endpoint to get the right date range

    return {
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      daysAhead,
    };
  }),
});
