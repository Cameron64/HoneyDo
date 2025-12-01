import { router } from '../../trpc';
import { configRouter } from './config.router';
import { entitiesRouter } from './entities.router';
import { actionsRouter } from './actions.router';
import { favoritesRouter } from './favorites.router';
import { scenesRouter } from './scenes.router';

/**
 * Home Automation Router
 *
 * Provides integration with Home Assistant for smart home control.
 *
 * Sub-routers:
 * - config: Connection configuration (admin only for write operations)
 * - entities: Entity state queries
 * - actions: Service calls and device control
 * - favorites: User's favorite entities
 * - scenes: Custom scene management
 */
export const homeRouter = router({
  config: configRouter,
  entities: entitiesRouter,
  actions: actionsRouter,
  favorites: favoritesRouter,
  scenes: scenesRouter,
});

export type HomeRouter = typeof homeRouter;
