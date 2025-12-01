# Feature 3.2: Entity Management

> See all your devices. Know their states.

## Overview

This feature fetches and caches all Home Assistant entities, providing a browsable list of devices with their current states. Users can view entities by domain (lights, switches, sensors) and see real-time state updates.

## Acceptance Criteria

- [ ] All HA entities fetched and cached
- [ ] Entities browsable by domain
- [ ] Entity states update in real-time
- [ ] Search/filter entities
- [ ] Entity details viewable
- [ ] Refresh entities on demand

## Technical Details

### Entity Types

```typescript
// packages/shared/src/types/home-assistant.ts
export interface HAEntity {
  entity_id: string;           // light.living_room
  state: string;               // on, off, 72, etc.
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface CachedEntity {
  entityId: string;
  domain: string;              // light, switch, sensor, etc.
  friendlyName: string | null;
  state: string;
  attributes: Record<string, unknown>;
  lastUpdated: string;
}

export const HA_DOMAINS = {
  light: { name: 'Lights', icon: 'Lightbulb' },
  switch: { name: 'Switches', icon: 'ToggleLeft' },
  fan: { name: 'Fans', icon: 'Fan' },
  climate: { name: 'Climate', icon: 'Thermometer' },
  lock: { name: 'Locks', icon: 'Lock' },
  cover: { name: 'Covers', icon: 'ArrowUpDown' },
  sensor: { name: 'Sensors', icon: 'Gauge' },
  binary_sensor: { name: 'Binary Sensors', icon: 'Circle' },
  camera: { name: 'Cameras', icon: 'Camera' },
  media_player: { name: 'Media Players', icon: 'Play' },
  automation: { name: 'Automations', icon: 'Workflow' },
  scene: { name: 'Scenes', icon: 'Palette' },
} as const;
```

### Database Schema

```typescript
export const haEntities = sqliteTable('ha_entities', {
  entityId: text('entity_id').primaryKey(),
  domain: text('domain').notNull(),
  friendlyName: text('friendly_name'),
  state: text('state').notNull(),
  attributes: text('attributes', { mode: 'json' }).$type<Record<string, unknown>>(),
  lastChanged: text('last_changed'),
  lastUpdated: text('last_updated'),
});
```

### tRPC Router

```typescript
// apps/api/src/modules/home/entities.router.ts
export const entitiesRouter = router({
  // Get all entities (from cache)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.haEntities.findMany({
      orderBy: [asc(haEntities.domain), asc(haEntities.friendlyName)],
    });
  }),

  // Get entities by domain
  getByDomain: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.haEntities.findMany({
        where: eq(haEntities.domain, input),
        orderBy: asc(haEntities.friendlyName),
      });
    }),

  // Get single entity
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const entity = await ctx.db.query.haEntities.findFirst({
        where: eq(haEntities.entityId, input),
      });

      if (!entity) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return entity;
    }),

  // Search entities
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      domain: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        or(
          like(haEntities.entityId, `%${input.query}%`),
          like(haEntities.friendlyName, `%${input.query}%`)
        ),
      ];

      if (input.domain) {
        conditions.push(eq(haEntities.domain, input.domain));
      }

      return ctx.db.query.haEntities.findMany({
        where: and(...conditions),
        orderBy: asc(haEntities.friendlyName),
        limit: 50,
      });
    }),

  // Force refresh from HA
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const conn = getHAConnection();
    if (!conn) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Not connected' });
    }

    const states = await conn.getStates();

    // Clear and repopulate cache
    await ctx.db.delete(haEntities);

    for (const state of states) {
      await ctx.db.insert(haEntities).values({
        entityId: state.entity_id,
        domain: state.entity_id.split('.')[0],
        friendlyName: state.attributes.friendly_name as string,
        state: state.state,
        attributes: state.attributes,
        lastChanged: state.last_changed,
        lastUpdated: state.last_updated,
      });
    }

    socketEmitter.broadcast('home:entities:refreshed', {
      count: states.length,
    });

    return { count: states.length };
  }),

  // Get domain summary (counts)
  getDomainSummary: protectedProcedure.query(async ({ ctx }) => {
    const entities = await ctx.db.query.haEntities.findMany();

    const summary = entities.reduce((acc, entity) => {
      acc[entity.domain] = (acc[entity.domain] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return summary;
  }),
});
```

### Real-time State Updates

```typescript
// apps/web/src/modules/home/hooks/useEntitySync.ts
import { useSocketEvent } from '../../../services/socket/hooks';
import { trpc } from '../../../lib/trpc';

export function useEntitySync() {
  const utils = trpc.useUtils();

  useSocketEvent('home:entity:state-changed', (data) => {
    // Update single entity in cache
    utils.home.entities.getAll.setData(undefined, (old) =>
      old?.map(entity =>
        entity.entityId === data.entityId
          ? { ...entity, state: data.newState, attributes: data.attributes }
          : entity
      )
    );

    // Also update getById if that entity is being viewed
    utils.home.entities.getById.setData(data.entityId, (old) =>
      old ? { ...old, state: data.newState, attributes: data.attributes } : old
    );
  });

  useSocketEvent('home:entities:refreshed', () => {
    utils.home.entities.getAll.invalidate();
  });
}
```

### UI Components

#### Entity List Page
```tsx
// apps/web/src/modules/home/pages/EntitiesPage.tsx
export function EntitiesPage() {
  const { data: summary } = trpc.home.entities.getDomainSummary.useQuery();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEntitySync();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <RefreshButton />
      </div>

      {search ? (
        <EntitySearchResults query={search} />
      ) : selectedDomain ? (
        <DomainEntityList
          domain={selectedDomain}
          onBack={() => setSelectedDomain(null)}
        />
      ) : (
        <DomainGrid summary={summary} onSelect={setSelectedDomain} />
      )}
    </div>
  );
}
```

#### Domain Grid
```tsx
// apps/web/src/modules/home/components/DomainGrid.tsx
export function DomainGrid({ summary, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Object.entries(HA_DOMAINS).map(([domain, config]) => {
        const count = summary?.[domain] ?? 0;
        if (count === 0) return null;

        const Icon = Icons[config.icon as keyof typeof Icons];

        return (
          <Card
            key={domain}
            className="cursor-pointer hover:bg-accent"
            onClick={() => onSelect(domain)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{config.name}</p>
                <p className="text-sm text-muted-foreground">{count} entities</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

#### Entity Row
```tsx
// apps/web/src/modules/home/components/EntityRow.tsx
export function EntityRow({ entity, onClick }: Props) {
  const Icon = getEntityIcon(entity.domain);
  const stateColor = getStateColor(entity.domain, entity.state);

  return (
    <div
      className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent"
      onClick={onClick}
    >
      <div className={cn('p-2 rounded-full', stateColor.bg)}>
        <Icon className={cn('h-5 w-5', stateColor.text)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {entity.friendlyName ?? entity.entityId}
        </p>
        <p className="text-sm text-muted-foreground">
          {entity.entityId}
        </p>
      </div>

      <div className="text-right">
        <p className={cn('font-medium', stateColor.text)}>
          {formatState(entity.domain, entity.state, entity.attributes)}
        </p>
      </div>
    </div>
  );
}

function formatState(domain: string, state: string, attributes: Record<string, unknown>): string {
  switch (domain) {
    case 'light':
      if (state === 'on' && attributes.brightness) {
        return `On (${Math.round((attributes.brightness as number) / 255 * 100)}%)`;
      }
      return state === 'on' ? 'On' : 'Off';

    case 'climate':
      return `${state} • ${attributes.current_temperature}°`;

    case 'sensor':
      return `${state}${attributes.unit_of_measurement ?? ''}`;

    default:
      return state;
  }
}
```

#### Entity Detail Sheet
```tsx
// apps/web/src/modules/home/components/EntityDetailSheet.tsx
export function EntityDetailSheet({ entityId, open, onClose }: Props) {
  const { data: entity } = trpc.home.entities.getById.useQuery(entityId, {
    enabled: open && !!entityId,
  });

  if (!entity) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{entity.friendlyName ?? entity.entityId}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-muted-foreground">Entity ID</Label>
            <p className="font-mono text-sm">{entity.entityId}</p>
          </div>

          <div>
            <Label className="text-muted-foreground">State</Label>
            <p className="text-2xl font-bold">
              {formatState(entity.domain, entity.state, entity.attributes)}
            </p>
          </div>

          <div>
            <Label className="text-muted-foreground">Last Updated</Label>
            <p>{new Date(entity.lastUpdated).toLocaleString()}</p>
          </div>

          <Separator />

          <div>
            <Label className="text-muted-foreground">Attributes</Label>
            <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-auto">
              {JSON.stringify(entity.attributes, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## Implementation Steps

1. **Create Entity Cache**
   - Database table
   - Initial population on connect
   - Update on state changes

2. **Build Entity Router**
   - CRUD queries
   - Search
   - Domain summary
   - Refresh

3. **Set Up Real-time Sync**
   - Listen to HA state_changed events
   - Update cache
   - Broadcast to clients

4. **Build UI Components**
   - DomainGrid
   - EntityRow
   - EntityDetailSheet
   - Search component

5. **Add Refresh Functionality**
   - Manual refresh button
   - Auto-refresh option

## Definition of Done

- [ ] All entities fetched on connect
- [ ] Entities browsable by domain
- [ ] Search works across all entities
- [ ] States update in real-time
- [ ] Entity details viewable
- [ ] Manual refresh works

## Dependencies

- Feature 3.1 (Connection Setup) - HA connected

## Notes

- Cache reduces HA load
- Consider filtering out internal/system entities
- Entity detail could link to HA UI
