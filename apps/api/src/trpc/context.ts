import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { db } from '../db';

// Dev bypass for autonomous testing (Claude Code can access the API without auth)
const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === 'true';
const DEV_USER_ID = process.env.DEV_USER_ID || 'dev-test-user';

export async function createContext({
  req,
  res,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}) {
  // In dev bypass mode, skip Clerk auth and use test user ID
  if (DEV_BYPASS_AUTH) {
    return {
      req,
      res,
      db,
      auth: { userId: DEV_USER_ID },
      userId: DEV_USER_ID,
    };
  }

  const auth = getAuth(req);

  return {
    req,
    res,
    db,
    auth,
    userId: auth.userId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
