import { eq } from 'drizzle-orm';
import { HomeAssistantConnection } from './connection';
import { db } from '../../db';
import { haConfig, haEntities, haActionLog } from '../../db/schema';
import { socketEmitter } from '../websocket/emitter';
import type { HAEntity, StateChangedEvent, HADomain } from '@honeydo/shared';

/**
 * Singleton connection instance
 */
let connection: HomeAssistantConnection | null = null;

/**
 * Decrypt access token
 * TODO: Implement proper encryption/decryption
 */
function decrypt(encrypted: string): string {
  // For now, tokens are stored as-is
  // In production, use proper encryption (e.g., AES-256-GCM with key from env)
  return encrypted;
}

/**
 * Encrypt access token
 * TODO: Implement proper encryption
 */
export function encrypt(plain: string): string {
  // For now, tokens are stored as-is
  // In production, use proper encryption
  return plain;
}

/**
 * Initialize Home Assistant connection on server startup
 */
export async function initializeHA(): Promise<boolean> {
  const config = await db.query.haConfig.findFirst();

  if (!config?.url || !config?.accessToken) {
    console.log('[HA] No configuration found, skipping initialization');
    return false;
  }

  try {
    connection = new HomeAssistantConnection(config.url, decrypt(config.accessToken));

    // Handle connection events
    connection.on('connected', async () => {
      console.log('[HA] Connected successfully');

      await db
        .update(haConfig)
        .set({
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
          lastError: null,
        })
        .where(eq(haConfig.id, 1));

      socketEmitter.broadcast('home:connection:status', { connected: true });

      // Cache initial states
      await cacheStates();

      // Subscribe to state changes
      if (connection) {
        await connection.subscribeToStateChanges();
      }
    });

    connection.on('disconnected', async () => {
      console.log('[HA] Disconnected');

      await db.update(haConfig).set({ isConnected: false }).where(eq(haConfig.id, 1));

      socketEmitter.broadcast('home:connection:status', { connected: false });
    });

    connection.on('failed', async (error: Error) => {
      console.error('[HA] Connection failed:', error.message);

      await db
        .update(haConfig)
        .set({
          isConnected: false,
          lastError: error.message,
        })
        .where(eq(haConfig.id, 1));

      socketEmitter.broadcast('home:connection:status', {
        connected: false,
        error: error.message,
      });
    });

    connection.on('state_changed', handleStateChange);

    await connection.connect();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[HA] Initialization failed:', errorMessage);

    await db
      .update(haConfig)
      .set({
        isConnected: false,
        lastError: errorMessage,
      })
      .where(eq(haConfig.id, 1));

    return false;
  }
}

/**
 * Get the current HA connection (if any)
 */
export function getHAConnection(): HomeAssistantConnection | null {
  return connection;
}

/**
 * Check if connected to Home Assistant
 */
export function isHAConnected(): boolean {
  return connection?.isConnected ?? false;
}

/**
 * Disconnect from Home Assistant
 */
export async function disconnectHA(): Promise<void> {
  if (connection) {
    connection.disconnect();
    connection = null;

    await db.update(haConfig).set({ isConnected: false }).where(eq(haConfig.id, 1));

    socketEmitter.broadcast('home:connection:status', { connected: false });
  }
}

/**
 * Reconnect to Home Assistant with new configuration
 */
export async function reconnectHA(): Promise<boolean> {
  // Disconnect existing connection
  if (connection) {
    connection.disconnect();
    connection = null;
  }

  // Initialize with new config
  return initializeHA();
}

/**
 * Cache all entity states in the database
 */
async function cacheStates(): Promise<void> {
  if (!connection) return;

  try {
    const states = await connection.getStates();
    console.log(`[HA] Caching ${states.length} entities`);

    for (const state of states) {
      await db
        .insert(haEntities)
        .values({
          entityId: state.entityId,
          domain: state.domain as HADomain,
          friendlyName: state.friendlyName,
          state: state.state,
          attributes: state.attributes,
          areaId: state.areaId,
          lastUpdated: state.lastUpdated,
        })
        .onConflictDoUpdate({
          target: haEntities.entityId,
          set: {
            state: state.state,
            attributes: state.attributes,
            areaId: state.areaId,
            lastUpdated: state.lastUpdated,
          },
        });
    }

    console.log('[HA] Entity cache updated');
  } catch (error) {
    console.error('[HA] Failed to cache states:', error);
  }
}

/**
 * Handle state change events from Home Assistant
 */
function handleStateChange(event: StateChangedEvent): void {
  // Update cache
  db.update(haEntities)
    .set({
      state: event.newState,
      attributes: event.attributes ?? {},
      lastUpdated: new Date().toISOString(),
    })
    .where(eq(haEntities.entityId, event.entityId))
    .then(() => {
      // Broadcast to clients
      socketEmitter.broadcast('home:entity:state-changed', event);
    })
    .catch((error) => {
      console.error('[HA] Failed to update entity cache:', error);
    });
}

/**
 * Call a Home Assistant service
 */
export async function callService(
  userId: string | null,
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (!connection?.isConnected) {
    throw new Error('Not connected to Home Assistant');
  }

  try {
    await connection.callService(domain, service, data, { entity_id: entityId });

    // Log successful action
    await db.insert(haActionLog).values({
      userId,
      actionType: 'service_call',
      details: { domain, service, entityId, data },
      status: 'success',
    });

    // Broadcast action result
    socketEmitter.broadcast('home:action:executed', {
      entityId,
      service,
      status: 'success',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed action
    await db.insert(haActionLog).values({
      userId,
      actionType: 'service_call',
      details: { domain, service, entityId, data },
      status: 'error',
      errorMessage,
    });

    // Broadcast action failure
    socketEmitter.broadcast('home:action:executed', {
      entityId,
      service,
      status: 'error',
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Toggle an entity (light, switch, etc.)
 */
export async function toggleEntity(userId: string, entityId: string): Promise<void> {
  const domain = entityId.split('.')[0];

  // Only certain domains support toggle
  if (!['light', 'switch', 'fan', 'cover'].includes(domain)) {
    throw new Error(`Domain '${domain}' does not support toggle`);
  }

  await callService(userId, domain, 'toggle', entityId);
}

/**
 * Get all cached entities
 */
export async function getCachedEntities(): Promise<HAEntity[]> {
  const entities = await db.query.haEntities.findMany();

  return entities.map((entity) => ({
    entityId: entity.entityId,
    domain: entity.domain as HADomain,
    friendlyName: entity.friendlyName,
    state: entity.state,
    attributes: entity.attributes as Record<string, unknown> | null,
    areaId: entity.areaId,
    lastChanged: null,
    lastUpdated: entity.lastUpdated,
  }));
}

/**
 * Get entities by domain
 */
export async function getEntitiesByDomain(domain: HADomain): Promise<HAEntity[]> {
  const entities = await db.query.haEntities.findMany({
    where: eq(haEntities.domain, domain),
  });

  return entities.map((entity) => ({
    entityId: entity.entityId,
    domain: entity.domain as HADomain,
    friendlyName: entity.friendlyName,
    state: entity.state,
    attributes: entity.attributes as Record<string, unknown> | null,
    areaId: entity.areaId,
    lastChanged: null,
    lastUpdated: entity.lastUpdated,
  }));
}

/**
 * Refresh entity states from Home Assistant
 */
export async function refreshStates(): Promise<void> {
  await cacheStates();
}
