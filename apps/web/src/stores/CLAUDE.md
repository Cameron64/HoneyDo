# HoneyDo Web Stores - Claude Code Instructions

> Global Zustand stores for the web app

## Overview

This directory contains global Zustand stores that manage application-wide state. Module-specific stores should live in their respective module directories.

## Directory Structure

```
apps/web/src/stores/
├── CLAUDE.md              # This file
├── settings.ts            # User settings/preferences
├── ui.ts                  # Global UI state
└── debug.ts               # Debug/developer tools state
```

## Store Philosophy

### When to Use Global Stores

- **App-wide Settings**: Theme, notifications, feature flags
- **UI State**: Sidebar open/closed, modal visibility
- **Debug State**: Developer tools, logging levels
- **Auth State**: Current user info (if not from Clerk)

### When to Use Module Stores

- **Feature-specific State**: Shopping list selection, wizard progress
- **Local UI State**: Form state, filter selections

### When NOT to Use Stores

- **Server Data**: Use tRPC/TanStack Query instead
- **Form State**: Use React Hook Form or local state
- **Derived Data**: Compute from other state, don't duplicate

## Available Stores

### settingsStore

User preferences and settings.

```typescript
import { useSettingsStore } from '@/stores/settings';

function MyComponent() {
  const { theme, setTheme } = useSettingsStore();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle Theme
    </button>
  );
}
```

### uiStore

Global UI state management.

```typescript
import { useUIStore } from '@/stores/ui';

function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside className={isSidebarOpen ? 'open' : 'closed'}>
      <button onClick={toggleSidebar}>Toggle</button>
    </aside>
  );
}
```

### debugStore

Developer tools and debugging state.

```typescript
import { useDebugStore } from '@/stores/debug';

function DebugPanel() {
  const { isDebugMode, logLevel, setLogLevel } = useDebugStore();

  if (!isDebugMode) return null;

  return (
    <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
      <option value="error">Error</option>
      <option value="warn">Warn</option>
      <option value="info">Info</option>
      <option value="debug">Debug</option>
    </select>
  );
}
```

## Creating a New Store

### Basic Store

```typescript
// stores/my-store.ts
import { create } from 'zustand';

interface MyStore {
  // State
  value: string;
  count: number;

  // Actions
  setValue: (v: string) => void;
  increment: () => void;
  reset: () => void;
}

export const useMyStore = create<MyStore>((set) => ({
  // Initial state
  value: '',
  count: 0,

  // Actions
  setValue: (value) => set({ value }),
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ value: '', count: 0 }),
}));
```

### Store with Persistence

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'honeydo-settings', // localStorage key
      partialize: (state) => ({ theme: state.theme }), // Only persist theme
    }
  )
);
```

### Store with Selectors

```typescript
// Define selectors for efficient re-renders
export const useTheme = () => useSettingsStore((s) => s.theme);
export const useSetTheme = () => useSettingsStore((s) => s.setTheme);

// Usage - only re-renders when theme changes
function ThemeToggle() {
  const theme = useTheme();
  const setTheme = useSetTheme();
  // ...
}
```

## Module-Specific Stores

Each module can have its own stores:

```
src/modules/shopping/stores/
├── index.ts
├── undo.ts        # Undo/redo action stack
└── offline.ts     # Offline operation queue

src/modules/recipes/stores/
├── index.ts
└── wizard.ts      # Wizard UI state
```

### Example: Shopping Undo Store

```typescript
// modules/shopping/stores/undo.ts
import { create } from 'zustand';

interface UndoAction {
  id: string;
  type: 'check' | 'delete' | 'add';
  itemId: string;
  previousState: unknown;
  timestamp: number;
}

interface UndoStore {
  actions: UndoAction[];
  push: (action: Omit<UndoAction, 'id' | 'timestamp'>) => void;
  pop: () => UndoAction | undefined;
  clear: () => void;
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  actions: [],
  push: (action) =>
    set((state) => ({
      actions: [
        ...state.actions,
        { ...action, id: crypto.randomUUID(), timestamp: Date.now() },
      ].slice(-10), // Keep last 10 actions
    })),
  pop: () => {
    const actions = get().actions;
    if (actions.length === 0) return undefined;
    const last = actions[actions.length - 1];
    set({ actions: actions.slice(0, -1) });
    return last;
  },
  clear: () => set({ actions: [] }),
}));
```

## Best Practices

### 1. Use Selectors

Subscribe to specific state slices to prevent unnecessary re-renders:

```typescript
// BAD - re-renders on any store change
const { value, count } = useMyStore();

// GOOD - only re-renders when value changes
const value = useMyStore((s) => s.value);
```

### 2. Separate State and Actions

```typescript
// Access state
const theme = useSettingsStore((s) => s.theme);

// Access action (stable reference, no re-render)
const setTheme = useSettingsStore((s) => s.setTheme);
```

### 3. Use Immer for Complex Updates

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const useStore = create<State>()(
  immer((set) => ({
    nested: { deep: { value: 1 } },
    updateValue: (v) =>
      set((state) => {
        state.nested.deep.value = v;
      }),
  }))
);
```

### 4. Persist Only What's Needed

```typescript
persist(
  (set) => ({ /* ... */ }),
  {
    name: 'my-store',
    partialize: (state) => ({
      // Only persist these fields
      theme: state.theme,
      preferences: state.preferences,
      // Don't persist:
      // - isLoading (transient)
      // - error (transient)
      // - modalOpen (UI state)
    }),
  }
);
```

### 5. Clear Actions for Cleanup

Provide reset/clear actions for cleanup:

```typescript
interface Store {
  data: Data[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  setData: (data: Data[]) => void;
  setError: (error: Error) => void;
  reset: () => void; // Reset to initial state
}
```

## Testing Stores

```typescript
import { act } from '@testing-library/react';
import { useMyStore } from './my-store';

describe('myStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useMyStore.setState({ value: '', count: 0 });
  });

  it('increments count', () => {
    const { increment } = useMyStore.getState();

    act(() => {
      increment();
    });

    expect(useMyStore.getState().count).toBe(1);
  });
});
```

## Files to Reference

- tRPC client (server state): `src/lib/trpc.ts`
- Module stores: `src/modules/*/stores/`
- Settings page: `src/pages/Settings.tsx`
