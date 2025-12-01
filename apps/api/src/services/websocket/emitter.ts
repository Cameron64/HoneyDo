import { getIO } from './index';
import type { ServerToClientEvents } from '@honeydo/shared';

export const socketEmitter = {
  // Emit to specific user
  toUser<K extends keyof ServerToClientEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ) {
    getIO().to(`user:${userId}`).emit(event, ...args);
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
