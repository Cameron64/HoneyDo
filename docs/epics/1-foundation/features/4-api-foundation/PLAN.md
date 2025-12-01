# Feature 1.4: API Foundation

> Fastify + tRPC. Type-safe from database to UI.

## Overview

This feature establishes the API server with Fastify and tRPC. tRPC provides end-to-end type safety - define a procedure once, and both backend and frontend know the exact types. No more API documentation that drifts from reality.

## Acceptance Criteria

- [ ] Fastify server running with proper configuration
- [ ] tRPC router set up with typed context
- [ ] Health check endpoint works
- [ ] Auth context available in procedures
- [ ] Database context available in procedures
- [ ] Error handling standardized
- [ ] CORS configured for local development
- [ ] Module router registration pattern established
- [ ] Frontend can call tRPC procedures with full type inference

## Technical Details

### Why Fastify + tRPC

**Fastify**:
- Fastest Node.js framework
- Built-in TypeScript support
- Plugin architecture
- Schema validation
- Good logging

**tRPC**:
- End-to-end type safety
- No code generation
- Great DX with autocompletion
- Works with React Query
- WebSocket support (for subscriptions)

### Installation

```bash
# Backend
pnpm add @trpc/server zod --filter @honeydo/api

# Frontend
pnpm add @trpc/client @trpc/react-query @tanstack/react-query --filter @honeydo/web
```

### Directory Structure

```
apps/api/src/
├── server.ts                 # Entry point
├── trpc/
│   ├── index.ts             # tRPC initialization
│   ├── context.ts           # Request context
│   ├── router.ts            # Root router
│   └── procedures.ts        # Base procedures
├── routes/
│   ├── health.ts            # Health check (non-tRPC)
│   └── webhooks/            # Webhook handlers
├── modules/
│   ├── index.ts             # Module registration
│   └── [module-name]/
│       └── router.ts        # Module-specific tRPC router
├── services/
│   └── ...
├── middleware/
│   └── ...
└── db/
    └── ...
```

### tRPC Setup

#### Initialization
```typescript
// apps/api/src/trpc/index.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import superjson from 'superjson';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

#### Context
```typescript
// apps/api/src/trpc/context.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { db } from '../db';

export async function createContext({
  req,
  res,
}: {
  req: FastifyRequest;
  res: FastifyReply;
}) {
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
```

#### Procedures
```typescript
// apps/api/src/trpc/procedures.ts
import { TRPCError } from '@trpc/server';
import { middleware, publicProcedure } from './index';

// Middleware to check authentication
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId, // Now guaranteed to be string
    },
  });
});

// Middleware to check admin role
const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
  });

  if (user?.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next({ ctx });
});

// Procedure types
export const protectedProcedure = publicProcedure.use(isAuthenticated);
export const adminProcedure = publicProcedure.use(isAuthenticated).use(isAdmin);
```

#### Root Router
```typescript
// apps/api/src/trpc/router.ts
import { router } from './index';
import { userRouter } from '../modules/user/router';
import { settingsRouter } from '../modules/settings/router';
// Import module routers as they're created

export const appRouter = router({
  user: userRouter,
  settings: settingsRouter,
  // Modules will be added here
});

export type AppRouter = typeof appRouter;
```

### Example Module Router

```typescript
// apps/api/src/modules/user/router.ts
import { z } from 'zod';
import { router } from '../../trpc';
import { publicProcedure, protectedProcedure } from '../../trpc/procedures';

export const userRouter = router({
  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    return user;
  }),

  // Update profile
  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(users.id, ctx.userId));
      return { success: true };
    }),
});
```

### Fastify Server Setup

```typescript
// apps/api/src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { clerkPlugin } from '@clerk/fastify';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
      target: 'pino-pretty',
    },
  },
});

async function start() {
  // Register plugins
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  await server.register(clerkPlugin);

  // Health check (non-tRPC)
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // tRPC
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ error, path }) {
        console.error(`Error in tRPC handler [${path}]:`, error);
      },
    },
  });

  // Start server
  const port = parseInt(process.env.API_PORT ?? '3001', 10);
  const host = process.env.API_HOST ?? '0.0.0.0';

  await server.listen({ port, host });
  console.log(`Server running at http://${host}:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Frontend tRPC Client

```typescript
// apps/web/src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@honeydo/api/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${import.meta.env.VITE_API_URL}/trpc`,
        async headers() {
          // Clerk handles auth headers automatically via cookies
          return {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
  });
}
```

#### Provider Setup
```tsx
// apps/web/src/providers/TRPCProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTRPCClient } from '../lib/trpc';
import { useState } from 'react';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 1000,
        retry: 1,
      },
    },
  }));

  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

#### Usage in Components
```tsx
// Example component
import { trpc } from '../lib/trpc';

function UserProfile() {
  const { data: user, isLoading } = trpc.user.me.useQuery();
  const updateProfile = trpc.user.updateProfile.useMutation();

  if (isLoading) return <Spinner />;

  return (
    <div>
      <h1>Hello, {user?.name}</h1>
      <button onClick={() => updateProfile.mutate({ name: 'New Name' })}>
        Update
      </button>
    </div>
  );
}
```

### Shared Types

Export the router type from api for frontend to import:

```typescript
// apps/api/src/trpc/router.ts
export type AppRouter = typeof appRouter;

// Package.json export
{
  "exports": {
    "./trpc": "./src/trpc/router.ts"
  }
}
```

### Error Handling

```typescript
// Standardized error responses
import { TRPCError } from '@trpc/server';

// Not found
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'User not found',
});

// Validation (automatic with zod)
// Input validation errors return code: 'BAD_REQUEST'

// Auth errors
throw new TRPCError({
  code: 'UNAUTHORIZED',
  message: 'Please sign in',
});

// Permission errors
throw new TRPCError({
  code: 'FORBIDDEN',
  message: 'Admin access required',
});
```

## Implementation Steps

1. **Install Backend Dependencies**
   - @trpc/server, zod, superjson
   - @fastify/cors, pino-pretty

2. **Install Frontend Dependencies**
   - @trpc/client, @trpc/react-query
   - @tanstack/react-query, superjson

3. **Set Up tRPC Infrastructure**
   - Create trpc/index.ts (initialization)
   - Create trpc/context.ts
   - Create trpc/procedures.ts
   - Create trpc/router.ts

4. **Configure Fastify**
   - Set up server.ts
   - Register CORS
   - Register Clerk
   - Register tRPC plugin

5. **Create Base Routers**
   - User router (me, updateProfile)
   - Settings router (placeholder)

6. **Set Up Frontend Client**
   - Create lib/trpc.ts
   - Create TRPCProvider
   - Wrap app in provider

7. **Test End-to-End**
   - Call tRPC from component
   - Verify type inference
   - Test auth flow

8. **Document Module Pattern**
   - How to add new module router
   - Where to register it

## Environment Variables

```env
# API
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info

# Frontend
VITE_API_URL=http://localhost:3001
```

## Definition of Done

- [ ] Fastify server starts without errors
- [ ] `/health` returns OK
- [ ] tRPC procedures callable from frontend
- [ ] Full type inference works (no `any` types)
- [ ] Auth context available in protected procedures
- [ ] Database accessible in procedures
- [ ] Errors formatted consistently
- [ ] Module router pattern documented

## Dependencies

- Feature 1.1 (Project Setup) - complete
- Feature 1.2 (Authentication) - complete
- Feature 1.3 (Database) - complete

## Notes

- tRPC batches requests by default (efficiency)
- Use superjson for Date/Map/Set serialization
- Consider tRPC subscriptions for real-time (vs Socket.io)
- React Query handles caching and refetching
