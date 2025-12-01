# Feature 1.6: WebSocket Infrastructure

> Real-time updates without refresh.

## Overview

This feature establishes WebSocket connectivity for real-time features. When one user adds an item to the shopping list, the other user sees it instantly. Socket.io provides reliable WebSocket connections with automatic fallbacks and reconnection.

## Acceptance Criteria

- [ ] Socket.io server integrated with Fastify
- [ ] WebSocket connections authenticated via Clerk
- [ ] React hook for socket connection
- [ ] Connection status indicator in UI
- [ ] Automatic reconnection on disconnect
- [ ] Event emitter pattern for modules to use
- [ ] Room-based messaging (per-user, per-household, broadcast)

## Technical Details

### Why Socket.io

- Automatic fallback to polling if WebSocket fails
- Built-in reconnection logic
- Room support for targeted messages
- Good TypeScript support
- Battle-tested reliability

### Installation

```bash
# Backend
pnpm add socket.io --filter @honeydo/api

# Frontend
pnpm add socket.io-client --filter @honeydo/web
```

### Directory Structure

```
apps/api/src/
├── services/
│   └── websocket/
│       ├── index.ts           # Socket.io server setup
│       ├── auth.ts            # Connection authentication
│       ├── handlers/          # Event handlers
│       │   └── index.ts
│       └── emitter.ts         # Server-side event emitter
└── ...

apps/web/src/
├── services/
│   └── socket/
│       ├── client.ts          # Socket client setup
│       └── hooks.ts           # React hooks
├── components/
│   └── common/
│       └── ConnectionStatus.tsx
└── ...
```

### Backend Setup

#### Socket.io Server
```typescript
// apps/api/src/services/websocket/index.ts
import { Server as SocketServer } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { authenticateSocket } from './auth';
import { registerHandlers } from './handlers';

let io: SocketServer;

export function initializeWebSocket(fastify: FastifyInstance) {
  io = new SocketServer(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    },
    // Enable connection state recovery
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Authentication middleware
  io.use(authenticateSocket);

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`User connected: ${userId}`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Join household room (all authenticated users)
    socket.join('household');

    // Register event handlers
    registerHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${userId} (${reason})`);
    });
  });

  return io;
}

export function getIO(): SocketServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
```

#### Authentication Middleware
```typescript
// apps/api/src/services/websocket/auth.ts
import { Socket } from 'socket.io';
import { verifyToken } from '@clerk/backend';

export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Verify Clerk session token
    const session = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!session) {
      return next(new Error('Invalid token'));
    }

    // Attach user data to socket
    socket.data.userId = session.sub;
    socket.data.sessionId = session.sid;

    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
}
```

#### Event Emitter (Server-side)
```typescript
// apps/api/src/services/websocket/emitter.ts
import { getIO } from './index';

export const socketEmitter = {
  // Emit to specific user
  toUser(userId: string, event: string, data: unknown) {
    getIO().to(`user:${userId}`).emit(event, data);
  },

  // Emit to all household members
  toHousehold(event: string, data: unknown) {
    getIO().to('household').emit(event, data);
  },

  // Emit to all except sender
  toOthers(excludeUserId: string, event: string, data: unknown) {
    getIO()
      .to('household')
      .except(`user:${excludeUserId}`)
      .emit(event, data);
  },

  // Emit to everyone
  broadcast(event: string, data: unknown) {
    getIO().emit(event, data);
  },
};
```

#### Event Handlers
```typescript
// apps/api/src/services/websocket/handlers/index.ts
import { Server, Socket } from 'socket.io';

export function registerHandlers(io: Server, socket: Socket) {
  // Ping/pong for connection testing
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Client can request their connection info
  socket.on('whoami', () => {
    socket.emit('whoami:response', {
      userId: socket.data.userId,
      rooms: Array.from(socket.rooms),
    });
  });

  // Module-specific handlers will be registered here
  // registerShoppingHandlers(io, socket);
  // registerHomeHandlers(io, socket);
}
```

#### Integrate with Fastify
```typescript
// apps/api/src/server.ts
import { initializeWebSocket } from './services/websocket';

// After server setup, before listen
const io = initializeWebSocket(server);

// Make io available to routes
server.decorate('io', io);
```

### Frontend Setup

#### Socket Client
```typescript
// apps/web/src/services/socket/client.ts
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';

let socket: Socket | null = null;

export async function connectSocket(getToken: () => Promise<string | null>) {
  if (socket?.connected) {
    return socket;
  }

  const token = await getToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return new Promise<Socket>((resolve, reject) => {
    socket!.on('connect', () => {
      console.log('Socket connected');
      resolve(socket!);
    });

    socket!.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      reject(error);
    });
  });
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

#### React Hooks
```typescript
// apps/web/src/services/socket/hooks.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from './client';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useSocket() {
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      disconnectSocket();
      setStatus('disconnected');
      setSocket(null);
      return;
    }

    setStatus('connecting');

    connectSocket(getToken)
      .then((s) => {
        setSocket(s);
        setStatus('connected');

        s.on('disconnect', () => setStatus('disconnected'));
        s.on('connect', () => setStatus('connected'));
        s.on('connect_error', () => setStatus('error'));
      })
      .catch(() => {
        setStatus('error');
      });

    return () => {
      disconnectSocket();
    };
  }, [isSignedIn, getToken]);

  return { socket, status };
}

// Hook for subscribing to events
export function useSocketEvent<T>(
  event: string,
  handler: (data: T) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const eventHandler = (data: T) => {
      handlerRef.current(data);
    };

    socket.on(event, eventHandler);

    return () => {
      socket.off(event, eventHandler);
    };
  }, [event]);
}

// Hook for emitting events
export function useSocketEmit() {
  const emit = useCallback(<T>(event: string, data?: T) => {
    const socket = getSocket();
    if (!socket) {
      console.warn('Socket not connected, cannot emit:', event);
      return;
    }
    socket.emit(event, data);
  }, []);

  return emit;
}
```

#### Connection Status Component
```typescript
// apps/web/src/components/common/ConnectionStatus.tsx
import { useSocket } from '../../services/socket/hooks';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ConnectionStatus() {
  const { status } = useSocket();

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      label: 'Connected',
    },
    connecting: {
      icon: Loader2,
      color: 'text-yellow-500',
      label: 'Connecting...',
      animate: true,
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-gray-400',
      label: 'Disconnected',
    },
    error: {
      icon: WifiOff,
      color: 'text-red-500',
      label: 'Connection error',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn('flex items-center gap-1 text-xs', config.color)}
      title={config.label}
    >
      <Icon
        className={cn('h-3 w-3', config.animate && 'animate-spin')}
      />
      <span className="sr-only">{config.label}</span>
    </div>
  );
}
```

### Event Type Definitions

```typescript
// packages/shared/src/types/socket-events.ts
export interface ServerToClientEvents {
  pong: (data: { timestamp: number }) => void;
  'whoami:response': (data: { userId: string; rooms: string[] }) => void;

  // Shopping list events
  'shopping:item:added': (data: ShoppingItemEvent) => void;
  'shopping:item:updated': (data: ShoppingItemEvent) => void;
  'shopping:item:removed': (data: { listId: string; itemId: string }) => void;

  // System events
  'system:notification': (data: NotificationEvent) => void;
  'system:settings:updated': (data: { key: string; value: unknown }) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  whoami: () => void;
}

export interface ShoppingItemEvent {
  listId: string;
  item: {
    id: string;
    name: string;
    // ... other item fields
  };
  userId: string;
}

export interface NotificationEvent {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}
```

### Usage Pattern for Modules

When a module needs real-time features:

```typescript
// In API route handler
import { socketEmitter } from '../services/websocket/emitter';

async function addShoppingItem(input, ctx) {
  // Save to database
  const item = await db.insert(shoppingItems).values(input).returning();

  // Emit to other household members
  socketEmitter.toOthers(ctx.userId, 'shopping:item:added', {
    listId: input.listId,
    item,
    userId: ctx.userId,
  });

  return item;
}
```

```tsx
// In React component
import { useSocketEvent } from '../services/socket/hooks';
import { trpc } from '../lib/trpc';

function ShoppingList() {
  const utils = trpc.useUtils();

  // Listen for real-time updates
  useSocketEvent('shopping:item:added', (data) => {
    // Invalidate query cache to refetch
    utils.shopping.items.getByList.invalidate(data.listId);

    // Or optimistically update
    utils.shopping.items.getByList.setData(data.listId, (old) =>
      old ? [...old, data.item] : [data.item]
    );
  });

  // ... rest of component
}
```

## Implementation Steps

1. **Install Dependencies**
   - socket.io (backend)
   - socket.io-client (frontend)

2. **Create Backend Socket Service**
   - Initialize Socket.io with Fastify
   - Authentication middleware
   - Event emitter helper

3. **Integrate with Fastify Server**
   - Register after server setup
   - Make io available globally

4. **Create Frontend Socket Client**
   - Connection function with auth
   - Reconnection handling
   - Error handling

5. **Create React Hooks**
   - useSocket (connection management)
   - useSocketEvent (event subscription)
   - useSocketEmit (sending events)

6. **Add Connection Status UI**
   - ConnectionStatus component
   - Add to header or footer

7. **Create Shared Types**
   - Event interfaces
   - Type-safe event names

8. **Test Connection**
   - Connect on login
   - Reconnect on token refresh
   - Disconnect on logout

9. **Test Real-time Flow**
   - Emit from server
   - Receive on client
   - Handle multiple clients

10. **Document Module Integration**
    - How modules emit events
    - How frontend subscribes

## Definition of Done

- [ ] Socket.io server runs alongside Fastify
- [ ] Connections authenticated via Clerk token
- [ ] Connection status visible in UI
- [ ] Automatic reconnection works
- [ ] Can emit events from API routes
- [ ] Frontend can subscribe to events
- [ ] Multiple clients receive broadcasts
- [ ] Clean disconnect on logout

## Dependencies

- Feature 1.1 (Project Setup) - complete
- Feature 1.2 (Authentication) - for auth tokens
- Feature 1.4 (API Foundation) - Fastify server

## Notes

- Consider tRPC subscriptions as alternative (but Socket.io is more flexible)
- WebSocket compression can reduce bandwidth
- Rate limiting may be needed for spam prevention
- Connection state recovery helps with brief disconnects
