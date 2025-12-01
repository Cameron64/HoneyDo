# Feature 3.1: Connection Setup

> Connect HoneyDo to Home Assistant.

## Overview

This feature establishes the connection between HoneyDo and a local Home Assistant instance. An admin configures the HA URL and long-lived access token, and HoneyDo maintains a persistent WebSocket connection for real-time state updates.

## Acceptance Criteria

- [ ] Admin can enter Home Assistant URL
- [ ] Admin can enter long-lived access token
- [ ] Connection test shows success/failure
- [ ] Connection status visible in UI
- [ ] Automatic reconnection on disconnect
- [ ] Secure token storage

## Technical Details

### Home Assistant WebSocket API

Home Assistant provides a WebSocket API at `ws://<host>:8123/api/websocket`.

Authentication flow:
1. Connect to WebSocket
2. Receive `auth_required` message
3. Send `auth` message with access token
4. Receive `auth_ok` or `auth_invalid`

### Database Schema

```typescript
// Single row table for HA config
export const haConfig = sqliteTable('ha_config', {
  id: integer('id').primaryKey().default(1),
  url: text('url').notNull(),                    // ws://homeassistant.local:8123/api/websocket
  accessToken: text('access_token').notNull(),   // Encrypted
  isConnected: integer('is_connected', { mode: 'boolean' }).default(false),
  lastConnectedAt: text('last_connected_at'),
  lastError: text('last_error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
```

### WebSocket Service

```typescript
// apps/api/src/services/homeassistant/connection.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';

interface HAMessage {
  id?: number;
  type: string;
  [key: string]: unknown;
}

export class HomeAssistantConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  constructor(url: string, token: string) {
    super();
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('HA WebSocket connected');
        });

        this.ws.on('message', (data) => {
          const message = JSON.parse(data.toString()) as HAMessage;
          this.handleMessage(message, resolve, reject);
        });

        this.ws.on('close', () => {
          this.emit('disconnected');
          this.handleDisconnect();
        });

        this.ws.on('error', (error) => {
          console.error('HA WebSocket error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(
    message: HAMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (reason: Error) => void
  ) {
    switch (message.type) {
      case 'auth_required':
        // Send authentication
        this.sendRaw({
          type: 'auth',
          access_token: this.token,
        });
        break;

      case 'auth_ok':
        this.reconnectAttempts = 0;
        this.emit('connected');
        connectResolve?.();
        break;

      case 'auth_invalid':
        connectReject?.(new Error('Invalid access token'));
        break;

      case 'result':
        // Handle request response
        const pending = this.pendingRequests.get(message.id!);
        if (pending) {
          this.pendingRequests.delete(message.id!);
          if (message.success) {
            pending.resolve(message.result);
          } else {
            pending.reject(new Error(message.error?.message ?? 'Unknown error'));
          }
        }
        break;

      case 'event':
        // Handle subscribed events
        this.emit('event', message.event);
        break;

      default:
        console.log('Unknown HA message type:', message.type);
    }
  }

  private handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting to HA (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      this.emit('failed', new Error('Max reconnection attempts reached'));
    }
  }

  private sendRaw(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async send(message: Omit<HAMessage, 'id'>): Promise<unknown> {
    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendRaw({ ...message, id });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async getStates(): Promise<HAEntity[]> {
    return this.send({ type: 'get_states' }) as Promise<HAEntity[]>;
  }

  async callService(domain: string, service: string, data?: object, target?: object): Promise<void> {
    await this.send({
      type: 'call_service',
      domain,
      service,
      service_data: data,
      target,
    });
  }

  async subscribeToStateChanges(callback: (event: StateChangedEvent) => void): Promise<number> {
    const result = await this.send({
      type: 'subscribe_events',
      event_type: 'state_changed',
    }) as { id: number };

    this.on('event', (event) => {
      if (event.event_type === 'state_changed') {
        callback(event.data);
      }
    });

    return result.id;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
```

### HA Service Singleton

```typescript
// apps/api/src/services/homeassistant/index.ts
import { HomeAssistantConnection } from './connection';
import { db } from '../../db';
import { haConfig, haEntities } from '../../db/schema';
import { decrypt } from '../../lib/crypto';
import { socketEmitter } from '../websocket/emitter';

let connection: HomeAssistantConnection | null = null;

export async function initializeHA(): Promise<boolean> {
  const config = await db.query.haConfig.findFirst();

  if (!config?.url || !config?.accessToken) {
    return false;
  }

  try {
    connection = new HomeAssistantConnection(
      config.url,
      decrypt(config.accessToken)
    );

    connection.on('connected', async () => {
      await db.update(haConfig)
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
      connection!.subscribeToStateChanges(handleStateChange);
    });

    connection.on('disconnected', async () => {
      await db.update(haConfig)
        .set({ isConnected: false })
        .where(eq(haConfig.id, 1));

      socketEmitter.broadcast('home:connection:status', { connected: false });
    });

    connection.on('failed', async (error) => {
      await db.update(haConfig)
        .set({
          isConnected: false,
          lastError: error.message,
        })
        .where(eq(haConfig.id, 1));
    });

    await connection.connect();
    return true;
  } catch (error) {
    await db.update(haConfig)
      .set({
        isConnected: false,
        lastError: error.message,
      })
      .where(eq(haConfig.id, 1));

    return false;
  }
}

export function getHAConnection(): HomeAssistantConnection | null {
  return connection;
}

async function cacheStates() {
  if (!connection) return;

  const states = await connection.getStates();

  for (const state of states) {
    await db.insert(haEntities)
      .values({
        entityId: state.entity_id,
        domain: state.entity_id.split('.')[0],
        friendlyName: state.attributes.friendly_name,
        state: state.state,
        attributes: state.attributes,
        lastUpdated: state.last_updated,
      })
      .onConflictDoUpdate({
        target: haEntities.entityId,
        set: {
          state: state.state,
          attributes: state.attributes,
          lastUpdated: state.last_updated,
        },
      });
  }
}

function handleStateChange(event: StateChangedEvent) {
  // Update cache
  db.update(haEntities)
    .set({
      state: event.new_state.state,
      attributes: event.new_state.attributes,
      lastUpdated: event.new_state.last_updated,
    })
    .where(eq(haEntities.entityId, event.entity_id));

  // Broadcast to clients
  socketEmitter.broadcast('home:entity:state-changed', {
    entityId: event.entity_id,
    oldState: event.old_state?.state,
    newState: event.new_state.state,
    attributes: event.new_state.attributes,
  });
}
```

### tRPC Router

```typescript
// apps/api/src/modules/home/config.router.ts
export const configRouter = router({
  // Get connection status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const config = await ctx.db.query.haConfig.findFirst();
    return {
      configured: !!config?.url,
      connected: config?.isConnected ?? false,
      lastConnectedAt: config?.lastConnectedAt,
      lastError: config?.lastError,
    };
  }),

  // Set configuration (admin only)
  configure: adminProcedure
    .input(z.object({
      url: z.string().url(),
      accessToken: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(haConfig)
        .values({
          id: 1,
          url: input.url.replace('http', 'ws') + '/api/websocket',
          accessToken: encrypt(input.accessToken),
        })
        .onConflictDoUpdate({
          target: haConfig.id,
          set: {
            url: input.url.replace('http', 'ws') + '/api/websocket',
            accessToken: encrypt(input.accessToken),
            updatedAt: new Date().toISOString(),
          },
        });

      // Try to connect
      const success = await initializeHA();

      return { success };
    }),

  // Test connection
  testConnection: adminProcedure
    .input(z.object({
      url: z.string().url(),
      accessToken: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const testConn = new HomeAssistantConnection(
        input.url.replace('http', 'ws') + '/api/websocket',
        input.accessToken
      );

      try {
        await testConn.connect();
        const states = await testConn.getStates();
        testConn.disconnect();
        return {
          success: true,
          entityCount: states.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  // Disconnect
  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    const conn = getHAConnection();
    conn?.disconnect();

    await ctx.db.update(haConfig)
      .set({ isConnected: false })
      .where(eq(haConfig.id, 1));

    return { success: true };
  }),
});
```

### Settings UI

```tsx
// apps/web/src/modules/home/components/HAConnectionSettings.tsx
export function HAConnectionSettings() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  const { data: status, isLoading } = trpc.home.config.getStatus.useQuery();
  const testConnection = trpc.home.config.testConnection.useMutation();
  const configure = trpc.home.config.configure.useMutation();
  const disconnect = trpc.home.config.disconnect.useMutation();

  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Home Assistant Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-4 w-4" />
              Connected
            </div>
            <p className="text-sm text-muted-foreground">
              Last connected: {new Date(status.lastConnectedAt!).toLocaleString()}
            </p>
            <Button
              variant="outline"
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">Home Assistant URL</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://homeassistant.local:8123"
              />
            </div>

            <div>
              <Label htmlFor="token">Long-Lived Access Token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJ..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Create at: Your Profile → Long-Lived Access Tokens
              </p>
            </div>

            {status?.lastError && (
              <p className="text-sm text-destructive">{status.lastError}</p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => testConnection.mutate({ url, accessToken: token })}
                disabled={!url || !token || testConnection.isPending}
              >
                Test Connection
              </Button>
              <Button
                onClick={() => configure.mutate({ url, accessToken: token })}
                disabled={!url || !token || configure.isPending}
              >
                Connect
              </Button>
            </div>

            {testConnection.data && (
              <p className={cn(
                'text-sm',
                testConnection.data.success ? 'text-green-600' : 'text-destructive'
              )}>
                {testConnection.data.success
                  ? `Success! Found ${testConnection.data.entityCount} entities.`
                  : testConnection.data.error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## Implementation Steps

1. **Create Database Schema**
   - haConfig table
   - haEntities table (for caching)

2. **Build WebSocket Client**
   - Connection class
   - Authentication flow
   - Message handling
   - Reconnection logic

3. **Create HA Service**
   - Singleton connection manager
   - State caching
   - Event subscription

4. **Build Config Router**
   - Status query
   - Configure mutation
   - Test connection

5. **Build Settings UI**
   - URL and token inputs
   - Test button
   - Connect/disconnect

6. **Initialize on Startup**
   - Auto-connect if configured
   - Handle startup errors

## Definition of Done

- [ ] Can enter HA URL and token
- [ ] Test connection shows entity count
- [ ] Connection persists across restarts
- [ ] Auto-reconnects on disconnect
- [ ] Connection status visible in UI
- [ ] Token stored encrypted

## Dependencies

- Epic 1 (Foundation) - complete
- Home Assistant instance accessible

## Security

- Token encrypted at rest
- Connection over local network (or Tailscale)
- Admin-only configuration

## Notes

- Long-lived access token required (not OAuth)
- WebSocket keeps connection alive
- Consider connection pooling for multiple clients
