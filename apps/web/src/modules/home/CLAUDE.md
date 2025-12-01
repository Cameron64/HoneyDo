# Home Automation Module (Frontend) - Claude Code Instructions

> React components and hooks for the Home Automation feature (Epic 3)

## Module Overview

The Home Automation module provides a UI for controlling Home Assistant devices:
- **Connection Settings**: Configure HA URL and access token
- **Device Grid**: View and control devices by domain
- **Favorites**: Quick access to pinned entities
- **Real-time Sync**: WebSocket updates for state changes

## Module Structure

```
apps/web/src/modules/home/
├── CLAUDE.md                      # This file
├── index.ts                       # Public exports
├── components/
│   ├── index.ts                  # Component exports
│   ├── HomeAutomationPage.tsx    # Main page
│   ├── HAConnectionSettings.tsx  # Connection config UI
│   └── EntityCard.tsx            # Single device card
└── hooks/
    ├── index.ts                  # Hook exports
    └── use-home-sync.ts          # WebSocket event handlers
```

## Component Reference

### HomeAutomationPage

Main page component with tabbed interface for devices by domain.

**Features:**
- Shows connection settings if not configured
- Tabs for Favorites, Lights, Switches, Climate
- Refresh button to force sync from HA
- Settings button to access connection config

**tRPC Usage:**
```typescript
const { data: status } = trpc.home.config.getStatus.useQuery();
const { data: entities } = trpc.home.entities.getAll.useQuery();
const { data: favorites } = trpc.home.favorites.getAllWithEntities.useQuery();
useHomeSync(); // WebSocket sync
```

### HAConnectionSettings

Form for configuring Home Assistant connection.

**States:**
- Not configured: Shows URL and token inputs
- Configured but disconnected: Shows reconnect button + form
- Connected: Shows status and disconnect button

**Mutations:**
```typescript
trpc.home.config.testConnection.useMutation();
trpc.home.config.configure.useMutation();
trpc.home.config.disconnect.useMutation();
trpc.home.config.reconnect.useMutation();
```

### EntityCard

Individual device card with toggle functionality.

**Props:**
```typescript
interface EntityCardProps {
  entity: HAEntity;
  isFavorite?: boolean;
  onToggleFavorite?: (entityId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
}
```

**Features:**
- Domain-specific icon
- State display (on/off, temperature, etc.)
- Click to toggle (for controllable domains)
- Star button to add/remove from favorites
- Optimistic updates on toggle

## Hooks Reference

### useHomeSync

Sets up WebSocket event listeners and updates tRPC cache.

**Usage:**
```typescript
const { invalidateAll, invalidateEntities } = useHomeSync();
```

**Handled Events:**

| Event | Handler | Cache Update |
|-------|---------|--------------|
| `home:connection:status` | `handleConnectionStatus` | Invalidate `config.getStatus` |
| `home:entity:state-changed` | `handleEntityStateChanged` | Update entity in `entities.getAll` |
| `home:scene:created` | `handleSceneCreated` | Add to `scenes.getAll` |
| `home:scene:updated` | `handleSceneUpdated` | Update in `scenes.getAll` |
| `home:scene:deleted` | `handleSceneDeleted` | Remove from `scenes.getAll` |

## tRPC Integration

### Queries

```typescript
// Get connection status
const { data: status } = trpc.home.config.getStatus.useQuery();

// Get all entities (when connected)
const { data: entities } = trpc.home.entities.getAll.useQuery(undefined, {
  enabled: status?.connected,
});

// Get favorites with entity data
const { data: favorites } = trpc.home.favorites.getAllWithEntities.useQuery();

// Get entities by domain
const { data: lights } = trpc.home.entities.getByDomain.useQuery({ domain: 'light' });
```

### Mutations with Optimistic Updates

```typescript
const utils = trpc.useUtils();

const toggle = trpc.home.actions.toggle.useMutation({
  onMutate: async ({ entityId }) => {
    // Optimistic update
    const newState = entity.state === 'on' ? 'off' : 'on';
    utils.home.entities.getAll.setData(undefined, (old) =>
      old?.map((e) => (e.entityId === entityId ? { ...e, state: newState } : e))
    );
  },
  onError: () => {
    // Revert on error
    utils.home.entities.getAll.invalidate();
  },
});
```

## Styling Patterns

### Entity State Colors

```typescript
<Card
  className={cn(
    'p-4 cursor-pointer',
    isOn && 'bg-primary/10 border-primary/30',
    isUnavailable && 'opacity-50 cursor-not-allowed'
  )}
>
```

### Domain Icons

```typescript
const DOMAIN_ICONS: Record<HADomain, React.ElementType> = {
  light: Lightbulb,
  switch: Power,
  fan: Fan,
  climate: Thermometer,
  lock: Lock,
  cover: ArrowUpDown,
  sensor: Activity,
  binary_sensor: ToggleLeft,
};
```

## Future Enhancements

1. **Brightness Slider**: Add slider for light brightness
2. **Climate Controls**: Temperature adjustment UI
3. **Scene Management**: Create/edit/delete scenes
4. **Room Grouping**: Group by area/room
5. **AI Commands**: Natural language control

## Files to Reference

- Backend API: `apps/api/src/modules/home/CLAUDE.md`
- Shared schemas: `packages/shared/src/schemas/home-automation.ts`
- Socket hooks: `apps/web/src/services/socket/hooks.ts`
- UI components: `apps/web/src/components/ui/`
- Feature plan: `docs/epics/3-home-automation/PLAN.md`
