import { TRPCError } from '@trpc/server';
import { middleware } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { isHAConnected } from '../../services/homeassistant';

/**
 * Middleware that checks if Home Assistant is connected.
 * Throws PRECONDITION_FAILED if not connected.
 */
const requireHAConnection = middleware(async ({ next }) => {
  if (!isHAConnected()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Not connected to Home Assistant',
    });
  }
  return next();
});

/**
 * Protected procedure that requires Home Assistant connection.
 * Use this for all procedures that interact with Home Assistant.
 */
export const haConnectedProcedure = protectedProcedure.use(requireHAConnection);
