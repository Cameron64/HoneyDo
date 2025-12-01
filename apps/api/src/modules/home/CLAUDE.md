# Home Automation Module (Backend) - Claude Code Instructions

> Backend implementation of the Home Automation feature (Epic 3)

## Module Overview

The Home Automation module provides integration with Home Assistant for smart home control:
- **Connection Management**: Configure and maintain WebSocket connection to HA
- **Entity Management**: Cache and query device states
- **Actions**: Execute service calls to control devices
- **Favorites**: User-specific pinned entities
- **Scenes**: Custom multi-action automations

## Module Architecture

```
apps/api/src/modules/home/
├── CLAUDE.md              # This file
├── index.ts               # Module exports
├── router.ts              # Main router (combines sub-routers)
├── config.router.ts       # Connection configuration (admin)
├── entities.router.ts     # Entity queries
├── actions.router.ts      # Device control
├── favorites.router.ts    # User favorites
└── scenes.router.ts       # Custom scenes
```

### Router Structure

The home module uses a **5-router pattern**:

```typescript
// router.ts - Main entry point
export const homeRouter = router({
  config: configRouter,     // Connection config (admin)
  entities: entitiesRouter, // Entity queries
  actions: actionsRouter,   // Service calls
  favorites: favoritesRouter, // User favorites
  scenes: scenesRouter,     // Custom scenes
});
```

**Usage from frontend:**
```typescript
trpc.home.config.getStatus.useQuery();
trpc.home.entities.getAll.useQuery();
trpc.home.actions.toggle.useMutation();
trpc.home.favorites.add.useMutation();
trpc.home.scenes.activate.useMutation();
```

## API Reference

### Config Router (`config.router.ts`)

| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `getStatus` | Query | Protected | Get connection status |
| `configure` | Mutation | Admin | Set HA URL and token |
| `testConnection` | Mutation | Admin | Test connection without saving |
| `disconnect` | Mutation | Admin | Disconnect from HA |
| `reconnect` | Mutation | Admin | Reconnect to HA |

### Entities Router (`entities.router.ts`)

| Procedure | Type | Description |
|-----------|------|-------------|
| `getAll` | Query | Get all cached entities |
| `getByDomain` | Query | Get entities by domain (light, switch, etc.) |
| `getById` | Query | Get single entity |
| `refresh` | Mutation | Force refresh from HA |
| `getGroupedByDomain` | Query | Entities grouped by domain |
| `getGroupedByArea` | Query | Entities grouped by area |
| `search` | Query | Search entities by name |

### Actions Router (`actions.router.ts`)

| Procedure | Type | Description |
|-----------|------|-------------|
| `callService` | Mutation | Generic service call |
| `toggle` | Mutation | Quick toggle for lights/switches |
| `turnOn` | Mutation | Turn on with optional data |
| `turnOff` | Mutation | Turn off |
| `setBrightness` | Mutation | Set light brightness |
| `setTemperature` | Mutation | Set climate temperature |
| `setLockState` | Mutation | Lock/unlock (requires confirmation) |

### Favorites Router (`favorites.router.ts`)

| Procedure | Type | Description |
|-----------|------|-------------|
| `getAll` | Query | Get user's favorites |
| `getAllWithEntities` | Query | Favorites with entity data |
| `add` | Mutation | Add entity to favorites |
| `update` | Mutation | Update favorite (name, icon) |
| `remove` | Mutation | Remove from favorites |
| `reorder` | Mutation | Reorder favorites |

### Scenes Router (`scenes.router.ts`)

| Procedure | Type | Description |
|-----------|------|-------------|
| `getAll` | Query | Get all scenes (own + shared) |
| `getById` | Query | Get single scene |
| `create` | Mutation | Create new scene |
| `update` | Mutation | Update scene |
| `delete` | Mutation | Delete scene |
| `activate` | Mutation | Execute scene actions |
| `reorder` | Mutation | Reorder scenes |

## WebSocket Events

All events are emitted via `socketEmitter.broadcast()` or `socketEmitter.toOthers()`.

| Event | Payload | When |
|-------|---------|------|
| `home:connection:status` | `{ connected, error? }` | Connection state changes |
| `home:entity:state-changed` | `StateChangedEvent` | Device state changes |
| `home:action:executed` | `{ entityId, service, status, error? }` | Action completes |
| `home:scene:activated` | `{ sceneId, activatedBy }` | Scene activated |
| `home:scene:created` | `HAScene` | Scene created |
| `home:scene:updated` | `HAScene` | Scene updated |
| `home:scene:deleted` | `{ id }` | Scene deleted |

## Database Schema

See `apps/api/src/db/schema/home-automation.ts`:

| Table | Purpose |
|-------|---------|
| `ha_config` | Connection configuration (single row) |
| `ha_entities` | Cached entity states |
| `ha_favorites` | User-pinned entities |
| `ha_scenes` | Custom scene definitions |
| `ha_action_log` | Action audit log |

## Home Assistant Service

The HA connection is managed by `apps/api/src/services/homeassistant/`:

| Function | Purpose |
|----------|---------|
| `initializeHA()` | Connect on server startup |
| `getHAConnection()` | Get current connection |
| `isHAConnected()` | Check connection status |
| `disconnectHA()` | Disconnect |
| `reconnectHA()` | Reconnect with new config |
| `callService()` | Execute service call |
| `toggleEntity()` | Quick toggle |
| `getCachedEntities()` | Get all cached entities |
| `refreshStates()` | Force refresh from HA |

### Connection Class

The `HomeAssistantConnection` class handles:
- WebSocket connection lifecycle
- Authentication flow
- Request/response correlation
- Auto-reconnection
- State change subscriptions

## Supported Domains

| Domain | Controllable | Actions |
|--------|--------------|---------|
| `light` | Yes | toggle, turn_on, turn_off, brightness |
| `switch` | Yes | toggle, turn_on, turn_off |
| `fan` | Yes | toggle, turn_on, turn_off |
| `climate` | Yes | set_temperature, set_hvac_mode |
| `lock` | Yes (confirm) | lock, unlock |
| `cover` | Yes (confirm) | open, close, stop |
| `sensor` | No | Read-only |
| `binary_sensor` | No | Read-only |

## Security Considerations

1. **Token Security**: HA tokens are stored encrypted (TODO: implement proper encryption)
2. **Admin Only**: Connection configuration requires admin role
3. **Sensitive Actions**: Lock/cover actions require confirmation
4. **Action Logging**: All service calls are logged with user ID

## Code Patterns

### Service Call Pattern

```typescript
import { callService, isHAConnected } from '../../services/homeassistant';

// In mutation
.mutation(async ({ ctx, input }) => {
  if (!isHAConnected()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Not connected to Home Assistant',
    });
  }

  await callService(ctx.userId, domain, service, entityId, data);
  return { success: true };
});
```

### Entity Caching

Entities are cached on connection and updated in real-time:
```typescript
connection.on('state_changed', (event) => {
  // Update cache
  db.update(haEntities).set({ state: event.newState, ... });
  // Broadcast to clients
  socketEmitter.broadcast('home:entity:state-changed', event);
});
```

## Files to Reference

- Database schema: `apps/api/src/db/schema/home-automation.ts`
- Shared schemas: `packages/shared/src/schemas/home-automation.ts`
- WebSocket service: `apps/api/src/services/homeassistant/`
- Feature plan: `docs/epics/3-home-automation/PLAN.md`
