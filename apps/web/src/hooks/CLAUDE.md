# HoneyDo Web Hooks - Claude Code Instructions

> Shared custom React hooks for the web app

## Overview

This directory contains reusable React hooks that are used across multiple modules. Module-specific hooks should live in their respective module directories.

## Directory Structure

```
apps/web/src/hooks/
├── CLAUDE.md              # This file
├── use-media-query.ts     # Responsive breakpoint detection
├── use-swipe-gesture.ts   # Touch swipe detection
└── use-long-press.ts      # Long press gesture detection
```

## Available Hooks

### useMediaQuery

Detects if a CSS media query matches. Used for responsive behavior.

```typescript
import { useMediaQuery } from '@/hooks/use-media-query';

function MyComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

**Parameters:**
- `query: string` - CSS media query string

**Returns:**
- `boolean` - Whether the media query matches

### useSwipeGesture

Detects horizontal and vertical swipe gestures on touch devices.

```typescript
import { useSwipeGesture } from '@/hooks/use-swipe-gesture';

function MyComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useSwipeGesture(containerRef, {
    onSwipeLeft: () => navigate('next'),
    onSwipeRight: () => navigate('prev'),
    onSwipeUp: () => closeSheet(),
    threshold: 50,  // Minimum distance in pixels
  });

  return <div ref={containerRef}>Swipeable content</div>;
}
```

**Parameters:**
- `ref: RefObject<HTMLElement>` - Reference to the swipeable element
- `options: SwipeOptions` - Configuration object

**Options:**
```typescript
interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;      // Default: 50px
  preventScroll?: boolean; // Prevent vertical scroll during horizontal swipe
}
```

### useLongPress

Detects long press gestures for contextual actions.

```typescript
import { useLongPress } from '@/hooks/use-long-press';

function MyComponent() {
  const longPressProps = useLongPress({
    onLongPress: () => openContextMenu(),
    onClick: () => selectItem(),
    delay: 500,  // ms before triggering
  });

  return <div {...longPressProps}>Press and hold me</div>;
}
```

**Parameters:**
```typescript
interface LongPressOptions {
  onLongPress: () => void;   // Called after delay
  onClick?: () => void;       // Called on quick tap
  delay?: number;             // Default: 500ms
  disabled?: boolean;         // Disable the gesture
}
```

**Returns:**
```typescript
{
  onMouseDown: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
  onMouseLeave: (e: MouseEvent) => void;
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}
```

## Writing New Hooks

### Hook Naming Convention

- File: `use-kebab-case.ts`
- Export: `useKebabCase`

### Hook Template

```typescript
// use-my-hook.ts
import { useState, useEffect, useCallback } from 'react';

interface UseMyHookOptions {
  option1: string;
  option2?: number;
}

interface UseMyHookReturn {
  value: string;
  setValue: (v: string) => void;
  isLoading: boolean;
}

export function useMyHook(options: UseMyHookOptions): UseMyHookReturn {
  const { option1, option2 = 10 } = options;
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Effect logic
  }, [option1, option2]);

  const handleSetValue = useCallback((v: string) => {
    setValue(v);
  }, []);

  return {
    value,
    setValue: handleSetValue,
    isLoading,
  };
}
```

### Best Practices

1. **Single Responsibility**: Each hook should do one thing well
2. **Memoization**: Use `useMemo` and `useCallback` to prevent unnecessary re-renders
3. **Cleanup**: Always return cleanup functions from effects
4. **TypeScript**: Export types for options and return values
5. **Default Values**: Provide sensible defaults for optional parameters

## Module-Specific Hooks

Hooks that are specific to a feature should live in the module directory:

| Hook | Location | Purpose |
|------|----------|---------|
| `useShoppingSync` | `modules/shopping/hooks/` | Shopping WebSocket sync |
| `useRecipesSync` | `modules/recipes/hooks/` | Recipes WebSocket sync |
| `useHomeSync` | `modules/home/hooks/` | Home Automation sync |

Example module-specific hook location:
```
src/modules/shopping/hooks/
├── index.ts
├── use-shopping-sync.ts
└── use-shopping-actions.ts
```

## Common Patterns

### Debounced Value

```typescript
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

### Window Event

```typescript
import { useState, useEffect } from 'react';

export function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}
```

### Local Storage

```typescript
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```

## Files to Reference

- Socket hooks: `src/services/socket/hooks.ts`
- Module sync hooks: `src/modules/*/hooks/`
- tRPC client: `src/lib/trpc.ts`
