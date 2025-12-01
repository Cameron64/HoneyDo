# Feature 1.5: Frontend Shell

> The app skeleton. Layout, routing, and core components.

## Overview

This feature builds the frontend application shell - the persistent UI structure that all modules will live inside. It includes the navigation, layout system, base components from shadcn/ui, and routing infrastructure.

## Acceptance Criteria

- [ ] App layout with header and navigation
- [ ] Responsive design (mobile bottom nav, desktop sidebar)
- [ ] Routing with protected routes
- [ ] Base shadcn/ui components installed
- [ ] Tailwind configured with custom theme
- [ ] Loading states and error boundaries
- [ ] 404 page
- [ ] Module placeholder slots

## Technical Details

### Tech Stack

- **Routing**: TanStack Router (type-safe, file-based option)
- **UI Components**: shadcn/ui (Radix + Tailwind)
- **Icons**: Lucide React
- **Styling**: Tailwind CSS

### Installation

```bash
# TanStack Router
pnpm add @tanstack/react-router --filter @honeydo/web

# Tailwind & shadcn dependencies
pnpm add tailwindcss postcss autoprefixer class-variance-authority clsx tailwind-merge --filter @honeydo/web
pnpm add lucide-react --filter @honeydo/web

# Radix primitives (installed by shadcn as needed)
pnpm add @radix-ui/react-slot @radix-ui/react-dialog --filter @honeydo/web
```

### Directory Structure

```
apps/web/src/
├── main.tsx                    # Entry point
├── app/
│   ├── routes/
│   │   ├── __root.tsx         # Root layout
│   │   ├── index.tsx          # Home page
│   │   ├── settings.tsx       # Settings page
│   │   └── _authenticated/    # Protected routes group
│   │       └── ...
│   └── router.tsx             # Router configuration
├── components/
│   ├── ui/                    # shadcn components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── AppShell.tsx       # Main layout wrapper
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── BottomNav.tsx
│   │   └── ModuleContainer.tsx
│   ├── common/
│   │   ├── LoadingSpinner.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── EmptyState.tsx
│   └── auth/
│       ├── ProtectedRoute.tsx
│       └── UserButton.tsx
├── hooks/
│   ├── useMediaQuery.ts
│   └── useModules.ts
├── lib/
│   ├── utils.ts               # cn() helper
│   └── trpc.ts
├── styles/
│   └── globals.css            # Tailwind imports
└── stores/
    └── ui.ts                  # UI state (sidebar open, etc.)
```

### Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Custom brand colors
        honey: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // shadcn color tokens
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

### Global CSS

```css
/* apps/web/src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 38 92% 50%;
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 38 92% 50%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 38 92% 50%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 38 92% 50%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### App Shell Component

```tsx
// apps/web/src/components/layout/AppShell.tsx
import { Outlet } from '@tanstack/react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export function AppShell() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {isDesktop && <Sidebar />}

        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <div className="container mx-auto max-w-4xl p-4">
            <Outlet />
          </div>
        </main>
      </div>

      {!isDesktop && <BottomNav />}
    </div>
  );
}
```

### Header Component

```tsx
// apps/web/src/components/layout/Header.tsx
import { UserButton } from '../auth/UserButton';
import { ThemeToggle } from '../common/ThemeToggle';

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">HoneyDo</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
```

### Bottom Navigation (Mobile)

```tsx
// apps/web/src/components/layout/BottomNav.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { Home, ShoppingCart, Utensils, Home as HomeIcon, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { to: '/recipes', icon: Utensils, label: 'Recipes' },
  { to: '/home-automation', icon: HomeIcon, label: 'Home' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNav() {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="flex h-16 items-center justify-around">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = currentPath === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 p-2 text-xs',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

### Sidebar (Desktop)

```tsx
// apps/web/src/components/layout/Sidebar.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { Home, ShoppingCart, Utensils, Home as HomeIcon, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping List' },
  { to: '/recipes', icon: Utensils, label: 'Recipes' },
  { to: '/home-automation', icon: HomeIcon, label: 'Home' },
];

export function Sidebar() {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  return (
    <aside className="w-64 border-r bg-card">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = currentPath === to ||
            (to !== '/' && currentPath.startsWith(to));

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <Link
          to="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
```

### Loading Spinner

```tsx
// apps/web/src/components/common/LoadingSpinner.tsx
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
```

### Error Boundary

```tsx
// apps/web/src/components/common/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { Button } from '../ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 404 Page

```tsx
// apps/web/src/app/routes/404.tsx
import { Link } from '@tanstack/react-router';
import { Button } from '../../components/ui/button';
import { Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-muted-foreground">Page not found</p>
      <Button asChild>
        <Link to="/">
          <Home className="mr-2 h-4 w-4" />
          Go home
        </Link>
      </Button>
    </div>
  );
}
```

## Implementation Steps

1. **Install Dependencies**
   - TanStack Router
   - Tailwind + dependencies
   - Lucide icons

2. **Configure Tailwind**
   - Create tailwind.config.ts
   - Add globals.css with CSS variables
   - Configure PostCSS

3. **Initialize shadcn**
   - Run shadcn-ui init
   - Install base components: button, card, input, dialog

4. **Create Utils**
   - cn() helper function
   - useMediaQuery hook

5. **Build Layout Components**
   - AppShell (main wrapper)
   - Header
   - Sidebar (desktop)
   - BottomNav (mobile)

6. **Set Up Routing**
   - Configure TanStack Router
   - Create route tree
   - Add protected route wrapper

7. **Create Common Components**
   - LoadingSpinner
   - ErrorBoundary
   - EmptyState

8. **Create Pages**
   - Home (placeholder)
   - Settings (placeholder)
   - 404

9. **Add Theme Support**
   - ThemeToggle component
   - Dark mode CSS variables
   - System preference detection

10. **Test Responsive**
    - Mobile bottom nav
    - Desktop sidebar
    - Breakpoint transitions

## shadcn Components to Install

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input label dialog dropdown-menu avatar badge separator skeleton toast
```

## Definition of Done

- [ ] App renders without errors
- [ ] Navigation works on all routes
- [ ] Layout is responsive (mobile/desktop)
- [ ] Protected routes redirect properly
- [ ] Dark mode toggles correctly
- [ ] 404 page shows for unknown routes
- [ ] Loading states display during data fetch
- [ ] Error boundary catches component errors
- [ ] All shadcn base components available

## Dependencies

- Feature 1.1 (Project Setup) - complete
- Feature 1.2 (Authentication) - for protected routes
- Feature 1.4 (API Foundation) - for tRPC integration

## Notes

- Navigation items can be dynamically filtered based on enabled modules
- Consider lazy loading module routes for code splitting
- Theme preference should persist (localStorage + server sync)
