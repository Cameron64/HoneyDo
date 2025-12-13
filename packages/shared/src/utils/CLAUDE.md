# Shared Utilities - Claude Code Instructions

> Common utility functions used across API and Web apps

## Overview

The `utils/` directory contains pure utility functions that work in both Node.js (API) and browser (Web) environments. These are low-level helpers without React or framework dependencies.

## File Structure

```
packages/shared/src/utils/
├── CLAUDE.md     # This file
└── index.ts      # All utility exports
```

## Utility Categories

### JSON Parsing

Safe JSON parsing with error handling:

```typescript
import { safeJsonParse, parseJsonFromText, extractJsonFromText } from '@honeydo/shared/utils';

// Safe parse with result type
const result = safeJsonParse<MyType>(jsonString);
if (result.success) {
  console.log(result.data);  // Typed as MyType
} else {
  console.error(result.error);
}

// Extract JSON from text with markdown code fences
const json = extractJsonFromText('Some text ```json {"key": "value"}``` more text');
// Returns: '{"key": "value"}'

// Parse JSON from text containing other content
const result = parseJsonFromText<MyType>(responseText);
```

**Use Cases:**
- Parsing Claude's JSON responses (may include markdown)
- Handling API responses that might be malformed
- Graceful error handling without try/catch

### Date Utilities

Date manipulation in YYYY-MM-DD format:

```typescript
import {
  formatDateYMD,
  parseDateYMD,
  addDays,
  getNextNDays,
  isValidDateYMD,
} from '@honeydo/shared/utils';

// Format Date to string
formatDateYMD(new Date());  // '2024-01-15'

// Parse string to Date (local midnight)
parseDateYMD('2024-01-15');  // Date object

// Add days
addDays(new Date(), 7);  // One week from now

// Get date range
getNextNDays(7);  // { start: '2024-01-15', end: '2024-01-21' }

// Validate format
isValidDateYMD('2024-01-15');  // true
isValidDateYMD('01-15-2024');  // false
```

**Use Cases:**
- Meal planning date ranges
- Recipe scheduling
- API date parameters

### Math Utilities

Numeric helpers:

```typescript
import { lerp, clamp, roundTo } from '@honeydo/shared/utils';

// Linear interpolation
lerp(0, 100, 0.5);  // 50

// Clamp value to range
clamp(150, 0, 100);  // 100
clamp(-10, 0, 100);  // 0

// Round to decimal places
roundTo(3.14159, 2);  // 3.14
```

**Use Cases:**
- Progress calculations
- Animation values
- UI slider bounds

### Error Extraction

User-friendly error messages:

```typescript
import { extractFriendlyError } from '@honeydo/shared/utils';

// Extract readable error
const message = extractFriendlyError(
  'Error: Credit balance is too low for model xyz',
  'Something went wrong'
);
// Returns: 'Credit balance is too low. Please add credits to your Claude account.'

// Falls back to default if no pattern matches
extractFriendlyError('Unknown error xyz', 'Try again');
// Returns: 'Try again'
```

**Known Error Patterns:**
- Credit balance issues
- Timeouts
- CLI not found
- Rate limits

### String Utilities

Text manipulation:

```typescript
import { normalizeString, singularize, pluralize } from '@honeydo/shared/utils';

// Normalize for comparison
normalizeString('  Hello   World  ');  // 'hello world'

// Singularize words
singularize('apples');    // 'apple'
singularize('berries');   // 'berry'
singularize('tomatoes');  // 'tomato'

// Pluralize words
pluralize('apple', 1);  // 'apple'
pluralize('apple', 2);  // 'apples'
pluralize('berry', 3);  // 'berries'
```

**Use Cases:**
- Ingredient normalization
- Shopping list aggregation
- Display formatting

## Usage

### In API

```typescript
import { parseJsonFromText, formatDateYMD } from '@honeydo/shared/utils';

// Parse Claude response
const result = parseJsonFromText<SkillOutput>(claudeResponse);
if (result.success) {
  // Store suggestions
}

// Format date for database
const dateStr = formatDateYMD(new Date());
```

### In Web

```typescript
import { getNextNDays, clamp } from '@honeydo/shared/utils';

// Get default date range for picker
const defaultRange = getNextNDays(7);

// Clamp slider value
const bounded = clamp(value, 0, 100);
```

## Adding New Utilities

When adding utilities:

### 1. Check Environment Compatibility

Utilities must work in both Node.js and browsers:

```typescript
// Good - works everywhere
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Bad - Node.js only
import fs from 'fs';
export function readFile(path: string) {
  return fs.readFileSync(path);  // Won't work in browser
}
```

### 2. Keep Functions Pure

```typescript
// Good - pure function
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Avoid - side effects
let counter = 0;
export function getNextId(): number {
  return ++counter;  // Shared mutable state
}
```

### 3. Add Type Safety

```typescript
// Good - typed result
export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function safeJsonParse<T>(text: string): JsonParseResult<T> {
  // ...
}
```

### 4. Export from index.ts

```typescript
// utils/index.ts
export { myNewUtil } from './my-new-util';
// or add directly to index.ts if small
```

## Related Files

- Main export: `../index.ts`
- Types: `../types/`
- Schemas (for validation): `../schemas/`
