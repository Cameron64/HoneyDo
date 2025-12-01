import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from './client';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useSocket() {
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [socket, setSocket] = useState<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);

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
export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Use type assertion to bypass socket.io's complex generic types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedHandler = (...args: any[]) => {
      (handlerRef.current as (...args: unknown[]) => void)(...args);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on(event as any, wrappedHandler);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off(event as any, wrappedHandler);
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
