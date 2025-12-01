# Feature 3.5: Custom Scenes

> Movie mode. Bedtime. One tap.

## Overview

This feature allows users to create custom scenes - collections of device actions that execute together with one tap. "Movie mode" might dim living room lights, turn on the TV, and close the blinds.

## Acceptance Criteria

- [ ] Create scenes with multiple actions
- [ ] Name and icon for each scene
- [ ] Activate scene with one tap
- [ ] Edit existing scenes
- [ ] Delete scenes
- [ ] Scenes visible on dashboard

## Technical Details

### Database Schema

```typescript
export const haScenes = sqliteTable('ha_scenes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  icon: text('icon'),                      // Lucide icon name
  description: text('description'),
  actions: text('actions', { mode: 'json' }).$type<SceneAction[]>().notNull(),
  createdBy: text('created_by').references(() => users.id),
  isShared: integer('is_shared', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

interface SceneAction {
  entityId: string;
  domain: string;
  service: string;
  data?: Record<string, unknown>;
}
```

### tRPC Router

```typescript
// apps/api/src/modules/home/scenes.router.ts
export const scenesRouter = router({
  // Get all scenes
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.haScenes.findMany({
      where: or(
        eq(haScenes.isShared, true),
        eq(haScenes.createdBy, ctx.userId)
      ),
      orderBy: asc(haScenes.sortOrder),
    });
  }),

  // Get single scene
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.haScenes.findFirst({
        where: eq(haScenes.id, input),
      });
    }),

  // Create scene
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      icon: z.string().optional(),
      description: z.string().max(200).optional(),
      actions: z.array(z.object({
        entityId: z.string(),
        domain: z.string(),
        service: z.string(),
        data: z.record(z.unknown()).optional(),
      })).min(1),
      isShared: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [scene] = await ctx.db.insert(haScenes)
        .values({
          ...input,
          createdBy: ctx.userId,
        })
        .returning();

      return scene;
    }),

  // Update scene
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(50).optional(),
      icon: z.string().optional(),
      description: z.string().max(200).optional(),
      actions: z.array(z.object({
        entityId: z.string(),
        domain: z.string(),
        service: z.string(),
        data: z.record(z.unknown()).optional(),
      })).optional(),
      isShared: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const scene = await ctx.db.query.haScenes.findFirst({
        where: eq(haScenes.id, id),
      });

      // Only creator can edit
      if (scene?.createdBy !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.update(haScenes)
        .set({ ...updates, updatedAt: new Date().toISOString() })
        .where(eq(haScenes.id, id));

      return { success: true };
    }),

  // Delete scene
  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.query.haScenes.findFirst({
        where: eq(haScenes.id, input),
      });

      if (scene?.createdBy !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.delete(haScenes).where(eq(haScenes.id, input));

      return { success: true };
    }),

  // Activate scene
  activate: protectedProcedure
    .input(z.string()) // sceneId
    .mutation(async ({ ctx, input }) => {
      const scene = await ctx.db.query.haScenes.findFirst({
        where: eq(haScenes.id, input),
      });

      if (!scene) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const conn = getHAConnection();
      if (!conn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      }

      // Execute all actions
      const errors: string[] = [];
      for (const action of scene.actions) {
        try {
          await conn.callService(action.domain, action.service, action.data, {
            entity_id: action.entityId,
          });
        } catch (error) {
          errors.push(`${action.entityId}: ${error.message}`);
        }
      }

      // Log activation
      await ctx.db.insert(haActionLog).values({
        userId: ctx.userId,
        actionType: 'scene_activate',
        details: { sceneId: input, sceneName: scene.name },
        status: errors.length === 0 ? 'success' : 'partial',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      });

      // Broadcast
      socketEmitter.toHousehold('home:scene:activated', {
        sceneId: input,
        activatedBy: ctx.userId,
      });

      return {
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    }),
});
```

### UI Components

#### Scenes List
```tsx
// apps/web/src/modules/home/components/ScenesList.tsx
export function ScenesList() {
  const { data: scenes, isLoading } = trpc.home.scenes.getAll.useQuery();
  const [editingScene, setEditingScene] = useState<string | null>(null);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scenes</h2>
        <Button onClick={() => setEditingScene('new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Scene
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {scenes?.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            onEdit={() => setEditingScene(scene.id)}
          />
        ))}
      </div>

      <SceneEditorSheet
        sceneId={editingScene}
        open={!!editingScene}
        onClose={() => setEditingScene(null)}
      />
    </div>
  );
}
```

#### Scene Card
```tsx
// apps/web/src/modules/home/components/SceneCard.tsx
export function SceneCard({ scene, onEdit }: Props) {
  const activate = trpc.home.scenes.activate.useMutation();
  const Icon = scene.icon ? Icons[scene.icon as keyof typeof Icons] : Play;

  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={() => activate.mutate(scene.id)}
    >
      <CardContent className="flex flex-col items-center justify-center p-4 text-center">
        <div className={cn(
          'p-3 rounded-full mb-2',
          activate.isPending ? 'bg-primary/20' : 'bg-muted'
        )}>
          {activate.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Icon className="h-6 w-6" />
          )}
        </div>
        <p className="font-medium">{scene.name}</p>
        {scene.description && (
          <p className="text-xs text-muted-foreground">{scene.description}</p>
        )}
      </CardContent>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}
```

#### Scene Editor
```tsx
// apps/web/src/modules/home/components/SceneEditorSheet.tsx
export function SceneEditorSheet({ sceneId, open, onClose }: Props) {
  const isNew = sceneId === 'new';
  const { data: scene } = trpc.home.scenes.getById.useQuery(sceneId!, {
    enabled: !isNew && !!sceneId,
  });

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Play');
  const [description, setDescription] = useState('');
  const [actions, setActions] = useState<SceneAction[]>([]);

  const utils = trpc.useUtils();
  const createScene = trpc.home.scenes.create.useMutation({
    onSuccess: () => {
      utils.home.scenes.getAll.invalidate();
      onClose();
    },
  });
  const updateScene = trpc.home.scenes.update.useMutation({
    onSuccess: () => {
      utils.home.scenes.getAll.invalidate();
      onClose();
    },
  });
  const deleteScene = trpc.home.scenes.delete.useMutation({
    onSuccess: () => {
      utils.home.scenes.getAll.invalidate();
      onClose();
    },
  });

  useEffect(() => {
    if (scene) {
      setName(scene.name);
      setIcon(scene.icon ?? 'Play');
      setDescription(scene.description ?? '');
      setActions(scene.actions);
    } else if (isNew) {
      setName('');
      setIcon('Play');
      setDescription('');
      setActions([]);
    }
  }, [scene, isNew]);

  const handleSave = () => {
    const data = { name, icon, description, actions };
    if (isNew) {
      createScene.mutate(data);
    } else {
      updateScene.mutate({ id: sceneId!, ...data });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isNew ? 'New Scene' : 'Edit Scene'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>Icon</Label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Actions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActions([...actions, { entityId: '', domain: '', service: '' }])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Action
              </Button>
            </div>

            <div className="space-y-2">
              {actions.map((action, index) => (
                <ActionEditor
                  key={index}
                  action={action}
                  onChange={(updated) => {
                    const newActions = [...actions];
                    newActions[index] = updated;
                    setActions(newActions);
                  }}
                  onRemove={() => {
                    setActions(actions.filter((_, i) => i !== index));
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <SheetFooter>
          {!isNew && (
            <Button
              variant="destructive"
              onClick={() => deleteScene.mutate(sceneId!)}
            >
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={!name || actions.length === 0}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

#### Action Editor
```tsx
// apps/web/src/modules/home/components/ActionEditor.tsx
export function ActionEditor({ action, onChange, onRemove }: Props) {
  const { data: entities } = trpc.home.entities.getAll.useQuery();

  const selectedEntity = entities?.find(e => e.entityId === action.entityId);
  const availableServices = getServicesForDomain(action.domain);

  return (
    <Card className="p-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select
            value={action.entityId}
            onValueChange={(entityId) => {
              const entity = entities?.find(e => e.entityId === entityId);
              onChange({
                ...action,
                entityId,
                domain: entity?.domain ?? '',
                service: '',
              });
            }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {entities?.map((entity) => (
                <SelectItem key={entity.entityId} value={entity.entityId}>
                  {entity.friendlyName ?? entity.entityId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {action.domain && (
          <Select
            value={action.service}
            onValueChange={(service) => onChange({ ...action, service })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              {availableServices.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {action.service === 'turn_on' && action.domain === 'light' && (
          <div>
            <Label className="text-xs">Brightness</Label>
            <Slider
              value={[action.data?.brightness ?? 255]}
              min={0}
              max={255}
              onValueChange={(v) => onChange({
                ...action,
                data: { ...action.data, brightness: v[0] },
              })}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function getServicesForDomain(domain: string) {
  const services: Record<string, Array<{ id: string; name: string }>> = {
    light: [
      { id: 'turn_on', name: 'Turn On' },
      { id: 'turn_off', name: 'Turn Off' },
      { id: 'toggle', name: 'Toggle' },
    ],
    switch: [
      { id: 'turn_on', name: 'Turn On' },
      { id: 'turn_off', name: 'Turn Off' },
      { id: 'toggle', name: 'Toggle' },
    ],
    cover: [
      { id: 'open_cover', name: 'Open' },
      { id: 'close_cover', name: 'Close' },
      { id: 'stop_cover', name: 'Stop' },
    ],
    // ... etc
  };

  return services[domain] ?? [];
}
```

## Implementation Steps

1. **Create Database Schema**
   - ha_scenes table

2. **Build Scenes Router**
   - CRUD operations
   - Activate mutation

3. **Create UI Components**
   - ScenesList
   - SceneCard
   - SceneEditorSheet
   - ActionEditor

4. **Add Service Mapping**
   - Available services per domain
   - Service parameters

5. **Test Scene Execution**
   - Multiple actions
   - Error handling

## Definition of Done

- [ ] Can create scene with actions
- [ ] Scenes display on dashboard
- [ ] One-tap activation works
- [ ] All actions execute
- [ ] Can edit and delete scenes
- [ ] Errors handled gracefully

## Dependencies

- Feature 3.2 (Entities) - entity selection
- Feature 3.3 (Controls) - service calls

## Notes

- Consider scene "test" button during edit
- Actions execute in order (sequentially)
- Could add delay between actions (future)
