# Web Lib - Claude Code Instructions

> Core utilities and client setup for the web app

## Overview

The `lib/` directory contains foundational utilities used throughout the web application. These are low-level building blocks, not feature-specific code.

## Directory Structure

```
apps/web/src/lib/
├── CLAUDE.md    # This file
├── trpc.ts      # tRPC client configuration
└── utils.ts     # General utilities (cn helper)
```

## trpc.ts

Creates and configures the tRPC client for API communication.

### Exports

```typescript
// The tRPC React hooks
export const trpc: CreateTRPCReact<AppRouter>;

// Factory function to create the client
export function createTRPCClient(
  getToken?: () => Promise<string | null>
): TRPCClientInstance;
```

### Usage

The tRPC client is used via React hooks:

```typescript
import { trpc } from '@/lib/trpc';

// Query
const { data } = trpc.recipes.meals.getRange.useQuery({ start, end });

// Mutation
const mutation = trpc.recipes.meals.remove.useMutation();
mutation.mutate({ id });

// Utils for cache manipulation
const utils = trpc.useUtils();
utils.recipes.meals.getRange.invalidate();
```

### Features

**Dynamic API URL:**
```typescript
function getApiUrl(): string {
  // Use VITE_API_URL if set, otherwise derive from current hostname
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}
```

**Auth Token Injection:**
```typescript
// Automatically includes Clerk JWT in Authorization header
headers() {
  const token = await getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
```

**SuperJSON Transformer:**
```typescript
// Handles Date, Map, Set, BigInt serialization
transformer: superjson,
```

### Type Safety

The client is typed against the API's `AppRouter`:

```typescript
import type { AppRouter } from '../../../api/src/trpc/router';

export const trpc: CreateTRPCReact<AppRouter> = createTRPCReact<AppRouter>();
```

This enables full autocomplete and type checking for all API routes.

## utils.ts

General utilities used across components.

### cn Helper

Combines class names with Tailwind merge support:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage:**
```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-primary',
  className
)}>
```

**Why twMerge?**
- Resolves Tailwind class conflicts intelligently
- `cn('p-2', 'p-4')` returns `'p-4'`, not `'p-2 p-4'`
- Essential for component prop spreading

## Import Alias

The `@/` alias points to `src/`:

```typescript
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
```

Configured in `vite.config.ts` and `tsconfig.json`.

## Adding New Utilities

When adding shared utilities:

1. **Is it feature-specific?** → Put in `modules/<feature>/utils/`
2. **Is it a React hook?** → Put in `hooks/`
3. **Is it a low-level utility?** → Put in `lib/`

Example utilities that belong here:
- Format helpers (dates, currency)
- Storage wrappers (localStorage)
- URL manipulation
- Debounce/throttle (if not using hooks)

## Related Files

- tRPC provider: `../providers/TRPCProvider.tsx`
- API router type: `apps/api/src/trpc/router.ts`
- Vite config: `vite.config.ts`
