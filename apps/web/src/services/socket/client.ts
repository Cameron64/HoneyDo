import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let connectionPromise: Promise<Socket<ServerToClientEvents, ClientToServerEvents>> | null = null;

// Check if dev bypass auth is enabled
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

// Dynamically determine API URL based on current hostname
// This allows the same build to work on localhost and Tailscale
function getApiUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Dev uses port 3002, prod uses port 3001
  const apiPort = import.meta.env.DEV ? 3002 : 3001;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${apiPort}`;
}

export async function connectSocket(getToken: () => Promise<string | null>) {
  console.log('[connectSocket] Called, current socket:', socket ? 'exists' : 'null', 'connected:', socket?.connected);

  // If already connected, return the socket
  if (socket?.connected) {
    console.log('[connectSocket] Reusing existing connected socket');
    return socket;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    console.log('[connectSocket] Connection already in progress, waiting...');
    return connectionPromise;
  }

  // If socket exists but not connected (e.g., disconnected), don't create new one yet
  // Let it try to reconnect
  if (socket && !socket.connected) {
    console.log('[connectSocket] Socket exists but not connected, waiting for reconnect...');
    connectionPromise = new Promise<Socket<ServerToClientEvents, ClientToServerEvents>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        connectionPromise = null;
        reject(new Error('Reconnection timeout'));
      }, 5000);

      socket!.once('connect', () => {
        clearTimeout(timeout);
        connectionPromise = null;
        console.log('[connectSocket] Reconnected, id:', socket!.id);
        resolve(socket!);
      });

      socket!.once('connect_error', (error) => {
        clearTimeout(timeout);
        connectionPromise = null;
        console.error('[connectSocket] Reconnection error:', error);
        reject(error);
      });
    });
    return connectionPromise;
  }

  const token = await getToken();
  console.log('[connectSocket] Got token:', token ? 'yes' : 'null/empty');

  // In dev bypass mode, allow null tokens (server will use dev-test-user)
  // Otherwise, require a valid token
  if (!token && !DEV_BYPASS_AUTH) {
    console.log('[connectSocket] No token and not in dev bypass mode');
    throw new Error('Not authenticated');
  }

  const apiUrl = getApiUrl();
  console.log('[connectSocket] Creating socket to:', apiUrl);

  socket = io(apiUrl, {
    auth: { token: token || 'dev-bypass-token' },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  console.log('[connectSocket] Socket created, waiting for connect event...');

  // Debug: log all incoming events (register immediately, not in promise)
  socket.onAny((eventName, ...args) => {
    console.log(`[Socket] Received event: ${eventName}`, args);
  });

  connectionPromise = new Promise<Socket<ServerToClientEvents, ClientToServerEvents>>((resolve, reject) => {
    socket!.on('connect', () => {
      connectionPromise = null;
      console.log('Socket connected, id:', socket!.id);
      resolve(socket!);
    });

    socket!.on('connect_error', (error) => {
      connectionPromise = null;
      console.error('Socket connection error:', error);
      reject(error);
    });
  });

  return connectionPromise;
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

export function disconnectSocket() {
  console.log('[disconnectSocket] Called, socket:', socket ? 'exists' : 'null');
  if (socket) {
    socket.disconnect();
    socket = null;
    connectionPromise = null;
    console.log('[disconnectSocket] Socket disconnected and set to null');
  }
}
