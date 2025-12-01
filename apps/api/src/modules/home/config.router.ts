import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { protectedProcedure, adminProcedure } from '../../trpc/procedures';
import { haConfig } from '../../db/schema';
import { configureHAInputSchema } from '@honeydo/shared';
import { disconnectHA, reconnectHA, encrypt } from '../../services/homeassistant';
import { HomeAssistantConnection } from '../../services/homeassistant/connection';

export const configRouter = router({
  /**
   * Get connection status (any authenticated user)
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const config = await ctx.db.query.haConfig.findFirst();

    return {
      configured: !!config?.url,
      connected: config?.isConnected ?? false,
      lastConnectedAt: config?.lastConnectedAt ?? null,
      lastError: config?.lastError ?? null,
    };
  }),

  /**
   * Configure Home Assistant connection (admin only)
   */
  configure: adminProcedure.input(configureHAInputSchema).mutation(async ({ ctx, input }) => {
    // Convert HTTP URL to WebSocket URL
    let wsUrl = input.url.trim();
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    }
    if (!wsUrl.endsWith('/api/websocket')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/api/websocket';
    }

    // Save configuration
    await ctx.db
      .insert(haConfig)
      .values({
        id: 1,
        url: wsUrl,
        accessToken: encrypt(input.accessToken),
        isConnected: false,
      })
      .onConflictDoUpdate({
        target: haConfig.id,
        set: {
          url: wsUrl,
          accessToken: encrypt(input.accessToken),
          isConnected: false,
          lastError: null,
          updatedAt: new Date().toISOString(),
        },
      });

    // Try to connect
    const success = await reconnectHA();

    if (!success) {
      const config = await ctx.db.query.haConfig.findFirst();
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: config?.lastError ?? 'Failed to connect to Home Assistant',
      });
    }

    return { success: true };
  }),

  /**
   * Test connection without saving (admin only)
   */
  testConnection: adminProcedure.input(configureHAInputSchema).mutation(async ({ input }) => {
    // Convert HTTP URL to WebSocket URL
    let wsUrl = input.url.trim();
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://');
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://');
    }
    if (!wsUrl.endsWith('/api/websocket')) {
      wsUrl = wsUrl.replace(/\/$/, '') + '/api/websocket';
    }

    const testConn = new HomeAssistantConnection(wsUrl, input.accessToken);

    try {
      await testConn.connect();
      const states = await testConn.getStates();
      testConn.disconnect();

      return {
        success: true,
        entityCount: states.length,
      };
    } catch (error) {
      testConn.disconnect();

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  /**
   * Disconnect from Home Assistant (admin only)
   */
  disconnect: adminProcedure.mutation(async () => {
    await disconnectHA();
    return { success: true };
  }),

  /**
   * Reconnect to Home Assistant (admin only)
   */
  reconnect: adminProcedure.mutation(async () => {
    const success = await reconnectHA();
    return { success };
  }),
});
