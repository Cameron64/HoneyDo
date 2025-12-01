import type { Server, Socket } from 'socket.io';

export function registerHandlers(_io: Server, socket: Socket) {
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

  // Module-specific handlers will be registered here as modules are implemented
  // registerShoppingHandlers(io, socket);
  // registerHomeHandlers(io, socket);
}
