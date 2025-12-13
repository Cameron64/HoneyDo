# tRPC Configuration - Claude Code Instructions

> Core tRPC setup: router factory, context, procedures, and auth middleware

## Quick Navigation

| File | Purpose |
|------|---------|
| `index.ts` | tRPC initialization, exports `router`, `publicProcedure`, `middleware` |
| `context.ts` | Request context creation (db, auth, userId) |
| `procedures.ts` | Auth middleware, `protectedProcedure`, `adminProcedure` |
| `router.ts` | Root router combining all module routers |

## Architecture

```
trpc/
├── index.ts       # tRPC init with superjson transformer
├── context.ts     # Creates { req, res, db, auth, userId }
├── procedures.ts  # isAuthenticated & isAdmin middleware
└── router.ts      # AppRouter = { user, settings, shopping, home, recipes }
```

## Key Exports

### From `index.ts`

```typescript
import { router, publicProcedure, middleware, TRPCError, createCallerFactory } from './index';
```

- `router` - Factory for creating tRPC routers
- `publicProcedure` - Base procedure (no auth required)
- `middleware` - Factory for creating middleware
- `TRPCError` - Error class for tRPC errors
- `createCallerFactory` - For server-side router calls

### From `procedures.ts`

```typescript
import { protectedProcedure, adminProcedure } from './procedures';
```

| Procedure | Auth | Role | Use For |
|-----------|------|------|---------|
| `publicProcedure` | No | Any | Health checks, public endpoints |
| `protectedProcedure` | Yes | Any | All user operations |
| `adminProcedure` | Yes | Admin | Admin-only operations (HA config, etc.) |

### From `router.ts`

```typescript
import { appRouter, type AppRouter } from './router';
```

Root router structure:
```typescript
appRouter = {
  user: userRouter,        // User profile
  settings: settingsRouter, // App settings
  shopping: shoppingRouter, // Shopping lists (3 sub-routers)
  home: homeRouter,        // Home automation (5 sub-routers)
  recipes: recipesRouter,  // Recipes & meals (7 sub-routers + wizard)
}
```

## Context Shape

```typescript
interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  db: DrizzleClient;
  auth: ClerkAuth;
  userId: string | null;    // null for public procedures
  user?: User;              // Added by protectedProcedure middleware
}
```

## Dev Bypass Mode

For testing without Clerk auth:

```bash
# .env
DEV_BYPASS_AUTH=true
DEV_USER_ID=dev-test-user
```

When enabled:
- Skips Clerk verification
- Uses `DEV_USER_ID` as the user ID
- Auto-creates dev user in database (first user = admin)

## Creating a New Router

```typescript
// src/modules/<module>/router.ts
import { router } from '../../trpc';
import { protectedProcedure, adminProcedure } from '../../trpc/procedures';
import { z } from 'zod';

export const myRouter = router({
  // Query - read data
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.myTable.findMany();
  }),

  // Query with input
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.myTable.findFirst({
        where: eq(myTable.id, input.id),
      });
    }),

  // Mutation
  create: protectedProcedure
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.insert(myTable)
        .values({ ...input, createdBy: ctx.userId })
        .returning();
      return item;
    }),

  // Admin only
  deleteAll: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(myTable);
  }),
});
```

## Registering a Router

```typescript
// src/trpc/router.ts
import { myRouter } from '../modules/my-module/router';

export const appRouter = router({
  // ... existing routers
  myModule: myRouter,  // Add here
});
```

## Error Handling

```typescript
import { TRPCError } from '../../trpc';

// Not found
if (!item) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
}

// Forbidden
if (item.createdBy !== ctx.userId) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
}

// Bad request
throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid input' });

// Internal error
throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' });
```

## Transformer

Uses `superjson` for serialization:
- Supports `Date`, `Map`, `Set`, `BigInt`, `undefined`
- Both client and server must use same transformer

## Zod Error Formatting

Zod validation errors are automatically flattened and included in response:

```typescript
{
  code: 'BAD_REQUEST',
  message: 'Invalid input',
  data: {
    zodError: {
      fieldErrors: { name: ['Required'] },
      formErrors: []
    }
  }
}
```

## Related Files

- Module routers: `src/modules/*/router.ts`
- Server setup: `src/server.ts` (registers tRPC plugin)
- Client setup: `apps/web/src/lib/trpc.ts`
