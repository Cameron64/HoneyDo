import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { serviceCallSchema, toggleEntitySchema, SENSITIVE_DOMAINS } from '@honeydo/shared';
import { callService, toggleEntity } from '../../services/homeassistant';
import { haConnectedProcedure } from './procedures';

/**
 * Extract domain from entity ID (e.g., "light.living_room" -> "light")
 */
function extractDomain(entityId: string): string {
  return entityId.split('.')[0];
}

export const actionsRouter = router({
  /**
   * Call a Home Assistant service
   */
  callService: haConnectedProcedure.input(serviceCallSchema).mutation(async ({ ctx, input }) => {
    // Check if this is a sensitive action
    if (SENSITIVE_DOMAINS.includes(input.domain)) {
      // For now, just log a warning. In future, add confirmation flow.
      console.log(
        `[HA] Sensitive action requested: ${input.domain}.${input.service} on ${input.entityId}`
      );
    }

    await callService(ctx.userId, input.domain, input.service, input.entityId, input.data);

    return { success: true };
  }),

  /**
   * Quick toggle for lights, switches, etc.
   */
  toggle: haConnectedProcedure.input(toggleEntitySchema).mutation(async ({ ctx, input }) => {
    await toggleEntity(ctx.userId, input.entityId);

    return { success: true };
  }),

  /**
   * Turn on an entity
   */
  turnOn: haConnectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        data: z.record(z.unknown()).optional(), // brightness, color, etc.
      })
    )
    .mutation(async ({ ctx, input }) => {
      const domain = extractDomain(input.entityId);
      await callService(ctx.userId, domain, 'turn_on', input.entityId, input.data);

      return { success: true };
    }),

  /**
   * Turn off an entity
   */
  turnOff: haConnectedProcedure.input(toggleEntitySchema).mutation(async ({ ctx, input }) => {
    const domain = extractDomain(input.entityId);
    await callService(ctx.userId, domain, 'turn_off', input.entityId);

    return { success: true };
  }),

  /**
   * Set brightness for lights
   */
  setBrightness: haConnectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        brightness: z.number().min(0).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const domain = extractDomain(input.entityId);
      if (domain !== 'light') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Brightness can only be set on lights',
        });
      }

      await callService(ctx.userId, 'light', 'turn_on', input.entityId, {
        brightness: input.brightness,
      });

      return { success: true };
    }),

  /**
   * Set climate temperature
   */
  setTemperature: haConnectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        temperature: z.number(),
        hvacMode: z.string().optional(), // heat, cool, auto, off
      })
    )
    .mutation(async ({ ctx, input }) => {
      const domain = extractDomain(input.entityId);
      if (domain !== 'climate') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Temperature can only be set on climate entities',
        });
      }

      await callService(ctx.userId, 'climate', 'set_temperature', input.entityId, {
        temperature: input.temperature,
        hvac_mode: input.hvacMode,
      });

      return { success: true };
    }),

  /**
   * Lock/unlock with confirmation
   */
  setLockState: haConnectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        locked: z.boolean(),
        confirmed: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const domain = extractDomain(input.entityId);
      if (domain !== 'lock') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Lock state can only be set on lock entities',
        });
      }

      // Require confirmation for unlocking
      if (!input.locked && !input.confirmed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Confirmation required to unlock',
        });
      }

      const service = input.locked ? 'lock' : 'unlock';
      await callService(ctx.userId, 'lock', service, input.entityId);

      return { success: true };
    }),
});
