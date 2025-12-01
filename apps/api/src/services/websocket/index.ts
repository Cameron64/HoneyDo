import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { authenticateSocket } from './auth';
import { registerHandlers } from './handlers';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

let io: SocketServer<ClientToServerEvents, ServerToClientEvents>;

export function initializeWebSocket(httpServer: HttpServer) {
  io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    },
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

export function getIO(): SocketServer<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

export { socketEmitter } from './emitter';
