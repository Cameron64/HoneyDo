# Shared Constants - Claude Code Instructions

> Application-wide constants shared between API and frontend

## Overview

This directory contains constants that are:
- **Shared across apps**: Used by both `@honeydo/api` and `@honeydo/web`
- **Type-safe**: Include TypeScript types derived from the constants
- **Used by Zod schemas**: Category and unit enums build from these
- **Used by UI**: Icons and display names for dropdowns/labels

## Directory Structure

```
packages/shared/src/constants/
├── CLAUDE.md           # This file
├── index.ts            # Re-exports all constants
└── categories.ts       # Shopping categories and units
```

## Shopping Categories (`categories.ts`)

### SHOPPING_CATEGORIES

Array of category definitions with store-order sorting:

```typescript
export const SHOPPING_CATEGORIES = [
  { id: 'produce', name: 'Produce', icon: 'Apple', order: 1 },
  { id: 'bakery', name: 'Bakery', icon: 'Croissant', order: 2 },
  { id: 'deli', name: 'Deli', icon: 'Sandwich', order: 3 },
  { id: 'meat', name: 'Meat & Seafood', icon: 'Beef', order: 4 },
  { id: 'dairy', name: 'Dairy', icon: 'Milk', order: 5 },
  { id: 'frozen', name: 'Frozen', icon: 'Snowflake', order: 6 },
  { id: 'pantry', name: 'Pantry', icon: 'Package', order: 7 },
  { id: 'snacks', name: 'Snacks', icon: 'Cookie', order: 8 },
  { id: 'beverages', name: 'Beverages', icon: 'GlassWater', order: 9 },
  { id: 'household', name: 'Household', icon: 'Home', order: 10 },
  { id: 'personal', name: 'Personal Care', icon: 'Heart', order: 11 },
  { id: 'other', name: 'Other', icon: 'ShoppingBasket', order: 12 },
] as const;
```

### ShoppingCategoryId Type

Type-safe category IDs:

```typescript
export type ShoppingCategoryId = (typeof SHOPPING_CATEGORIES)[number]['id'];
// Results in: 'produce' | 'bakery' | 'deli' | 'meat' | 'dairy' | 'frozen' | 'pantry' | 'snacks' | 'beverages' | 'household' | 'personal' | 'other'
```

### CATEGORY_MAP

Lookup map for quick access:

```typescript
export const CATEGORY_MAP = Object.fromEntries(
  SHOPPING_CATEGORIES.map((cat) => [cat.id, cat])
) as Record<ShoppingCategoryId, (typeof SHOPPING_CATEGORIES)[number]>;

// Usage:
const category = CATEGORY_MAP['produce'];
// { id: 'produce', name: 'Produce', icon: 'Apple', order: 1 }
```

### DEFAULT_CATEGORY

Fallback category for uncategorized items:

```typescript
export const DEFAULT_CATEGORY: ShoppingCategoryId = 'other';
```

### QUANTITY_UNITS

Common measurement units:

```typescript
export const QUANTITY_UNITS = [
  'each',
  'lb',
  'oz',
  'kg',
  'g',
  'gallon',
  'quart',
  'liter',
  'ml',
  'dozen',
  'pack',
  'bag',
  'box',
  'can',
  'jar',
  'bottle',
  'bunch',
  'head',
  'loaf',
] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
```

## Usage Examples

### In Zod Schemas

```typescript
// packages/shared/src/schemas/shopping.ts
import { SHOPPING_CATEGORIES, type ShoppingCategoryId } from '../constants/categories';

// Build enum schema from constants
const categoryIds = SHOPPING_CATEGORIES.map((c) => c.id) as unknown as readonly [ShoppingCategoryId, ...ShoppingCategoryId[]];
export const shoppingCategorySchema = z.enum(categoryIds);
```

### In Database Schema

```typescript
// apps/api/src/db/schema/shopping.ts
import type { ShoppingCategoryId } from '@honeydo/shared';

category: text('category').$type<ShoppingCategoryId>(),
```

### In React Components

```typescript
// Category dropdown
import { SHOPPING_CATEGORIES, CATEGORY_MAP, type ShoppingCategoryId } from '@honeydo/shared';
import { Apple, Croissant, Sandwich, Beef, Milk, Snowflake, Package, Cookie, GlassWater, Home, Heart, ShoppingBasket } from 'lucide-react';

// Icon mapping
const CATEGORY_ICONS: Record<string, React.ComponentType> = {
  Apple, Croissant, Sandwich, Beef, Milk, Snowflake,
  Package, Cookie, GlassWater, Home, Heart, ShoppingBasket,
};

function CategorySelect({ value, onChange }: CategorySelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {SHOPPING_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon];
          return (
            <SelectItem key={cat.id} value={cat.id}>
              <div className="flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4" />}
                {cat.name}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
```

### In Category Grouping

```typescript
// Group items by category in store order
import { SHOPPING_CATEGORIES, type ShoppingCategoryId } from '@honeydo/shared';

function groupByCategory(items: ShoppingItem[]) {
  const byCategory = new Map<ShoppingCategoryId, ShoppingItem[]>();

  // Initialize in store order
  SHOPPING_CATEGORIES.forEach((cat) => {
    byCategory.set(cat.id, []);
  });

  // Distribute items
  items.forEach((item) => {
    const category = item.category ?? 'other';
    byCategory.get(category)?.push(item);
  });

  // Remove empty categories
  byCategory.forEach((items, key) => {
    if (items.length === 0) byCategory.delete(key);
  });

  return byCategory;
}
```

### In AI Categorization

```typescript
// apps/api/src/modules/shopping/ai.router.ts
import { SHOPPING_CATEGORIES, type ShoppingCategoryId } from '@honeydo/shared';

// Build lookup for normalizing AI responses
const categoryNameToId: Record<string, ShoppingCategoryId> = {};
for (const cat of SHOPPING_CATEGORIES) {
  categoryNameToId[cat.name.toLowerCase()] = cat.id;
  categoryNameToId[cat.id] = cat.id;
}

function normalizeCategory(category: string | null): ShoppingCategoryId {
  if (!category) return 'other';
  const normalized = category.toLowerCase().trim();
  return categoryNameToId[normalized] ?? 'other';
}
```

## Adding New Constants

### 1. Add to Constants File

```typescript
// packages/shared/src/constants/new-feature.ts
export const NEW_FEATURE_OPTIONS = [
  { id: 'option1', name: 'Option 1', value: 10 },
  { id: 'option2', name: 'Option 2', value: 20 },
] as const;

export type NewFeatureOptionId = (typeof NEW_FEATURE_OPTIONS)[number]['id'];

export const OPTION_MAP = Object.fromEntries(
  NEW_FEATURE_OPTIONS.map((opt) => [opt.id, opt])
) as Record<NewFeatureOptionId, (typeof NEW_FEATURE_OPTIONS)[number]>;
```

### 2. Export from Index

```typescript
// packages/shared/src/constants/index.ts
export * from './categories';
export * from './new-feature';  // Add this
```

### 3. Use in Schemas

```typescript
// packages/shared/src/schemas/new-feature.ts
import { NEW_FEATURE_OPTIONS, type NewFeatureOptionId } from '../constants/new-feature';

const optionIds = NEW_FEATURE_OPTIONS.map((o) => o.id) as unknown as readonly [NewFeatureOptionId, ...NewFeatureOptionId[]];
export const newFeatureOptionSchema = z.enum(optionIds);
```

## Icon Mapping

Icons use Lucide React names. Map icons in the frontend:

```typescript
// Centralized icon mapping
import * as Icons from 'lucide-react';

export function getCategoryIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return (Icons as Record<string, React.ComponentType>)[iconName] ?? Icons.ShoppingBasket;
}

// Usage
const Icon = getCategoryIcon(category.icon);
<Icon className="h-4 w-4" />
```

## Files to Reference

- Schemas using constants: `packages/shared/src/schemas/shopping.ts`
- DB using types: `apps/api/src/db/schema/shopping.ts`
- Frontend using constants: `apps/web/src/modules/shopping/components/`
- AI using constants: `apps/api/src/modules/shopping/ai.router.ts`
