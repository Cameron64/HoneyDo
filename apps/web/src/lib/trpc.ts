import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import { httpBatchLink, type TRPCLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../../api/src/trpc/router';

// Explicit type annotation to prevent TypeScript from trying to
// resolve internal API types (Fastify, better-sqlite3, etc.)
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

// Dynamically determine API URL based on current hostname
// This allows the same build to work on localhost and Tailscale
function getApiUrl(): string {
  // If explicitly set, use that (for dev server)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Otherwise, use same hostname as the page but on port 3001
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

export function createTRPCClient(
  getToken?: () => Promise<string | null>
): ReturnType<typeof trpc.createClient> {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        async headers() {
          if (getToken) {
            try {
              const token = await getToken();
              if (token) {
                return { Authorization: `Bearer ${token}` };
              }
            } catch (err) {
              console.error('[tRPC] Error getting token:', err);
            }
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
