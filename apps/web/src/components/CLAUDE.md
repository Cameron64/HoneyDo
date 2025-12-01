# HoneyDo Components - Claude Code Instructions

> React component patterns and organization

## Component Organization

```
apps/web/src/components/
├── CLAUDE.md           # This file
├── ui/                 # shadcn/ui primitives (don't modify)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dropdown-menu.tsx
│   └── ...
├── common/             # Shared, reusable components
│   ├── ErrorBoundary.tsx
│   ├── LoadingSpinner.tsx
│   ├── ConnectionStatus.tsx
│   └── ThemeToggle.tsx
├── layout/             # App shell and navigation
│   ├── AppShell.tsx
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── BottomNav.tsx
├── auth/               # Authentication components
│   ├── ProtectedRoute.tsx
│   └── UserButton.tsx
└── pwa/                # PWA-specific components
    ├── InstallPrompt.tsx
    └── OfflineIndicator.tsx
```

Module-specific components go in:
```
apps/web/src/modules/<module>/components/
```

## Component Categories

| Category | Location | Purpose |
|----------|----------|---------|
| **UI Primitives** | `components/ui/` | shadcn/ui components, don't modify directly |
| **Common** | `components/common/` | Reusable across all modules |
| **Layout** | `components/layout/` | App shell, navigation |
| **Auth** | `components/auth/` | Authentication UI |
| **PWA** | `components/pwa/` | Progressive Web App features |
| **Module** | `modules/<module>/components/` | Module-specific components |

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Component | `PascalCase.tsx` | `ShoppingList.tsx` |
| Hook | `use-kebab-case.ts` | `use-shopping-list.ts` |
| Types | `<component>.types.ts` | `ShoppingList.types.ts` |
| Tests | `<component>.test.tsx` | `ShoppingList.test.tsx` |

## Component Structure

### Basic Component

```typescript
// components/common/EmptyState.tsx
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 text-center',
      className
    )}>
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

### Component with Data Fetching

```typescript
// modules/shopping-list/components/ShoppingList.tsx
import { trpc } from '@/lib/trpc';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { ShoppingItem } from './ShoppingItem';
import { ShoppingListIcon } from 'lucide-react';

interface ShoppingListProps {
  listId: string;
}

export function ShoppingList({ listId }: ShoppingListProps) {
  const { data: list, isLoading, error } = trpc.shoppingList.getList.useQuery({ id: listId });

  if (isLoading) {
    return <LoadingSpinner className="mx-auto" />;
  }

  if (error) {
    return (
      <EmptyState
        title="Error loading list"
        description={error.message}
      />
    );
  }

  if (!list) {
    return (
      <EmptyState
        title="List not found"
        description="This shopping list doesn't exist or has been deleted."
      />
    );
  }

  if (list.items.length === 0) {
    return (
      <EmptyState
        title="No items yet"
        description="Add your first item to get started."
        icon={<ShoppingListIcon className="h-12 w-12" />}
      />
    );
  }

  return (
    <div className="space-y-2">
      {list.items.map((item) => (
        <ShoppingItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### Component with Local State

```typescript
// modules/shopping-list/components/AddItemForm.tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

interface AddItemFormProps {
  listId: string;
}

export function AddItemForm({ listId }: AddItemFormProps) {
  const [name, setName] = useState('');
  const utils = trpc.useUtils();

  const addItem = trpc.shoppingList.addItem.useMutation({
    onSuccess: () => {
      setName('');
      utils.shoppingList.getList.invalidate({ id: listId });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      addItem.mutate({ listId, name: name.trim() });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item..."
        disabled={addItem.isPending}
      />
      <Button type="submit" size="icon" disabled={!name.trim() || addItem.isPending}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}
```

### Component with Real-time Updates

```typescript
// modules/shopping-list/components/ShoppingListRealtime.tsx
import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocketEvent } from '@/services/socket/hooks';
import type { ShoppingItem } from '@honeydo/shared';

interface ShoppingListRealtimeProps {
  listId: string;
}

export function ShoppingListRealtime({ listId }: ShoppingListRealtimeProps) {
  const utils = trpc.useUtils();

  // Handle item added by other user
  const handleItemAdded = useCallback((item: ShoppingItem) => {
    if (item.listId === listId) {
      utils.shoppingList.getList.setData({ id: listId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: [...old.items, item],
        };
      });
    }
  }, [listId, utils]);

  // Handle item checked by other user
  const handleItemChecked = useCallback((data: { itemId: string; checked: boolean }) => {
    utils.shoppingList.getList.setData({ id: listId }, (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((item) =>
          item.id === data.itemId
            ? { ...item, checked: data.checked }
            : item
        ),
      };
    });
  }, [listId, utils]);

  useSocketEvent('shopping:item:added', handleItemAdded);
  useSocketEvent('shopping:item:checked', handleItemChecked);

  // ... rest of component
}
```

## Patterns

### Conditional Rendering

```typescript
// Using && for simple conditions
{isLoading && <LoadingSpinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// Using ternary for either/or
{isLoading ? <LoadingSpinner /> : <Content data={data} />}

// Using early returns (preferred for complex conditions)
if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return <EmptyState />;
return <Content data={data} />;
```

### Props Spreading

```typescript
// Common pattern for extending HTML elements
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(variants[variant], className)}
      {...props}
    />
  );
}
```

### Composition

```typescript
// Compound component pattern
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border bg-card', className)}>{children}</div>;
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="p-4 border-b">{children}</div>;
};

Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
};

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

### Render Props

```typescript
// For complex rendering logic
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}
```

## Styling

### Using cn() Helper

```typescript
import { cn } from '@/lib/utils';

// Merge classes conditionally
<div className={cn(
  // Base styles
  'rounded-lg p-4',
  // Conditional styles
  isActive && 'bg-primary text-primary-foreground',
  isDisabled && 'opacity-50 cursor-not-allowed',
  // Allow overrides via props
  className
)}>
```

### Responsive Design

Mobile-first approach:

```typescript
<div className="
  flex flex-col gap-2      {/* Base: mobile */}
  sm:flex-row sm:gap-4     {/* Small screens */}
  md:gap-6                 {/* Medium screens */}
  lg:gap-8                 {/* Large screens */}
">
```

### Dark Mode

Use CSS variables from Tailwind config:

```typescript
// These automatically switch in dark mode
<div className="bg-background text-foreground">
<div className="bg-card text-card-foreground">
<div className="bg-muted text-muted-foreground">
<div className="text-primary">
<div className="text-destructive">
```

## shadcn/ui Components

### Available Components

Currently installed:
- `badge` - Status badges
- `button` - Buttons with variants
- `card` - Container cards
- `checkbox` - Checkboxes
- `collapsible` - Collapsible sections
- `dialog` - Modal dialogs
- `dropdown-menu` - Dropdown menus
- `input` - Text inputs
- `label` - Form labels
- `select` - Select dropdowns
- `separator` - Visual separators
- `sheet` - Slide-out panels
- `slider` - Range sliders
- `switch` - Toggle switches
- `tabs` - Tabbed interfaces
- `textarea` - Multi-line text input

### Adding New Components

```bash
npx shadcn@latest add dialog
npx shadcn@latest add input
npx shadcn@latest add toast
npx shadcn@latest add tabs
```

### Button Variants

```typescript
import { Button } from '@/components/ui/button';

<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button variant="destructive">Destructive</Button>

<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

### Card Usage

```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

## Icons

Using Lucide React:

```typescript
import { ShoppingCart, Plus, Check, X, Settings, Home } from 'lucide-react';

<ShoppingCart className="h-4 w-4" />
<Plus className="h-5 w-5 text-muted-foreground" />
```

Common icons for HoneyDo:
- `ShoppingCart` - Shopping list
- `UtensilsCrossed` - Recipes
- `Home` - Home automation / Dashboard
- `Settings` - Settings
- `Plus`, `Minus` - Add/remove
- `Check`, `X` - Confirm/cancel
- `Pencil`, `Trash2` - Edit/delete

## Testing Components

```typescript
// components/common/__tests__/EmptyState.test.tsx
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No items" description="Add some items" />);
    expect(screen.getByText('Add some items')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No items"
        action={<button>Add Item</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });
});
```

## Component Checklist

When creating a new component:

- [ ] Clear, descriptive name
- [ ] TypeScript interface for props
- [ ] Accepts `className` for style overrides
- [ ] Uses `cn()` for class merging
- [ ] Mobile-first responsive design
- [ ] Dark mode compatible (CSS variables)
- [ ] Loading states handled
- [ ] Error states handled
- [ ] Empty states handled
- [ ] Accessible (keyboard navigation, ARIA)
- [ ] Exported from appropriate index file

## Files to Reference

- UI primitives: `components/ui/`
- Utils: `src/lib/utils.ts` (cn helper)
- Icons: https://lucide.dev/icons
- shadcn/ui docs: https://ui.shadcn.com
- TanStack Query patterns: `apps/web/CLAUDE.md`
