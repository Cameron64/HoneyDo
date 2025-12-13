# Providers - Claude Code Instructions

> React context providers that wrap the app

## Overview

The `providers/` directory contains React context providers that initialize and provide global services to the component tree.

## Directory Structure

```
apps/web/src/providers/
├── CLAUDE.md           # This file
└── TRPCProvider.tsx    # tRPC + React Query provider
```

## TRPCProvider

Provides tRPC client and React Query to the app.

### Features

1. **QueryClient Configuration:**
```typescript
const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,  // Consider data fresh for 5 seconds
      retry: 1,             // Retry failed queries once
    },
    mutations: {
      onError: (error) => {
        // Global mutation error logging
        errorService.logTrpcError(error);
      },
    },
  },
}));
```

2. **Auth Integration:**
```typescript
const { getToken } = useAuth();  // From Clerk
const trpcClient = useMemo(
  () => createTRPCClient(getToken),
  [getToken]
);
```

3. **Global Error Handling:**
```typescript
useEffect(() => {
  errorService.initGlobalHandlers();
}, []);
```

### Usage in App.tsx

```typescript
import { TRPCProvider } from '@/providers/TRPCProvider';
import { ClerkProvider } from '@clerk/clerk-react';

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <TRPCProvider>
        {/* App content */}
      </TRPCProvider>
    </ClerkProvider>
  );
}
```

### Provider Order

The app's provider nesting order matters:

```
ClerkProvider         # Auth (outermost - no deps)
└── TRPCProvider      # API client (needs Clerk's getToken)
    └── RouterProvider # Routes (needs tRPC for data)
        └── Components # App UI
```

## Adding New Providers

When creating a new provider:

### 1. Create the Provider File

```typescript
// providers/FeatureFlagProvider.tsx
import { createContext, useContext, type ReactNode } from 'react';

interface FeatureFlagContextValue {
  flags: Record<string, boolean>;
  isEnabled: (flag: string) => boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const flags = useFetchFlags();  // Your implementation

  const value: FeatureFlagContextValue = {
    flags,
    isEnabled: (flag) => flags[flag] ?? false,
  };

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  }
  return context;
}
```

### 2. Add to App Provider Chain

```typescript
// App.tsx
<ClerkProvider>
  <TRPCProvider>
    <FeatureFlagProvider>  {/* New provider */}
      <RouterProvider />
    </FeatureFlagProvider>
  </TRPCProvider>
</ClerkProvider>
```

### 3. Use the Hook

```typescript
import { useFeatureFlags } from '@/providers/FeatureFlagProvider';

function MyComponent() {
  const { isEnabled } = useFeatureFlags();

  if (isEnabled('new-feature')) {
    return <NewFeature />;
  }
  return <OldFeature />;
}
```

## Provider vs Store

**Use a Provider when:**
- Initializing external services (tRPC, Socket.io)
- Providing context that rarely changes
- Wrapping third-party context (Clerk, etc.)

**Use a Zustand Store when:**
- Managing frequently changing UI state
- State needs to persist (localStorage)
- Multiple components read/write the same state

## Related Files

- App root: `../App.tsx`
- tRPC client: `../lib/trpc.ts`
- Error service: `../services/error-service.ts`
- Clerk auth: Uses `@clerk/clerk-react`
