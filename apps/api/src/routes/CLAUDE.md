# Routes - Claude Code Instructions

> Non-tRPC HTTP routes: webhooks and external integrations

## Quick Navigation

| File | Purpose |
|------|---------|
| `webhooks/clerk.ts` | Clerk user sync webhook |

## Architecture

```
routes/
└── webhooks/
    └── clerk.ts    # POST /api/webhooks/clerk
```

Routes are traditional Fastify HTTP handlers, used for:
- External webhooks (Clerk, payment providers, etc.)
- Health checks
- Static file serving
- Anything that can't use tRPC (no auth token available)

## Clerk Webhook

Syncs Clerk users to local database on user events.

**Endpoint:** `POST /api/webhooks/clerk`

**Events Handled:**
| Event | Action |
|-------|--------|
| `user.created` | Insert user into `users` table |
| `user.updated` | Update user's email, name, avatar |
| `user.deleted` | Delete user from database |

**Security:**
- Uses Svix signature verification
- Requires `CLERK_WEBHOOK_SECRET` env var
- Validates `svix-id`, `svix-timestamp`, `svix-signature` headers

**User Data Synced:**
```typescript
{
  id: string,           // Clerk user ID
  email: string,        // Primary email
  name: string | null,  // First + Last name
  avatarUrl: string | null,
  role: 'admin' | 'member',  // First user = admin
}
```

## Creating a New Webhook

```typescript
// src/routes/webhooks/example.ts
import type { FastifyInstance } from 'fastify';

export async function registerExampleWebhook(fastify: FastifyInstance) {
  fastify.post('/api/webhooks/example', async (request, reply) => {
    // 1. Verify signature/auth
    const signature = request.headers['x-signature'];
    if (!verifySignature(signature, request.body)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // 2. Process webhook
    const payload = request.body as ExamplePayload;
    await processEvent(payload);

    // 3. Return success
    return { success: true };
  });
}
```

**Register in server.ts:**
```typescript
import { registerExampleWebhook } from './routes/webhooks/example';

// In server setup
await app.register(registerExampleWebhook);
```

## Environment Variables

```bash
CLERK_WEBHOOK_SECRET=whsec_...  # From Clerk dashboard
```

## Webhook Best Practices

1. **Verify signatures** - Always validate webhook authenticity
2. **Idempotent handlers** - Same event delivered twice should be safe
3. **Quick responses** - Return 200 fast, process async if needed
4. **Error handling** - Log failures but return 200 to avoid retries
5. **Use upsert** - `onConflictDoUpdate` handles re-delivery

## Related Files

- Server setup: `src/server.ts`
- Database schema: `src/db/schema/users.ts`
- Clerk auth: `src/trpc/context.ts`, `src/trpc/procedures.ts`
