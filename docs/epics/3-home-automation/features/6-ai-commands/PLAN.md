# Feature 3.6: AI Commands

> "Turn off all the lights downstairs."

## Overview

This feature enables natural language control of Home Assistant devices through Claude. Users can type or speak commands like "turn off all the lights" or ask questions like "is the front door locked?" and have the AI interpret and execute the appropriate actions.

## Acceptance Criteria

- [ ] Natural language commands work
- [ ] AI interprets ambiguous commands
- [ ] Confirmation for sensitive actions
- [ ] Status queries answered
- [ ] Command history viewable
- [ ] Graceful handling of unrecognized commands

## Technical Details

### AI Router

```typescript
// apps/api/src/modules/home/ai.router.ts
export const homeAIRouter = router({
  // Execute natural language command
  command: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(500),
      requireConfirmation: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get all entities for context
      const entities = await ctx.db.query.haEntities.findMany();

      const entityList = entities.map(e => ({
        entity_id: e.entityId,
        friendly_name: e.friendlyName,
        domain: e.domain,
        state: e.state,
        area: e.attributes?.area_id,
      }));

      const systemPrompt = `You are a smart home assistant controlling Home Assistant devices.
You can control devices by calling services. Always be helpful and precise.

For safety:
- Lock/unlock commands should require confirmation
- Garage doors should require confirmation
- Alarm systems are not controllable

Available domains and services:
- light: turn_on, turn_off, toggle (data: brightness 0-255)
- switch: turn_on, turn_off, toggle
- fan: turn_on, turn_off, set_speed
- climate: set_temperature (data: temperature)
- cover: open_cover, close_cover, stop_cover
- lock: lock, unlock (REQUIRES CONFIRMATION)`;

      const prompt = `Available entities:
${JSON.stringify(entityList, null, 2)}

User command: "${input.text}"

Analyze the command and respond with JSON:
{
  "understood": boolean,
  "type": "action" | "query" | "unclear",
  "actions": [
    {
      "entity_id": string,
      "domain": string,
      "service": string,
      "data"?: object
    }
  ],
  "confirmation_required": boolean,
  "message": string,  // What to tell the user
  "query_answer"?: string  // If type is "query"
}

Be intelligent about interpreting commands:
- "all the lights" = all light.* entities
- "downstairs" = entities with downstairs/first floor in name or area
- "living room lights" = lights with living room in name`;

      const response = await aiService.json<CommandResponse>(prompt, systemPrompt);

      // If confirmation required and not overridden, return without executing
      if (response.confirmation_required && input.requireConfirmation) {
        return {
          ...response,
          executed: false,
          pending_confirmation: true,
        };
      }

      // Execute actions
      if (response.type === 'action' && response.actions?.length) {
        const conn = getHAConnection();
        if (!conn) {
          return {
            ...response,
            executed: false,
            error: 'Not connected to Home Assistant',
          };
        }

        const results: Array<{ entityId: string; success: boolean; error?: string }> = [];

        for (const action of response.actions) {
          try {
            await conn.callService(action.domain, action.service, action.data, {
              entity_id: action.entity_id,
            });
            results.push({ entityId: action.entity_id, success: true });
          } catch (error) {
            results.push({
              entityId: action.entity_id,
              success: false,
              error: error.message,
            });
          }
        }

        // Log command
        await ctx.db.insert(haActionLog).values({
          userId: ctx.userId,
          actionType: 'ai_command',
          details: {
            command: input.text,
            interpreted: response,
            results,
          },
          status: results.every(r => r.success) ? 'success' : 'partial',
        });

        return {
          ...response,
          executed: true,
          results,
        };
      }

      return {
        ...response,
        executed: false,
      };
    }),

  // Confirm and execute pending command
  confirmCommand: protectedProcedure
    .input(z.object({
      actions: z.array(z.object({
        entity_id: z.string(),
        domain: z.string(),
        service: z.string(),
        data: z.record(z.unknown()).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = getHAConnection();
      if (!conn) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      }

      const results = [];
      for (const action of input.actions) {
        try {
          await conn.callService(action.domain, action.service, action.data, {
            entity_id: action.entity_id,
          });
          results.push({ entityId: action.entity_id, success: true });
        } catch (error) {
          results.push({ entityId: action.entity_id, success: false, error: error.message });
        }
      }

      return { results };
    }),

  // Get command history
  getHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.haActionLog.findMany({
        where: and(
          eq(haActionLog.userId, ctx.userId),
          eq(haActionLog.actionType, 'ai_command')
        ),
        orderBy: desc(haActionLog.executedAt),
        limit: input.limit,
      });
    }),
});

interface CommandResponse {
  understood: boolean;
  type: 'action' | 'query' | 'unclear';
  actions?: Array<{
    entity_id: string;
    domain: string;
    service: string;
    data?: Record<string, unknown>;
  }>;
  confirmation_required: boolean;
  message: string;
  query_answer?: string;
}
```

### UI Components

#### AI Command Bar
```tsx
// apps/web/src/modules/home/components/AICommandBar.tsx
export function AICommandBar() {
  const [input, setInput] = useState('');
  const [pendingActions, setPendingActions] = useState<CommandResponse | null>(null);

  const sendCommand = trpc.home.ai.command.useMutation();
  const confirmCommand = trpc.home.ai.confirmCommand.useMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    sendCommand.mutate(
      { text: input },
      {
        onSuccess: (result) => {
          if (result.pending_confirmation) {
            setPendingActions(result);
          } else {
            setInput('');
          }
        },
      }
    );
  };

  const handleConfirm = () => {
    if (pendingActions?.actions) {
      confirmCommand.mutate(
        { actions: pendingActions.actions },
        {
          onSuccess: () => {
            setPendingActions(null);
            setInput('');
          },
        }
      );
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try: 'turn off all the lights'"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={!input.trim() || sendCommand.isPending}>
          {sendCommand.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      {/* Response display */}
      {sendCommand.data && !pendingActions && (
        <Card className="p-3">
          <p className="text-sm">{sendCommand.data.message}</p>
          {sendCommand.data.query_answer && (
            <p className="mt-2 font-medium">{sendCommand.data.query_answer}</p>
          )}
          {sendCommand.data.executed && (
            <p className="text-xs text-muted-foreground mt-1">
              {sendCommand.data.results?.filter(r => r.success).length} actions executed
            </p>
          )}
        </Card>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={!!pendingActions} onOpenChange={() => setPendingActions(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingActions?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <p className="text-sm font-medium mb-2">This will:</p>
            <ul className="text-sm space-y-1">
              {pendingActions?.actions?.map((action, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-primary" />
                  {action.service.replace('_', ' ')} {action.entity_id}
                </li>
              ))}
            </ul>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

#### Command History
```tsx
// apps/web/src/modules/home/components/CommandHistory.tsx
export function CommandHistory() {
  const { data: history } = trpc.home.ai.getHistory.useQuery({ limit: 20 });

  if (!history?.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Recent Commands</h3>
      <div className="space-y-1">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 text-sm p-2 rounded hover:bg-muted"
          >
            <span className={cn(
              'h-2 w-2 rounded-full',
              item.status === 'success' ? 'bg-green-500' : 'bg-yellow-500'
            )} />
            <span className="flex-1 truncate">
              {(item.details as any).command}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(item.executedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Example Commands

| Command | Interpretation |
|---------|----------------|
| "Turn off all the lights" | light.turn_off for all light.* entities |
| "Dim the living room to 50%" | light.turn_on with brightness: 127 for living room lights |
| "Is the front door locked?" | Query - check lock.front_door state |
| "Set the thermostat to 72" | climate.set_temperature with temperature: 72 |
| "Turn on movie mode" | Could suggest creating a scene |
| "What's the temperature?" | Query - report climate sensor values |

### Safety Rules

- Lock commands → always require confirmation
- Garage doors (cover.garage*) → always require confirmation
- Alarm systems → not controllable
- Unknown commands → ask for clarification

## Implementation Steps

1. **Create AI Router**
   - command mutation
   - confirmCommand mutation
   - getHistory query

2. **Build Entity Context**
   - Format entities for AI
   - Include areas/rooms

3. **Create UI Components**
   - AICommandBar
   - Confirmation dialog
   - CommandHistory

4. **Test Various Commands**
   - Simple toggle
   - Multiple devices
   - Queries
   - Confirmation flow

5. **Add Error Handling**
   - Unrecognized commands
   - Partial failures

## Definition of Done

- [ ] "Turn off all lights" works
- [ ] "Is the door locked?" returns status
- [ ] Lock commands require confirmation
- [ ] Command history visible
- [ ] Errors handled gracefully
- [ ] Response messages are helpful

## Dependencies

- Feature 3.2 (Entities) - entity context
- Feature 3.3 (Controls) - service calls
- AI Service configured

## Notes

- Consider voice input (future)
- Could learn user preferences over time
- Rate limit AI calls
