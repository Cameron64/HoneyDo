import { z } from 'zod';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const userRouter = router({
  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    return user ?? null;
  }),

  // Update profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(users.id, ctx.userId));
      return { success: true };
    }),

  // Check if user exists (for first-time setup)
  exists: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { id: true },
    });
    return { exists: !!user };
  }),
});
