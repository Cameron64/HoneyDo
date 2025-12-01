import { TRPCError, middleware, publicProcedure } from './index';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/fastify';

// Dev bypass for autonomous testing
const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === 'true';
const DEV_USER_ID = process.env.DEV_USER_ID || 'dev-test-user';

// Middleware to check authentication and sync user
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in' });
  }

  // Check if user exists in our database
  let user = await ctx.db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
  });

  // If not, sync from Clerk (or create dev user in bypass mode)
  if (!user) {
    // In dev bypass mode, create a test user without Clerk
    if (DEV_BYPASS_AUTH && ctx.userId === DEV_USER_ID) {
      const existingUsers = await ctx.db.query.users.findMany({ limit: 1 });
      const role = existingUsers.length === 0 ? 'admin' : 'member';

      const [newUser] = await ctx.db
        .insert(users)
        .values({
          id: DEV_USER_ID,
          email: 'dev@test.local',
          name: 'Dev Test User',
          avatarUrl: null,
          role,
        })
        .returning();

      user = newUser;
      console.log(`Dev test user created: dev@test.local (${role})`);
    } else {
      // Normal Clerk sync
      try {
        const clerkUser = await clerkClient.users.getUser(ctx.userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;

        if (email) {
          // First user becomes admin, others are members
          const existingUsers = await ctx.db.query.users.findMany({ limit: 1 });
          const role = existingUsers.length === 0 ? 'admin' : 'member';

          const [newUser] = await ctx.db
            .insert(users)
            .values({
              id: ctx.userId,
              email,
              name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || null,
              avatarUrl: clerkUser.imageUrl,
              role,
            })
            .returning();

          user = newUser;
          console.log(`User synced from Clerk: ${email} (${role})`);
        }
      } catch (error) {
        console.error('Failed to sync user from Clerk:', error);
      }
    }
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      user,
    },
  });
});

// Middleware to check admin role (runs after isAuthenticated)
const isAdmin = middleware(async ({ ctx, next }) => {
  // User is already loaded by isAuthenticated middleware
  const user = (ctx as { user?: typeof users.$inferSelect }).user;

  if (!user || user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }

  return next({ ctx });
});

// Procedure types
export const protectedProcedure = publicProcedure.use(isAuthenticated);
export const adminProcedure = publicProcedure.use(isAuthenticated).use(isAdmin);
