# HoneyDo Web Services - Claude Code Instructions

> Frontend service layer for API communication and real-time updates

## Overview

This directory contains frontend services that handle communication with the backend, including WebSocket connections and API clients.

## Directory Structure

```
apps/web/src/services/
├── CLAUDE.md              # This file
└── socket/                # WebSocket client
    ├── client.ts          # Socket.io client setup
    └── hooks.ts           # Socket event hooks
```

## Socket Service

The socket service manages real-time WebSocket communication with the API server.

### Client Setup

`socket/client.ts` - Socket.io client initialization and management.

```typescript
import { connectSocket, getSocket, disconnectSocket } from '@/services/socket/client';

// Connect with Clerk token
await connectSocket(async () => {
  const token = await clerk.session?.getToken();
  return token;
});

// Get socket instance
const socket = getSocket();

// Disconnect on logout
disconnectSocket();
```

### Features

- **Auto-reconnection**: Automatically reconnects on disconnect
- **Connection recovery**: Recovers state after brief disconnections
- **Auth integration**: Uses Clerk JWT for authentication
- **Dynamic URL**: Adapts to localhost or Tailscale automatically

### Socket Hooks

`socket/hooks.ts` - React hooks for socket events.

```typescript
import { useSocketEvent, useSocketStatus } from '@/services/socket/hooks';

function MyComponent() {
  // Listen for events
  useSocketEvent('shopping:item:added', (item) => {
    console.log('New item:', item);
  });

  // Check connection status
  const isConnected = useSocketStatus();

  return isConnected ? <div>Connected</div> : <div>Disconnected</div>;
}
```

### useSocketEvent Hook

Subscribes to a socket event and automatically cleans up on unmount.

```typescript
// Basic usage
useSocketEvent('event:name', (data) => {
  // Handle event
});

// With dependencies (for callbacks that use external values)
useSocketEvent(
  'shopping:item:checked',
  useCallback(
    (data) => {
      if (data.listId === listId) {
        // Update local state
      }
    },
    [listId]
  )
);
```

### Event Types

Events are typed via `@honeydo/shared`:

```typescript
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

// Server → Client events (we receive)
'shopping:item:added'        // ShoppingItem
'shopping:item:checked'      // { itemId, checked, checkedBy }
'shopping:item:deleted'      // { id }
'home:entity:state-changed'  // { entityId, newState, attributes }
'recipes:activity'           // { message, progress? }
'recipes:wizard:step-complete' // { step, sessionId }

// Client → Server events (we send)
'ping'                       // () => void
'whoami'                     // () => void
```

## Integration with Modules

Each module has a sync hook that uses the socket service:

### Shopping Sync

```typescript
// modules/shopping/hooks/use-shopping-sync.ts
import { useSocketEvent } from '@/services/socket/hooks';
import { trpc } from '@/lib/trpc';

export function useShoppingSync({ listId }: { listId?: string }) {
  const utils = trpc.useUtils();

  // Handle item additions from other clients
  useSocketEvent(
    'shopping:item:added',
    useCallback(
      (item) => {
        if (item.listId === listId) {
          utils.shopping.items.invalidate();
        }
      },
      [listId, utils]
    )
  );

  // Handle item checks
  useSocketEvent(
    'shopping:item:checked',
    useCallback(
      (data) => {
        utils.shopping.items.setData({ listId }, (old) =>
          old?.map((item) =>
            item.id === data.itemId ? { ...item, checked: data.checked } : item
          )
        );
      },
      [listId, utils]
    )
  );
}
```

### Recipes Sync

```typescript
// modules/recipes/hooks/use-recipes-sync.ts
export function useRecipesSync() {
  const utils = trpc.useUtils();
  const [activityMessage, setActivityMessage] = useState('');

  // Activity streaming during AI generation
  useSocketEvent('recipes:activity', (data) => {
    setActivityMessage(data.message);
  });

  // Wizard step completion
  useSocketEvent('recipes:wizard:step-complete', (data) => {
    utils.recipes.wizard.getSession.invalidate();
  });

  return { activityMessage };
}
```

## Connection Management

### In App.tsx

```typescript
// src/App.tsx
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { connectSocket, disconnectSocket } from '@/services/socket/client';

function App() {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      connectSocket(getToken).catch(console.error);
    } else {
      disconnectSocket();
    }

    return () => disconnectSocket();
  }, [isSignedIn, getToken]);

  return <Routes />;
}
```

### Dev Bypass Auth

For development without Clerk:

```env
# apps/web/.env
VITE_DEV_BYPASS_AUTH=true
```

This allows connecting without a valid token (server uses `dev-test-user`).

## Debugging

### Enable Socket Logging

The client logs all events in development:

```typescript
socket.onAny((eventName, ...args) => {
  console.log(`[Socket] Received event: ${eventName}`, args);
});
```

### Check Connection State

```typescript
const socket = getSocket();
console.log('Connected:', socket?.connected);
console.log('Socket ID:', socket?.id);
```

### Manual Event Testing

```typescript
// In browser console
import { getSocket } from './services/socket/client';
const socket = getSocket();
socket.emit('ping');
```

## Best Practices

### 1. Use Typed Events

Always import event types from `@honeydo/shared`:

```typescript
import type { ServerToClientEvents } from '@honeydo/shared';

// TypeScript knows the data shape
useSocketEvent<ServerToClientEvents['shopping:item:added']>(
  'shopping:item:added',
  (item) => {
    // item is typed as ShoppingItem
  }
);
```

### 2. Memoize Callbacks

Prevent re-subscribing on every render:

```typescript
const handleEvent = useCallback(
  (data) => {
    // Handler logic
  },
  [dependencies]
);

useSocketEvent('event:name', handleEvent);
```

### 3. Cleanup on Unmount

The `useSocketEvent` hook handles cleanup automatically. For manual subscriptions:

```typescript
useEffect(() => {
  const socket = getSocket();
  const handler = (data) => { /* ... */ };

  socket?.on('event:name', handler);
  return () => {
    socket?.off('event:name', handler);
  };
}, []);
```

### 4. Handle Disconnections

Show connection status to users:

```typescript
function ConnectionIndicator() {
  const isConnected = useSocketStatus();

  return (
    <div className={isConnected ? 'bg-green-500' : 'bg-red-500'}>
      {isConnected ? 'Connected' : 'Reconnecting...'}
    </div>
  );
}
```

## Files to Reference

- Socket server: `apps/api/src/services/websocket/`
- Shared event types: `packages/shared/src/types/index.ts`
- Module sync hooks: `src/modules/*/hooks/use-*-sync.ts`
- tRPC client: `src/lib/trpc.ts`
