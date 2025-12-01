import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, or, desc } from 'drizzle-orm';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { haScenes, haActionLog } from '../../db/schema';
import { createSceneSchema, updateSceneSchema } from '@honeydo/shared';
import { callService, isHAConnected } from '../../services/homeassistant';
import { socketEmitter } from '../../services/websocket/emitter';
import type { HAScene, SceneAction } from '@honeydo/shared';

export const scenesRouter = router({
  /**
   * Get all scenes (user's own + shared scenes)
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const scenes = await ctx.db.query.haScenes.findMany({
      where: or(eq(haScenes.createdBy, ctx.userId), eq(haScenes.isShared, true)),
      orderBy: [haScenes.sortOrder],
    });

    return scenes as HAScene[];
  }),

  /**
   * Get a single scene by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const scene = await ctx.db.query.haScenes.findFirst({
        where: and(
          eq(haScenes.id, input.id),
          or(eq(haScenes.createdBy, ctx.userId), eq(haScenes.isShared, true))
        ),
      });

      if (!scene) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scene not found',
        });
      }

      return scene as HAScene;
    }),

  /**
   * Create a new scene
   */
  create: protectedProcedure.input(createSceneSchema).mutation(async ({ ctx, input }) => {
    // Get max sort order
    const maxOrder = await ctx.db.query.haScenes.findFirst({
      orderBy: [desc(haScenes.sortOrder)],
    });

    const sortOrder = (maxOrder?.sortOrder ?? 0) + 1;

    const [scene] = await ctx.db
      .insert(haScenes)
      .values({
        name: input.name,
        icon: input.icon,
        description: input.description,
        actions: input.actions as SceneAction[],
        createdBy: ctx.userId,
        isShared: input.isShared,
        sortOrder,
      })
      .returning();

    socketEmitter.toOthers(ctx.userId, 'home:scene:created', scene as HAScene);

    return scene as HAScene;
  }),

  /**
   * Update a scene
   */
  update: protectedProcedure.input(updateSceneSchema).mutation(async ({ ctx, input }) => {
    // Check ownership
    const existing = await ctx.db.query.haScenes.findFirst({
      where: eq(haScenes.id, input.id),
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Scene not found',
      });
    }

    if (existing.createdBy !== ctx.userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only edit your own scenes',
      });
    }

    const [scene] = await ctx.db
      .update(haScenes)
      .set({
        name: input.name,
        icon: input.icon,
        description: input.description,
        actions: input.actions as SceneAction[] | undefined,
        isShared: input.isShared,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(haScenes.id, input.id))
      .returning();

    socketEmitter.toOthers(ctx.userId, 'home:scene:updated', scene as HAScene);

    return scene as HAScene;
  }),

  /**
   * Delete a scene
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const existing = await ctx.db.query.haScenes.findFirst({
        where: eq(haScenes.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scene not found',
        });
      }

      if (existing.createdBy !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own scenes',
        });
      }

      await ctx.db.delete(haScenes).where(eq(haScenes.id, input.id));

      socketEmitter.toOthers(ctx.userId, 'home:scene:deleted', { id: input.id });

      return { success: true };
    }),

  /**
   * Activate a scene (execute all actions)
   */
  activate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isHAConnected()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Not connected to Home Assistant',
        });
      }

      const scene = await ctx.db.query.haScenes.findFirst({
        where: and(
          eq(haScenes.id, input.id),
          or(eq(haScenes.createdBy, ctx.userId), eq(haScenes.isShared, true))
        ),
      });

      if (!scene) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scene not found',
        });
      }

      const actions = scene.actions as SceneAction[];
      const errors: string[] = [];

      // Execute all actions
      for (const action of actions) {
        try {
          await callService(ctx.userId, action.domain, action.service, action.entityId, action.data);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${action.entityId}: ${errorMessage}`);
        }
      }

      // Log scene activation
      await ctx.db.insert(haActionLog).values({
        userId: ctx.userId,
        actionType: 'scene_activate',
        details: { sceneId: scene.id, sceneName: scene.name, actionsCount: actions.length },
        status: errors.length > 0 ? 'error' : 'success',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      });

      // Broadcast scene activation
      socketEmitter.broadcast('home:scene:activated', {
        sceneId: scene.id,
        activatedBy: ctx.userId,
      });

      if (errors.length > 0) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Scene activated with errors: ${errors.join(', ')}`,
        });
      }

      return { success: true };
    }),

  /**
   * Reorder scenes
   */
  reorder: protectedProcedure
    .input(z.object({ sceneIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      for (let i = 0; i < input.sceneIds.length; i++) {
        await ctx.db
          .update(haScenes)
          .set({ sortOrder: i })
          .where(eq(haScenes.id, input.sceneIds[i]));
      }

      return { success: true };
    }),
});
