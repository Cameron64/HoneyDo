# Feature: Preferences System

## Overview

The preferences system stores all user meal preferences that the external Claude Code skill uses to generate personalized suggestions. It supports three types of preferences:

1. **Fixed Preferences** - Structured constraints (cuisine frequencies, time limits, effort levels)
2. **Ingredient Preferences** - Love/hate lists for specific ingredients
3. **Freeform Notes** - Natural language rules, observations, and seasonal preferences

All preferences are exportable as a structured JSON payload for the skill.

## User Stories

- As a user, I want to set how often I want each cuisine type so suggestions match my variety preferences
- As a user, I want to set max cook times for weeknights vs weekends
- As a user, I want to specify dietary restrictions (allergies, vegetarian nights, etc.)
- As a user, I want to mark ingredients I love or hate
- As a user, I want to add freeform notes like "we love garlic" or "Tuesdays are busy"
- As a user, I want to export all my preferences for the AI skill

## Acceptance Criteria

- [ ] Can view and edit fixed preferences (cuisine, time, effort)
- [ ] Can add/edit/remove dietary restrictions
- [ ] Can search and add ingredient preferences with love-to-never scale
- [ ] Can add notes with type classification (general, ingredient, rule, seasonal)
- [ ] Can toggle notes active/inactive
- [ ] Can export all preferences as JSON
- [ ] Settings persist across sessions
- [ ] Mobile-friendly preference editing

---

## Technical Details

### Data Model

```typescript
// apps/api/src/db/schema/recipes.ts

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { nanoid } from 'nanoid';

// Fixed meal preferences (one per user)
export const mealPreferences = sqliteTable('meal_preferences', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Cuisine preferences: { "italian": { "maxPerBatch": 2, "preference": "love" }, ... }
  cuisinePreferences: text('cuisine_preferences', { mode: 'json' }).$type<CuisinePreferences>(),

  // Dietary restrictions: ["no-shellfish", "low-sodium"]
  dietaryRestrictions: text('dietary_restrictions', { mode: 'json' }).$type<string[]>(),

  // Time constraints (minutes)
  quickMealMaxMinutes: integer('quick_meal_max_minutes').notNull().default(30),
  standardMealMaxMinutes: integer('standard_meal_max_minutes').notNull().default(60),

  // Effort level (1-5)
  defaultMaxEffort: integer('default_max_effort').notNull().default(3),

  // Default servings
  defaultServings: integer('default_servings').notNull().default(2),

  // Default batch size
  defaultBatchSize: integer('default_batch_size').notNull().default(5),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  userIdx: index('idx_meal_preferences_user').on(table.userId),
}));

// Ingredient-level preferences
// NOTE: source field tracks if this was manually set or learned from rejection feedback
export const ingredientPreferences = sqliteTable('ingredient_preferences', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ingredient: text('ingredient').notNull(),
  preference: text('preference').notNull().$type<'love' | 'like' | 'neutral' | 'dislike' | 'never'>(),
  notes: text('notes'),
  source: text('source').notNull().default('manual').$type<'manual' | 'rejection_feedback'>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  userIngredientIdx: index('idx_ingredient_prefs_user_ing').on(table.userId, table.ingredient),
}));

// Freeform preference notes
// NOTE: source field tracks if this was manually set or learned from rejection feedback
export const mealPreferenceNotes = sqliteTable('meal_preference_notes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteType: text('note_type').notNull().$type<'general' | 'ingredient' | 'rule' | 'seasonal'>(),
  content: text('content').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  source: text('source').notNull().default('manual').$type<'manual' | 'rejection_feedback'>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  userIdx: index('idx_meal_pref_notes_user').on(table.userId),
}));

// Types
interface CuisinePreferences {
  [cuisine: string]: {
    maxPerBatch: number;
    preference: 'love' | 'like' | 'neutral' | 'avoid';
  };
}
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/preferences.ts

import { router, protectedProcedure } from '../../../trpc';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { mealPreferences, ingredientPreferences, mealPreferenceNotes } from '../../../db/schema';

const cuisinePreferencesSchema = z.record(z.object({
  maxPerBatch: z.number().min(0).max(10),
  preference: z.enum(['love', 'like', 'neutral', 'avoid']),
}));

const updatePreferencesSchema = z.object({
  cuisinePreferences: cuisinePreferencesSchema.optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  quickMealMaxMinutes: z.number().min(10).max(60).optional(),
  standardMealMaxMinutes: z.number().min(15).max(180).optional(),
  defaultMaxEffort: z.number().min(1).max(5).optional(),
  defaultServings: z.number().min(1).max(12).optional(),
  defaultBatchSize: z.number().min(1).max(10).optional(),
});

const setIngredientPrefSchema = z.object({
  ingredient: z.string().min(1).max(100),
  preference: z.enum(['love', 'like', 'neutral', 'dislike', 'never']),
  notes: z.string().max(500).optional(),
});

const addNoteSchema = z.object({
  noteType: z.enum(['general', 'ingredient', 'rule', 'seasonal']),
  content: z.string().min(1).max(1000),
});

const updateNoteSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const preferencesRouter = router({
  // Get fixed preferences (creates default if none exist)
  get: protectedProcedure.query(async ({ ctx }) => {
    let prefs = await ctx.db.query.mealPreferences.findFirst({
      where: eq(mealPreferences.userId, ctx.userId),
    });

    if (!prefs) {
      // Create default preferences
      const [created] = await ctx.db.insert(mealPreferences)
        .values({
          userId: ctx.userId,
          cuisinePreferences: {},
          dietaryRestrictions: [],
        })
        .returning();
      prefs = created;
    }

    return prefs;
  }),

  // Update fixed preferences
  update: protectedProcedure
    .input(updatePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(mealPreferences)
        .set({
          ...input,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(mealPreferences.userId, ctx.userId))
        .returning();

      return updated;
    }),

  // Ingredient preferences
  getIngredients: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.ingredientPreferences.findMany({
      where: eq(ingredientPreferences.userId, ctx.userId),
      orderBy: (prefs, { asc }) => [asc(prefs.ingredient)],
    });
  }),

  setIngredient: protectedProcedure
    .input(setIngredientPrefSchema)
    .mutation(async ({ ctx, input }) => {
      // Upsert - update if exists, insert if not
      const existing = await ctx.db.query.ingredientPreferences.findFirst({
        where: (prefs, { and, eq }) => and(
          eq(prefs.userId, ctx.userId),
          eq(prefs.ingredient, input.ingredient.toLowerCase()),
        ),
      });

      if (existing) {
        const [updated] = await ctx.db.update(ingredientPreferences)
          .set({
            preference: input.preference,
            notes: input.notes,
          })
          .where(eq(ingredientPreferences.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await ctx.db.insert(ingredientPreferences)
        .values({
          userId: ctx.userId,
          ingredient: input.ingredient.toLowerCase(),
          preference: input.preference,
          notes: input.notes,
        })
        .returning();
      return created;
    }),

  removeIngredient: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(ingredientPreferences)
        .where(eq(ingredientPreferences.id, input));
      return { success: true };
    }),

  // Freeform notes
  getNotes: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.mealPreferenceNotes.findMany({
      where: eq(mealPreferenceNotes.userId, ctx.userId),
      orderBy: (notes, { desc }) => [desc(notes.createdAt)],
    });
  }),

  addNote: protectedProcedure
    .input(addNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(mealPreferenceNotes)
        .values({
          userId: ctx.userId,
          noteType: input.noteType,
          content: input.content,
        })
        .returning();
      return created;
    }),

  updateNote: protectedProcedure
    .input(updateNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(mealPreferenceNotes)
        .set({
          content: input.content,
          isActive: input.isActive,
        })
        .where(eq(mealPreferenceNotes.id, input.id))
        .returning();
      return updated;
    }),

  deleteNote: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(mealPreferenceNotes)
        .where(eq(mealPreferenceNotes.id, input));
      return { success: true };
    }),

  // Export all preferences (for skill consumption)
  exportAll: protectedProcedure.query(async ({ ctx }) => {
    const [prefs, ingredients, notes] = await Promise.all([
      ctx.db.query.mealPreferences.findFirst({
        where: eq(mealPreferences.userId, ctx.userId),
      }),
      ctx.db.query.ingredientPreferences.findMany({
        where: eq(ingredientPreferences.userId, ctx.userId),
      }),
      ctx.db.query.mealPreferenceNotes.findMany({
        where: (n, { and, eq }) => and(
          eq(n.userId, ctx.userId),
          eq(n.isActive, true),
        ),
      }),
    ]);

    return {
      preferences: {
        cuisinePreferences: prefs?.cuisinePreferences ?? {},
        dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
        quickMealMaxMinutes: prefs?.quickMealMaxMinutes ?? 30,
        standardMealMaxMinutes: prefs?.standardMealMaxMinutes ?? 60,
        defaultMaxEffort: prefs?.defaultMaxEffort ?? 3,
        defaultBatchSize: prefs?.defaultBatchSize ?? 5,
      },
      ingredientPreferences: ingredients.map((i) => ({
        ingredient: i.ingredient,
        preference: i.preference,
        notes: i.notes,
        source: i.source,  // Include source for UI badge
      })),
      notes: notes.map((n) => ({
        type: n.noteType,
        content: n.content,
        source: n.source,  // Include source for UI badge
      })),
    };
  }),
});
```

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `PreferencesPage` | Main container with tabbed sections |
| `CuisinePreferences` | Cuisine frequency and preference settings |
| `CuisineRow` | Individual cuisine with slider and preference toggle |
| `TimeConstraints` | Weeknight/weekend time and effort settings |
| `DietaryRestrictions` | Chip-based restriction management |
| `IngredientPreferences` | Searchable ingredient love/hate list |
| `IngredientRow` | Single ingredient with preference dropdown and notes |
| `FreeformNotes` | Note cards with type badges |
| `NoteCard` | Editable note with toggle and delete |
| `AddNoteDialog` | Modal for creating new notes |
| `SourceBadge` | Shows "Learned" badge for rejection-sourced preferences |
| `BatchSettings` | Default batch size configuration |

### Component Example

```typescript
// apps/web/src/modules/recipes/components/IngredientPreferences.tsx

import { useState } from 'react';
import { trpc } from '@/services/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PREFERENCE_OPTIONS = [
  { value: 'love', label: 'Love it', color: 'text-green-600' },
  { value: 'like', label: 'Like', color: 'text-green-400' },
  { value: 'neutral', label: 'Neutral', color: 'text-gray-500' },
  { value: 'dislike', label: 'Dislike', color: 'text-orange-500' },
  { value: 'never', label: 'Never', color: 'text-red-600' },
] as const;

export function IngredientPreferences() {
  const [newIngredient, setNewIngredient] = useState('');

  const { data: ingredients } = trpc.recipes.preferences.getIngredients.useQuery();
  const utils = trpc.useUtils();

  const setIngredient = trpc.recipes.preferences.setIngredient.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getIngredients.invalidate();
      setNewIngredient('');
    },
  });

  const removeIngredient = trpc.recipes.preferences.removeIngredient.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getIngredients.invalidate();
    },
  });

  const handleAdd = () => {
    if (!newIngredient.trim()) return;
    setIngredient.mutate({
      ingredient: newIngredient.trim(),
      preference: 'neutral',
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Ingredient Preferences</h3>

      {/* Add new ingredient */}
      <div className="flex gap-2">
        <Input
          placeholder="Add ingredient..."
          value={newIngredient}
          onChange={(e) => setNewIngredient(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newIngredient.trim()}>
          Add
        </Button>
      </div>

      {/* Ingredient list */}
      <div className="space-y-2">
        {ingredients?.map((ing) => (
          <div key={ing.id} className="flex items-center gap-2 p-2 rounded border">
            <span className="flex-1 capitalize">{ing.ingredient}</span>

            <Select
              value={ing.preference}
              onValueChange={(value) =>
                setIngredient.mutate({
                  ingredient: ing.ingredient,
                  preference: value as any,
                  notes: ing.notes ?? undefined,
                })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREFERENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className={opt.color}>{opt.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeIngredient.mutate(ing.id)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## UI Sections

### Cuisine Preferences

Display common cuisines with:
- Frequency slider (0-7 per week)
- Preference toggle (love/like/neutral/avoid)
- "Add custom cuisine" option

```typescript
const DEFAULT_CUISINES = [
  'Italian', 'Mexican', 'Asian', 'Mediterranean', 'American',
  'Indian', 'Thai', 'Japanese', 'Greek', 'French',
];
```

### Time & Effort Constraints

Two rows (quick meal / standard meal) with:
- Quick meal time slider (10 min - 60 min) - used for audibles and "fast" requests
- Standard meal time slider (15 min - 3 hours)
- Default effort level (1-5 stars or slider)
- Default batch size (1-10 recipes)

### Dietary Restrictions

Chip-based selection with common options plus custom entry:
- Vegetarian
- Vegan
- Gluten-free
- Dairy-free
- Low-sodium
- No shellfish
- No nuts
- Custom...

### Freeform Notes

Cards with:
- Type badge (General, Ingredient, Rule, Seasonal)
- Source badge (shows "Learned" for rejection-sourced preferences)
- Content text
- Active toggle
- Edit/Delete buttons

### Source Tracking

When preferences are created from rejection feedback:
- `source` field is set to `'rejection_feedback'`
- UI shows a "Learned" badge next to the preference
- User can edit/delete learned preferences like any other

---

## Edge Cases

- **No preferences yet**: Show sensible defaults, don't require setup
- **Duplicate ingredient**: Upsert (update existing)
- **Empty cuisine preferences**: Treat as "any frequency is fine"
- **Conflicting rules**: Display all, let skill resolve (it's AI)

---

## Testing

- Unit: Preference CRUD operations
- Unit: Export format validation
- Integration: Preference persistence across sessions
- E2E: Full preference editing flow
