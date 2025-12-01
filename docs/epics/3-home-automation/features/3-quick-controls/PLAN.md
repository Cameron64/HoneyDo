# Feature 3.3: Quick Controls

> Toggle lights with one tap.

## Overview

This feature provides quick control widgets for common Home Assistant devices - tap to toggle lights, adjust brightness with a slider, set thermostat temperature, and more.

## Acceptance Criteria

- [ ] Lights toggle on/off with tap
- [ ] Brightness slider for dimmable lights
- [ ] Climate temperature control
- [ ] Switch toggle
- [ ] Lock/unlock (with confirmation)
- [ ] Cover open/close/stop
- [ ] Controls respond instantly (optimistic)

## Technical Details

### Service Call Router

```typescript
// apps/api/src/modules/home/actions.router.ts
export const actionsRouter = router({
  // Generic service call
  callService: protectedProcedure
    .input(z.object({
      domain: z.string(),
      service: z.string(),
      entityId: z.string(),
      data: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = getHAConnection();
      if (!conn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      }

      // Log the action
      await ctx.db.insert(haActionLog).values({
        userId: ctx.userId,
        actionType: 'service_call',
        details: input,
        status: 'pending',
        executedAt: new Date().toISOString(),
      });

      try {
        await conn.callService(input.domain, input.service, input.data, {
          entity_id: input.entityId,
        });

        await ctx.db.update(haActionLog)
          .set({ status: 'success' })
          .where(eq(haActionLog.executedAt, /* latest */));

        return { success: true };
      } catch (error) {
        await ctx.db.update(haActionLog)
          .set({ status: 'error', errorMessage: error.message })
          .where(eq(haActionLog.executedAt, /* latest */));

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),

  // Quick toggle (light/switch/fan)
  toggle: protectedProcedure
    .input(z.string()) // entityId
    .mutation(async ({ ctx, input }) => {
      const domain = input.split('.')[0];
      return actionsRouter.callService({
        domain,
        service: 'toggle',
        entityId: input,
      });
    }),

  // Set light brightness
  setBrightness: protectedProcedure
    .input(z.object({
      entityId: z.string(),
      brightness: z.number().min(0).max(255),
    }))
    .mutation(async ({ input }) => {
      return actionsRouter.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: input.entityId,
        data: { brightness: input.brightness },
      });
    }),

  // Set climate temperature
  setTemperature: protectedProcedure
    .input(z.object({
      entityId: z.string(),
      temperature: z.number(),
    }))
    .mutation(async ({ input }) => {
      return actionsRouter.callService({
        domain: 'climate',
        service: 'set_temperature',
        entityId: input.entityId,
        data: { temperature: input.temperature },
      });
    }),

  // Lock/unlock (requires confirmation on client)
  setLock: protectedProcedure
    .input(z.object({
      entityId: z.string(),
      locked: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      return actionsRouter.callService({
        domain: 'lock',
        service: input.locked ? 'lock' : 'unlock',
        entityId: input.entityId,
      });
    }),

  // Cover control
  setCover: protectedProcedure
    .input(z.object({
      entityId: z.string(),
      action: z.enum(['open', 'close', 'stop']),
    }))
    .mutation(async ({ input }) => {
      return actionsRouter.callService({
        domain: 'cover',
        service: `${input.action}_cover`,
        entityId: input.entityId,
      });
    }),
});
```

### Control Components

#### Light Control
```tsx
// apps/web/src/modules/home/components/controls/LightControl.tsx
import { useState, useEffect } from 'react';
import { trpc } from '../../../../lib/trpc';
import { Slider } from '../../../../components/ui/slider';
import { Switch } from '../../../../components/ui/switch';
import { Lightbulb } from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface LightControlProps {
  entity: CachedEntity;
  compact?: boolean;
}

export function LightControl({ entity, compact = false }: LightControlProps) {
  const isOn = entity.state === 'on';
  const brightness = entity.attributes?.brightness as number | undefined;
  const isDimmable = brightness !== undefined;

  const [localBrightness, setLocalBrightness] = useState(brightness ?? 255);

  const toggle = trpc.home.actions.toggle.useMutation();
  const setBrightness = trpc.home.actions.setBrightness.useMutation();

  // Sync local state with server
  useEffect(() => {
    if (brightness !== undefined) {
      setLocalBrightness(brightness);
    }
  }, [brightness]);

  const handleToggle = () => {
    toggle.mutate(entity.entityId);
  };

  const handleBrightnessChange = (value: number[]) => {
    setLocalBrightness(value[0]);
  };

  const handleBrightnessCommit = (value: number[]) => {
    setBrightness.mutate({
      entityId: entity.entityId,
      brightness: value[0],
    });
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-3 rounded-lg border cursor-pointer',
          isOn ? 'bg-yellow-50 border-yellow-200' : 'bg-card'
        )}
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2">
          <Lightbulb className={cn('h-5 w-5', isOn ? 'text-yellow-500' : 'text-muted-foreground')} />
          <span className="font-medium">{entity.friendlyName}</span>
        </div>
        <Switch checked={isOn} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className={cn('h-6 w-6', isOn ? 'text-yellow-500' : 'text-muted-foreground')} />
          <div>
            <p className="font-medium">{entity.friendlyName}</p>
            <p className="text-sm text-muted-foreground">
              {isOn ? (isDimmable ? `${Math.round(localBrightness / 255 * 100)}%` : 'On') : 'Off'}
            </p>
          </div>
        </div>
        <Switch checked={isOn} onCheckedChange={handleToggle} />
      </div>

      {isDimmable && isOn && (
        <Slider
          value={[localBrightness]}
          min={0}
          max={255}
          step={1}
          onValueChange={handleBrightnessChange}
          onValueCommit={handleBrightnessCommit}
        />
      )}
    </div>
  );
}
```

#### Climate Control
```tsx
// apps/web/src/modules/home/components/controls/ClimateControl.tsx
export function ClimateControl({ entity }: Props) {
  const currentTemp = entity.attributes?.current_temperature as number;
  const targetTemp = entity.attributes?.temperature as number;
  const hvacMode = entity.state;

  const [localTarget, setLocalTarget] = useState(targetTemp);

  const setTemperature = trpc.home.actions.setTemperature.useMutation();

  const handleTempChange = (delta: number) => {
    const newTemp = localTarget + delta;
    setLocalTarget(newTemp);
    setTemperature.mutate({
      entityId: entity.entityId,
      temperature: newTemp,
    });
  };

  return (
    <div className="p-4 rounded-lg border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{entity.friendlyName}</p>
          <p className="text-sm text-muted-foreground capitalize">{hvacMode}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{currentTemp}°</p>
          <p className="text-sm text-muted-foreground">Current</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleTempChange(-1)}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="text-center">
          <p className="text-2xl font-bold">{localTarget}°</p>
          <p className="text-sm text-muted-foreground">Target</p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => handleTempChange(1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

#### Lock Control (with confirmation)
```tsx
// apps/web/src/modules/home/components/controls/LockControl.tsx
export function LockControl({ entity }: Props) {
  const isLocked = entity.state === 'locked';
  const setLock = trpc.home.actions.setLock.useMutation();

  const handleToggle = () => {
    if (isLocked) {
      // Unlock requires confirmation
      // Show confirmation dialog
    } else {
      setLock.mutate({ entityId: entity.entityId, locked: true });
    }
  };

  return (
    <AlertDialog>
      <div className="flex items-center justify-between p-4 rounded-lg border">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock className="h-5 w-5 text-green-500" />
          ) : (
            <Unlock className="h-5 w-5 text-yellow-500" />
          )}
          <div>
            <p className="font-medium">{entity.friendlyName}</p>
            <p className="text-sm text-muted-foreground">
              {isLocked ? 'Locked' : 'Unlocked'}
            </p>
          </div>
        </div>

        <AlertDialogTrigger asChild>
          <Button variant={isLocked ? 'outline' : 'default'}>
            {isLocked ? 'Unlock' : 'Lock'}
          </Button>
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isLocked ? 'Unlock' : 'Lock'} {entity.friendlyName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLocked
              ? 'This will unlock the door.'
              : 'This will lock the door.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => setLock.mutate({
              entityId: entity.entityId,
              locked: !isLocked,
            })}
          >
            {isLocked ? 'Unlock' : 'Lock'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

#### Generic Entity Control
```tsx
// apps/web/src/modules/home/components/controls/EntityControl.tsx
export function EntityControl({ entity, compact = false }: Props) {
  switch (entity.domain) {
    case 'light':
      return <LightControl entity={entity} compact={compact} />;
    case 'switch':
    case 'fan':
      return <SwitchControl entity={entity} compact={compact} />;
    case 'climate':
      return <ClimateControl entity={entity} />;
    case 'lock':
      return <LockControl entity={entity} />;
    case 'cover':
      return <CoverControl entity={entity} />;
    case 'sensor':
    case 'binary_sensor':
      return <SensorDisplay entity={entity} compact={compact} />;
    default:
      return <GenericControl entity={entity} />;
  }
}
```

### Optimistic Updates

```typescript
// apps/web/src/modules/home/hooks/useOptimisticControl.ts
export function useOptimisticToggle(entityId: string) {
  const utils = trpc.useUtils();

  const toggle = trpc.home.actions.toggle.useMutation({
    onMutate: async () => {
      // Cancel outgoing refetches
      await utils.home.entities.getById.cancel(entityId);

      // Snapshot
      const previous = utils.home.entities.getById.getData(entityId);

      // Optimistic update
      utils.home.entities.getById.setData(entityId, (old) =>
        old ? { ...old, state: old.state === 'on' ? 'off' : 'on' } : old
      );

      return { previous };
    },
    onError: (err, vars, ctx) => {
      // Rollback
      if (ctx?.previous) {
        utils.home.entities.getById.setData(entityId, ctx.previous);
      }
    },
    onSettled: () => {
      // Refetch
      utils.home.entities.getById.invalidate(entityId);
    },
  });

  return toggle;
}
```

## Implementation Steps

1. **Create Actions Router**
   - Generic service call
   - Typed actions (toggle, brightness, temp, lock, cover)
   - Action logging

2. **Build Control Components**
   - LightControl
   - SwitchControl
   - ClimateControl
   - LockControl
   - CoverControl
   - EntityControl (dispatcher)

3. **Add Optimistic Updates**
   - Toggle optimization
   - Brightness optimization

4. **Add Confirmations**
   - Lock/unlock dialog
   - Garage door dialog

5. **Test Controls**
   - All control types
   - Error handling
   - Real HA devices

## Definition of Done

- [ ] Lights toggle with tap
- [ ] Brightness slider works
- [ ] Climate temp adjustable
- [ ] Locks require confirmation
- [ ] Controls feel instant
- [ ] Actions logged

## Dependencies

- Feature 3.1 (Connection) - HA connected
- Feature 3.2 (Entities) - entity data available

## Notes

- Consider haptic feedback on mobile
- Debounce rapid slider changes
- Show loading state for slow responses
