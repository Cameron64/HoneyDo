import type { Socket } from 'socket.io';
import { verifyToken } from '@clerk/backend';

// Dev bypass for autonomous testing (match tRPC context behavior)
const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === 'true';
const DEV_USER_ID = process.env.DEV_USER_ID || 'dev-test-user';

export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    // In dev bypass mode, use test user ID (must match tRPC context)
    if (DEV_BYPASS_AUTH) {
      socket.data.userId = DEV_USER_ID;
      socket.data.sessionId = 'dev-session';
      return next();
    }

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
