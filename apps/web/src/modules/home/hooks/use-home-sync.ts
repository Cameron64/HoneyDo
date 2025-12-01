import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocketEvent } from '@/services/socket/hooks';
import type { StateChangedEvent, HAScene } from '@honeydo/shared';

/**
 * Hook for syncing home automation state via WebSocket
 */
export function useHomeSync() {
  const utils = trpc.useUtils();

  // Handle connection status changes
  const handleConnectionStatus = useCallback(
    (data: { connected: boolean; error?: string }) => {
      // Invalidate config status query
      utils.home.config.getStatus.invalidate();

      if (data.connected) {
        // Refresh entities when connected
        utils.home.entities.getAll.invalidate();
      }
    },
    [utils]
  );

  // Handle entity state changes
  const handleEntityStateChanged = useCallback(
    (event: StateChangedEvent) => {
      // Update the entity in the cache
      utils.home.entities.getAll.setData(undefined, (old) =>
        old?.map((entity) =>
          entity.entityId === event.entityId
            ? {
                ...entity,
                state: event.newState,
                attributes: event.attributes ?? entity.attributes,
                lastUpdated: new Date().toISOString(),
              }
            : entity
        )
      );

      // Also update the single entity query if it's cached
      utils.home.entities.getById.setData({ entityId: event.entityId }, (old) =>
        old
          ? {
              ...old,
              state: event.newState,
              attributes: event.attributes ?? old.attributes,
              lastUpdated: new Date().toISOString(),
            }
          : undefined
      );

      // Update favorites with entities
      utils.home.favorites.getAllWithEntities.setData(undefined, (old) =>
        old?.map((entity) =>
          entity.entityId === event.entityId
            ? {
                ...entity,
                state: event.newState,
                attributes: event.attributes ?? entity.attributes,
                lastUpdated: new Date().toISOString(),
              }
            : entity
        )
      );
    },
    [utils]
  );

  // Handle scene created
  const handleSceneCreated = useCallback(
    (scene: HAScene) => {
      utils.home.scenes.getAll.setData(undefined, (old) => (old ? [...old, scene] : [scene]));
    },
    [utils]
  );

  // Handle scene updated
  const handleSceneUpdated = useCallback(
    (scene: HAScene) => {
      utils.home.scenes.getAll.setData(undefined, (old) =>
        old?.map((s) => (s.id === scene.id ? scene : s))
      );
    },
    [utils]
  );

  // Handle scene deleted
  const handleSceneDeleted = useCallback(
    ({ id }: { id: string }) => {
      utils.home.scenes.getAll.setData(undefined, (old) => old?.filter((s) => s.id !== id));
    },
    [utils]
  );

  // Subscribe to socket events
  useSocketEvent('home:connection:status', handleConnectionStatus);
  useSocketEvent('home:entity:state-changed', handleEntityStateChanged);
  useSocketEvent('home:scene:created', handleSceneCreated);
  useSocketEvent('home:scene:updated', handleSceneUpdated);
  useSocketEvent('home:scene:deleted', handleSceneDeleted);

  return {
    invalidateEntities: () => utils.home.entities.getAll.invalidate(),
    invalidateScenes: () => utils.home.scenes.getAll.invalidate(),
    invalidateFavorites: () => utils.home.favorites.getAllWithEntities.invalidate(),
    invalidateConfig: () => utils.home.config.getStatus.invalidate(),
    invalidateAll: () => {
      utils.home.config.getStatus.invalidate();
      utils.home.entities.getAll.invalidate();
      utils.home.scenes.getAll.invalidate();
      utils.home.favorites.getAllWithEntities.invalidate();
    },
  };
}
