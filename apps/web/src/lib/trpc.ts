import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import { httpBatchLink, type TRPCLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../../api/src/trpc/router';

// Explicit type annotation to prevent TypeScript from trying to
// resolve internal API types (Fastify, better-sqlite3, etc.)
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

export function createTRPCClient(
  getToken?: () => Promise<string | null>
): ReturnType<typeof trpc.createClient> {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${import.meta.env.VITE_API_URL}/trpc`,
        transformer: superjson,
        async headers() {
          if (getToken) {
            try {
              const token = await getToken();
              console.log('[tRPC] Token obtained:', token ? `${token.substring(0, 20)}...` : 'null');
              if (token) {
                return { Authorization: `Bearer ${token}` };
              }
            } catch (err) {
              console.error('[tRPC] Error getting token:', err);
            }
          } else {
            console.log('[tRPC] No getToken function provided');
          }
          return {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }) as TRPCLink<AppRouter>,
    ],
  });
}
