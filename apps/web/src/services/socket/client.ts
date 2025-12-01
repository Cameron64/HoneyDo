import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

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

  return new Promise<Socket<ServerToClientEvents, ClientToServerEvents>>((resolve, reject) => {
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

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
