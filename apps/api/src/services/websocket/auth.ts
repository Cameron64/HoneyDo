import type { Socket } from 'socket.io';
import { verifyToken } from '@clerk/backend';

export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Verify Clerk session token
    const session = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    if (!session) {
      return next(new Error('Invalid token'));
    }

    // Attach user data to socket
    socket.data.userId = session.sub;
    socket.data.sessionId = session.sid;

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}
