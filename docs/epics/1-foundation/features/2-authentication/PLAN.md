# Feature 1.2: Authentication

> Users can sign in with Google. Protected routes stay protected.

## Overview

This feature integrates Clerk for authentication. Users will sign in via Google OAuth, and both frontend routes and API endpoints will be protected. User data syncs to the local SQLite database on first login.

## Acceptance Criteria

- [ ] Clerk application created and configured
- [ ] Sign-in page with Google OAuth
- [ ] Sign-up page (or combined with sign-in)
- [ ] Protected routes redirect to sign-in
- [ ] API middleware validates Clerk sessions
- [ ] User record created in SQLite on first login
- [ ] User's name and avatar displayed when logged in
- [ ] Sign-out functionality works
- [ ] Clerk webhooks sync user updates

## Technical Details

### Why Clerk

- Handles OAuth complexity
- Hosted UI components (or customizable)
- Good React SDK
- Webhook support for sync
- Free tier sufficient for personal use

### Clerk Setup

1. Create Clerk application at clerk.com
2. Enable Google OAuth provider
3. Configure redirect URLs:
   - Development: `http://localhost:5173`
   - Production: Your Tailscale URL
4. Get API keys

### Frontend Integration

#### Install Dependencies
```bash
pnpm add @clerk/clerk-react --filter @honeydo/web
```

#### Provider Setup
```tsx
// apps/web/src/main.tsx
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>
);
```

#### Protected Route Component
```tsx
// apps/web/src/components/ProtectedRoute.tsx
import { useAuth, RedirectToSignIn } from '@clerk/clerk-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <LoadingSpinner />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return <>{children}</>;
}
```

#### Sign In Page
```tsx
// apps/web/src/pages/SignIn.tsx
import { SignIn } from '@clerk/clerk-react';

export function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-lg'
          }
        }}
      />
    </div>
  );
}
```

#### User Button
```tsx
// apps/web/src/components/UserButton.tsx
import { UserButton as ClerkUserButton } from '@clerk/clerk-react';

export function UserButton() {
  return (
    <ClerkUserButton
      afterSignOutUrl="/sign-in"
      appearance={{
        elements: {
          avatarBox: 'w-10 h-10'
        }
      }}
    />
  );
}
```

### Backend Integration

#### Install Dependencies
```bash
pnpm add @clerk/fastify --filter @honeydo/api
```

#### Middleware Setup
```typescript
// apps/api/src/middleware/auth.ts
import { clerkPlugin, getAuth } from '@clerk/fastify';
import { FastifyInstance } from 'fastify';

export async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(clerkPlugin);
}

// Decorator to get current user
export function getCurrentUser(request: FastifyRequest) {
  const auth = getAuth(request);
  return auth;
}
```

#### Protected Route Example
```typescript
// apps/api/src/routes/protected.ts
import { getAuth } from '@clerk/fastify';

fastify.get('/api/me', async (request, reply) => {
  const { userId } = getAuth(request);

  if (!userId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  return user;
});
```

### User Sync (Webhooks)

#### Webhook Endpoint
```typescript
// apps/api/src/routes/webhooks/clerk.ts
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/fastify';

fastify.post('/api/webhooks/clerk', async (request, reply) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  const wh = new Webhook(WEBHOOK_SECRET);
  const evt = wh.verify(
    JSON.stringify(request.body),
    request.headers as Record<string, string>
  ) as WebhookEvent;

  switch (evt.type) {
    case 'user.created':
    case 'user.updated':
      await upsertUser(evt.data);
      break;
    case 'user.deleted':
      await deleteUser(evt.data.id);
      break;
  }

  return { success: true };
});

async function upsertUser(clerkUser: UserJSON) {
  await db.insert(users)
    .values({
      id: clerkUser.id,
      email: clerkUser.email_addresses[0]?.email_address ?? '',
      name: `${clerkUser.first_name ?? ''} ${clerkUser.last_name ?? ''}`.trim(),
      avatarUrl: clerkUser.image_url,
      role: 'member', // Default role
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: clerkUser.email_addresses[0]?.email_address,
        name: `${clerkUser.first_name ?? ''} ${clerkUser.last_name ?? ''}`.trim(),
        avatarUrl: clerkUser.image_url,
        updatedAt: new Date(),
      }
    });
}
```

### Database Schema (for users)

```typescript
// apps/api/src/db/schema/users.ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['admin', 'member', 'guest'] }).default('member'),
  preferences: text('preferences', { mode: 'json' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
```

### Routes Structure

```
/sign-in          → Sign in page (public)
/sign-up          → Sign up page (public)
/                 → Home (protected)
/settings         → Settings (protected)
/*                → All other routes (protected)
```

## Implementation Steps

1. **Create Clerk Application**
   - Sign up at clerk.com
   - Create new application
   - Enable Google OAuth
   - Note publishable + secret keys

2. **Configure Environment**
   - Add keys to `.env`
   - Add to `.env.example`

3. **Install Frontend Dependencies**
   - @clerk/clerk-react

4. **Set Up ClerkProvider**
   - Wrap app in provider
   - Configure appearance

5. **Create Auth Pages**
   - Sign-in page
   - Sign-up page (optional, can be same)

6. **Protect Routes**
   - Create ProtectedRoute component
   - Apply to route tree

7. **Add User UI**
   - UserButton in header
   - Show user name/avatar

8. **Install Backend Dependencies**
   - @clerk/fastify
   - svix (for webhook verification)

9. **Create Auth Middleware**
   - Clerk plugin registration
   - Auth extraction helper

10. **Create Webhook Endpoint**
    - Verify webhook signature
    - Handle user.created/updated/deleted
    - Sync to database

11. **Configure Clerk Webhooks**
    - Add webhook URL in Clerk dashboard
    - Subscribe to user events

12. **Test Full Flow**
    - Sign in with Google
    - Verify user created in DB
    - Access protected route
    - Sign out and verify redirect

## Environment Variables

```env
# Frontend
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Backend
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
```

## Security Considerations

- Never expose CLERK_SECRET_KEY to frontend
- Verify webhook signatures
- Use httpOnly cookies (Clerk handles this)
- Validate user exists in DB for API calls

## Definition of Done

- [ ] Can sign in with Google
- [ ] Protected pages redirect when not signed in
- [ ] API returns 401 for unauthenticated requests
- [ ] User data synced to SQLite
- [ ] UserButton shows avatar and sign-out option
- [ ] Webhook endpoint receives and processes events

## Dependencies

- Feature 1.1 (Project Setup) - complete
- Feature 1.3 (Database) - needed for user storage
  - Can stub database initially, implement fully after 1.3

## Notes

- First user to sign up could be auto-assigned admin role
- Consider invitation-only mode for household (future)
- Clerk's hosted UI is fine for MVP, can customize later
