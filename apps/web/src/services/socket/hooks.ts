import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from './client';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';
import { errorService } from '@/services/error-service';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Check if dev bypass auth is enabled
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

export function useSocket() {
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [socket, setSocket] = useState<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);

  console.log('[useSocket] DEV_BYPASS_AUTH:', DEV_BYPASS_AUTH, 'isSignedIn:', isSignedIn);

  useEffect(() => {
    // In dev bypass mode, always connect without checking isSignedIn
    // Otherwise, require Clerk authentication
    if (!DEV_BYPASS_AUTH && !isSignedIn) {
      console.log('[useSocket] Not connecting - DEV_BYPASS_AUTH:', DEV_BYPASS_AUTH, 'isSignedIn:', isSignedIn);
      disconnectSocket();
      setStatus('disconnected');
      setSocket(null);
      return;
    }

    console.log('[useSocket] Starting connection...');
    setStatus('connecting');

    connectSocket(getToken)
      .then((s) => {
        console.log('[useSocket] Connected successfully, socket id:', s.id);
        setSocket(s);
        setStatus('connected');

        s.on('disconnect', () => {
          console.log('[useSocket] Disconnected');
          setStatus('disconnected');
        });
        s.on('connect', () => {
          console.log('[useSocket] Reconnected');
          setStatus('connected');
        });
        s.on('connect_error', (err) => {
          console.log('[useSocket] Connection error:', err);
          errorService.logSocketError('connect_error', err);
          setStatus('error');
        });
      })
      .catch((err) => {
        console.error('[useSocket] Failed to connect:', err);
        errorService.logSocketError('connect', err);
        setStatus('error');
      });

    return () => {
      // Don't disconnect on cleanup in development (StrictMode causes double mount)
      // The socket will be reused by the second mount
      // In production, this cleanup runs when the component truly unmounts
      if (import.meta.env.PROD) {
        disconnectSocket();
      } else {
        console.log('[useSocket] Skipping disconnect in dev mode (StrictMode)');
      }
    };
  }, [isSignedIn, getToken]);

  return { socket, status };
}

// Hook for subscribing to events
export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let isActive = true; // Track if this effect instance is still active
    let intervalId: ReturnType<typeof setInterval> | null = null;

    console.log(`[useSocketEvent] Setting up effect for event: ${String(event)}`);

    // Create the wrapped handler for this effect instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedHandler = (...args: any[]) => {
      console.log(`[useSocketEvent] Handler called for ${String(event)}, isActive: ${isActive}`);
      if (!isActive) return; // Don't process events if effect was cleaned up
      console.log(`[useSocketEvent] Processing event: ${String(event)}`, args);
      (handlerRef.current as (...args: unknown[]) => void)(...args);
    };

    let registeredSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

    const registerHandler = () => {
      if (!isActive) {
        console.log(`[useSocketEvent] Skipping registration for ${String(event)} - effect inactive`);
        return;
      }

      const socket = getSocket();

      // Already registered with this socket
      if (registeredSocket === socket && socket) {
        return;
      }

      // Unregister from old socket if needed
      if (registeredSocket) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registeredSocket.off(event as any, wrappedHandler);
        registeredSocket = null;
      }

      if (!socket?.connected) {
        console.log(`[useSocketEvent] Socket not ready for ${String(event)}, socket: ${socket ? 'exists' : 'null'}, connected: ${socket?.connected}`);
        return; // Will retry on next interval
      }

      console.log(`[useSocketEvent] Registering handler for: ${String(event)}, socket connected: ${socket.connected}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event as any, wrappedHandler);
      registeredSocket = socket;

      // Once registered, we can stop the interval
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Initial attempt
    registerHandler();

    // If not registered yet, keep trying
    if (!registeredSocket) {
      intervalId = setInterval(registerHandler, 100);
    }

    return () => {
      isActive = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (registeredSocket) {
        console.log(`[useSocketEvent] Unregistering handler for: ${String(event)}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registeredSocket.off(event as any, wrappedHandler);
      }
    };
  }, [event]);
}

// Hook for emitting events
export function useSocketEmit() {
  const emit = useCallback(
    <K extends keyof ClientToServerEvents>(
      event: K,
      ...args: Parameters<ClientToServerEvents[K]>
    ) => {
      const socket = getSocket();
      if (!socket) {
        console.warn('Socket not connected, cannot emit:', event);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket.emit as any)(event, ...args);
    },
    []
  );

  return emit;
}
