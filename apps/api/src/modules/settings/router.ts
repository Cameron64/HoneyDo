import { z } from 'zod';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { users, userModules, modules } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { updateUserPreferencesSchema } from '@honeydo/shared';
import type { UserPreferences } from '@honeydo/shared';

function getDefaultPreferences(): UserPreferences {
  return {
    theme: 'system',
    notifications: {
      enabled: true,
      push: false,
      sound: true,
    },
  };
}

export const settingsRouter = router({
  // Get current user's preferences
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { preferences: true },
    });
    return user?.preferences ?? getDefaultPreferences();
  }),

  // Update preferences
  update: protectedProcedure
    .input(updateUserPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
        columns: { preferences: true },
      });

      const updated: UserPreferences = {
        ...getDefaultPreferences(),
        ...current?.preferences,
        ...input,
        notifications: {
          ...getDefaultPreferences().notifications,
          ...current?.preferences?.notifications,
          ...input.notifications,
        },
      };

      await ctx.db
        .update(users)
        .set({
          preferences: updated,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, ctx.userId));

      // TODO: Broadcast to user's other devices via WebSocket
      // socketEmitter.toUser(ctx.userId, 'system:settings:updated', { preferences: updated });

      return updated;
    }),

  // Get enabled modules for user
  getModules: protectedProcedure.query(async ({ ctx }) => {
    const userMods = await ctx.db.query.userModules.findMany({
      where: eq(userModules.userId, ctx.userId),
    });

    const allModules = await ctx.db.query.modules.findMany({
      where: eq(modules.enabled, true),
      orderBy: (modules, { asc }) => [asc(modules.sortOrder)],
    });

    return allModules.map((mod) => ({
      ...mod,
      userEnabled: userMods.find((um) => um.moduleId === mod.id)?.enabled ?? true,
      userConfig: userMods.find((um) => um.moduleId === mod.id)?.config ?? {},
    }));
  }),

  // Toggle module for user
  toggleModule: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userModules)
        .values({
          userId: ctx.userId,
          moduleId: input.moduleId,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [userModules.userId, userModules.moduleId],
          set: { enabled: input.enabled },
        });

      return { success: true };
    }),

  // Update module-specific config
  updateModuleConfig: protectedProcedure
    .input(
      z.object({
        moduleId: z.string(),
        config: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userModules)
        .values({
          userId: ctx.userId,
          moduleId: input.moduleId,
          config: input.config,
        })
        .onConflictDoUpdate({
          target: [userModules.userId, userModules.moduleId],
          set: { config: input.config },
        });

      return { success: true };
    }),
});
