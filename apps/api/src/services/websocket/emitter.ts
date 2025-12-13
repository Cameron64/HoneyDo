import { getIO } from './index';
import type { ServerToClientEvents } from '@honeydo/shared';

export const socketEmitter = {
  // Emit to specific user
  toUser<K extends keyof ServerToClientEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ) {
    const io = getIO();
    const room = `user:${userId}`;
    const socketsInRoom = io.sockets.adapter.rooms.get(room);
    console.log(`[socketEmitter.toUser] Emitting ${String(event)} to room ${room} (${socketsInRoom?.size ?? 0} sockets)`);
    io.to(room).emit(event, ...args);
  },

  // Emit to all household members
  toHousehold<K extends keyof ServerToClientEvents>(
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ) {
    getIO().to('household').emit(event, ...args);
  },

  // Emit to all except sender
  toOthers<K extends keyof ServerToClientEvents>(
    excludeUserId: string,
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ) {
    getIO().to('household').except(`user:${excludeUserId}`).emit(event, ...args);
  },

  // Emit to everyone
  broadcast<K extends keyof ServerToClientEvents>(
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ) {
    getIO().emit(event, ...args);
  },
};
