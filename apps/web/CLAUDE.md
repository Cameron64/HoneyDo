# HoneyDo Web - Claude Code Instructions

> React PWA with Vite, TanStack Router, tRPC, and Zustand

## Quick Reference

| Task | Command/Location |
|------|------------------|
| Start dev server | `pnpm dev` |
| Add page | `src/pages/<Module>.tsx` + update `router.tsx` |
| Add component | `src/components/<category>/<Name>.tsx` |
| Add module component | `src/modules/<module>/components/<Name>.tsx` |
| Add store | `src/stores/<name>.ts` |
| Add hook | `src/hooks/use-<name>.ts` |
| Build | `pnpm build` |
| Type check | `pnpm typecheck` |

## Architecture Overview

```
apps/web/src/
├── main.tsx                # React entrypoint
├── App.tsx                 # Root component (providers)
├── router.tsx              # TanStack Router configuration
├── components/
│   ├── ui/                # shadcn/ui primitives
│   ├── common/            # Shared components (LoadingSpinner, etc.)
│   ├── layout/            # AppShell, Header, Sidebar, BottomNav
│   ├── auth/              # ProtectedRoute, UserButton
│   └── pwa/               # InstallPrompt, OfflineIndicator
├── pages/                  # Route page components
│   └── modules/           # Module placeholder pages
├── modules/               # Feature module code
│   └── <module>/
│       ├── components/    # Module-specific components
│       ├── hooks/         # Module-specific hooks
│       └── stores/        # Module-specific stores
├── providers/             # React context providers
├── services/              # API clients, socket
├── stores/                # Global Zustand stores
├── hooks/                 # Shared custom hooks
└── lib/                   # Utilities (trpc client, cn helper)
```

## Routing (TanStack Router)

### Adding a New Route

```typescript
// src/router.tsx
import { NewPage } from './pages/NewPage';

// Add to route tree
const newRoute = createRoute({
  getParentRoute: () => appLayoutRoute,  // Use appLayoutRoute for authenticated pages
  path: '/new-path',
  component: NewPage,
});

// Include in routeTree
const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([signInRoute, signUpRoute]),
  appLayoutRoute.addChildren([
    homeRoute,
    settingsRoute,
    shoppingRoute,
    recipesRoute,
    homeAutomationRoute,
    newRoute,  // Add here
    notFoundRoute,
  ]),
]);
```

### Route Layouts

| Layout | Purpose | Includes |
|--------|---------|----------|
| `authLayoutRoute` | Sign in/up pages | No sidebar, minimal UI |
| `appLayoutRoute` | All authenticated pages | AppShell with header, sidebar, bottom nav |

### Navigation

```typescript
import { Link, useNavigate } from '@tanstack/react-router';

// Declarative navigation
<Link to="/shopping" className="...">
  Shopping List
</Link>

// Programmatic navigation
const navigate = useNavigate();
navigate({ to: '/shopping/$listId', params: { listId: '123' } });
```

## tRPC Client Usage

### Setup (Already Done)

The tRPC client is configured in `src/lib/trpc.ts` and provided via `TRPCProvider`.

### Queries

```typescript
import { trpc } from '@/lib/trpc';

function ShoppingLists() {
  // Basic query
  const { data: lists, isLoading, error } = trpc.shoppingList.getAll.useQuery();

  // Query with variables
  const { data: list } = trpc.shoppingList.getById.useQuery(
    { id: listId },
    { enabled: !!listId }  // Only run when listId exists
  );

  // With refetch options
  const { data } = trpc.shoppingList.getAll.useQuery(undefined, {
    refetchInterval: 30000,  // Refetch every 30s
    staleTime: 5000,         // Consider fresh for 5s
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div>Error: {error.message}</div>;

  return <>{lists.map(list => ...)}</>;
}
```

### Mutations

```typescript
function CreateListForm() {
  const utils = trpc.useUtils();

  const createMutation = trpc.shoppingList.create.useMutation({
    onSuccess: (newList) => {
      // Invalidate and refetch
      utils.shoppingList.getAll.invalidate();

      // Or optimistically update cache
      utils.shoppingList.getAll.setData(undefined, (old) =>
        old ? [...old, newList] : [newList]
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (name: string) => {
    createMutation.mutate({ name });
  };

  return (
    <Button
      onClick={() => handleSubmit('New List')}
      disabled={createMutation.isPending}
    >
      {createMutation.isPending ? 'Creating...' : 'Create List'}
    </Button>
  );
}
```

### Optimistic Updates

```typescript
const checkItemMutation = trpc.shoppingList.checkItem.useMutation({
  onMutate: async ({ itemId, checked }) => {
    // Cancel outgoing refetches
    await utils.shoppingList.getItems.cancel({ listId });

    // Snapshot previous value
    const previousItems = utils.shoppingList.getItems.getData({ listId });

    // Optimistically update
    utils.shoppingList.getItems.setData({ listId }, (old) =>
      old?.map(item =>
        item.id === itemId ? { ...item, checked } : item
      )
    );

    return { previousItems };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    utils.shoppingList.getItems.setData(
      { listId },
      context?.previousItems
    );
  },
  onSettled: () => {
    // Always refetch after error or success
    utils.shoppingList.getItems.invalidate({ listId });
  },
});
```

## Zustand State Management

### Creating a Store

```typescript
// src/stores/shopping.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShoppingStore {
  // State
  activeListId: string | null;
  viewMode: 'list' | 'grid';

  // Actions
  setActiveList: (id: string | null) => void;
  setViewMode: (mode: 'list' | 'grid') => void;
}

export const useShoppingStore = create<ShoppingStore>()(
  persist(
    (set) => ({
      activeListId: null,
      viewMode: 'list',

      setActiveList: (id) => set({ activeListId: id }),
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'shopping-store',  // localStorage key
      partialize: (state) => ({ viewMode: state.viewMode }),  // Only persist viewMode
    }
  )
);
```

### Using a Store

```typescript
import { useShoppingStore } from '@/stores/shopping';

function ShoppingList() {
  // Subscribe to specific state
  const activeListId = useShoppingStore((s) => s.activeListId);
  const setActiveList = useShoppingStore((s) => s.setActiveList);

  // Or destructure multiple
  const { viewMode, setViewMode } = useShoppingStore();

  return (
    <Button onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
      Toggle View
    </Button>
  );
}
```

### Store Patterns

- Use **selectors** to prevent unnecessary re-renders
- Store only **client state** (UI preferences, active selections)
- Use **tRPC/TanStack Query** for server state
- Use `persist` middleware for state that should survive refresh

## Component Patterns

### Basic Component Structure

```typescript
// src/components/shopping/ShoppingList.tsx
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ShoppingListProps {
  listId: string;
  className?: string;
}

export function ShoppingList({ listId, className }: ShoppingListProps) {
  const { data: list, isLoading } = trpc.shoppingList.getById.useQuery({ id: listId });

  if (isLoading) return <LoadingSpinner />;
  if (!list) return null;

  return (
    <Card className={cn('p-4', className)}>
      <h2 className="text-lg font-semibold">{list.name}</h2>
      {/* ... */}
    </Card>
  );
}
```

### Component File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Component | `PascalCase.tsx` | `ShoppingList.tsx` |
| Hook | `use-kebab-case.ts` | `use-shopping-list.ts` |
| Store | `kebab-case.ts` | `shopping.ts` |
| Utility | `kebab-case.ts` | `format-date.ts` |
| Types | `<name>.types.ts` | `shopping.types.ts` |

### shadcn/ui Components

Located in `src/components/ui/`. Already installed:
- `button`, `card`, `dropdown-menu`, `label`, `select`, `separator`, `switch`

Add more via:
```bash
npx shadcn@latest add dialog input toast
```

Use with Tailwind:
```typescript
import { Button } from '@/components/ui/button';

<Button variant="outline" size="sm">Click me</Button>
<Button variant="destructive">Delete</Button>
```

### Conditional Classes

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-primary text-primary-foreground',
  isDisabled && 'opacity-50 pointer-events-none',
  className
)}>
```

## WebSocket / Real-time

### Socket Connection

Already configured in `src/services/socket/client.ts`.

### Using Socket Events

```typescript
// src/services/socket/hooks.ts
import { useEffect } from 'react';
import { socket } from './client';

export function useSocketEvent<T>(
  event: string,
  handler: (data: T) => void
) {
  useEffect(() => {
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]);
}
```

### In Components

```typescript
import { useSocketEvent } from '@/services/socket/hooks';
import { useCallback } from 'react';

function ShoppingList({ listId }: { listId: string }) {
  const utils = trpc.useUtils();

  // Handle real-time updates
  const handleItemAdded = useCallback((item: ShoppingItem) => {
    if (item.listId === listId) {
      utils.shoppingList.getItems.setData({ listId }, (old) =>
        old ? [...old, item] : [item]
      );
    }
  }, [listId, utils]);

  useSocketEvent('shopping:item:added', handleItemAdded);

  // ... rest of component
}
```

## Custom Hooks

### Creating Hooks

```typescript
// src/hooks/use-debounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### Module-Specific Hooks

```typescript
// src/modules/shopping-list/hooks/use-shopping-list.ts
import { trpc } from '@/lib/trpc';
import { useShoppingStore } from '@/stores/shopping';

export function useShoppingList(listId: string) {
  const { data: list, isLoading } = trpc.shoppingList.getById.useQuery({ id: listId });
  const { data: items } = trpc.shoppingList.getItems.useQuery({ listId });

  const utils = trpc.useUtils();
  const checkItem = trpc.shoppingList.checkItem.useMutation({
    onSuccess: () => utils.shoppingList.getItems.invalidate({ listId }),
  });

  return {
    list,
    items: items ?? [],
    isLoading,
    checkItem: (itemId: string, checked: boolean) =>
      checkItem.mutate({ itemId, checked }),
  };
}
```

## Styling

### Tailwind Classes

- Use mobile-first: `text-sm md:text-base lg:text-lg`
- Dark mode: `bg-white dark:bg-gray-900`
- Use CSS variables for theme colors: `bg-primary`, `text-muted-foreground`

### Theme Colors (CSS Variables)

```css
/* Already configured in globals.css */
--background, --foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive, --destructive-foreground
--border, --input, --ring
```

### Responsive Design

Primary device is mobile (phone). Design mobile-first:

```typescript
<div className="
  flex flex-col gap-2          {/* Mobile: stack vertically */}
  md:flex-row md:gap-4         {/* Tablet+: row layout */}
  lg:gap-6                     {/* Desktop: more spacing */}
">
```

## Forms

### Basic Form

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CreateListForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">List Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter list name"
        />
      </div>
      <Button type="submit" disabled={!name.trim()}>
        Create List
      </Button>
    </form>
  );
}
```

### Form with Zod Validation

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createListSchema, type CreateListInput } from '@honeydo/shared/schemas';

function CreateListForm() {
  const form = useForm<CreateListInput>({
    resolver: zodResolver(createListSchema),
    defaultValues: { name: '' },
  });

  const createMutation = trpc.shoppingList.create.useMutation();

  const onSubmit = (data: CreateListInput) => {
    createMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('name')} />
      {form.formState.errors.name && (
        <p className="text-destructive text-sm">
          {form.formState.errors.name.message}
        </p>
      )}
      <Button type="submit">Create</Button>
    </form>
  );
}
```

## Error Handling

### Error Boundary

```typescript
// Already exists at src/components/common/ErrorBoundary.tsx
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

<ErrorBoundary fallback={<ErrorFallback />}>
  <RiskyComponent />
</ErrorBoundary>
```

### Query Errors

```typescript
const { data, error, isError } = trpc.shoppingList.getAll.useQuery();

if (isError) {
  return (
    <div className="text-destructive">
      Error loading lists: {error.message}
    </div>
  );
}
```

## PWA Features

### Install Prompt

```typescript
// Already exists at src/components/pwa/InstallPrompt.tsx
// Shows prompt when app can be installed
```

### Offline Indicator

```typescript
// Already exists at src/components/pwa/OfflineIndicator.tsx
// Shows when offline
```

## Environment Variables

Vite exposes env vars prefixed with `VITE_`:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const wsUrl = import.meta.env.VITE_WS_URL;
```

Required in `apps/web/.env`:
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Common Tasks

### Add a New Module Page

1. Create page component in `src/pages/modules/<Module>.tsx`
2. Add route in `src/router.tsx`
3. Add to sidebar navigation in `src/components/layout/Sidebar.tsx`
4. Add to bottom nav in `src/components/layout/BottomNav.tsx`

### Add Module-Specific Components

1. Create directory: `src/modules/<module>/components/`
2. Add components following naming conventions
3. Create index.ts to export all components

### Add Global State

1. Create store in `src/stores/<name>.ts`
2. Use Zustand patterns above
3. Import and use in components

## Files to Reference

- App root: `src/App.tsx`
- Router config: `src/router.tsx`
- tRPC client: `src/lib/trpc.ts`
- UI components: `src/components/ui/`
- Layout: `src/components/layout/`
- Shared types: `packages/shared/src/types/`
- Feature plans: `docs/epics/*/features/*/PLAN.md`
