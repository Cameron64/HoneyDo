import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { authenticateSocket } from './auth';
import { registerHandlers } from './handlers';
import type { ServerToClientEvents, ClientToServerEvents } from '@honeydo/shared';

let io: SocketServer<ClientToServerEvents, ServerToClientEvents>;

export function initializeWebSocket(httpServer: HttpServer) {
  // Parse CORS origins from env, or use defaults including Tailscale pattern
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') ?? [
    'http://localhost:5173',
    'http://localhost:8080',
  ];

  io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow no origin (same-origin requests)
        if (!origin) {
          callback(null, true);
          return;
        }
        // Allow explicit origins from env
        if (corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // Allow any Tailscale origin (.ts.net)
        if (origin.includes('.ts.net')) {
          callback(null, true);
          return;
        }
        // Reject others in production, allow in dev
        if (process.env.NODE_ENV === 'production') {
          callback(new Error('CORS not allowed'), false);
        } else {
          callback(null, true);
        }
      },
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
