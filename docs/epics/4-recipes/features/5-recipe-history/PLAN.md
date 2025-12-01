# Feature: Recipe History

## Overview

Recipe History stores all completed recipes after they're cleared from a batch. This serves two purposes:
1. **Avoidance**: Recent history is sent to the skill to avoid suggesting meals you just had
2. **Reference**: Users can browse what they've cooked and view recipe details

This is a **NEW feature** - the original plan had no persistent history (recipes lived only in suggestions).

## User Stories

- As a user, I want to see all recipes I've completed
- As a user, I want to search my cooking history
- As a user, I want to view past recipe details
- As a user, I want the AI to avoid suggesting recent meals

## Acceptance Criteria

- [ ] Completed recipes added to history when batch clears
- [ ] History page with paginated list
- [ ] Search by recipe name
- [ ] Click to view full recipe details
- [ ] Recent history (14 days) sent to skill for avoidance
- [ ] Mobile-friendly list layout

---

## Technical Details

### Data Model

```typescript
// apps/api/src/db/schema/recipes.ts

// Recipe history (completed recipes, persisted after batch clears)
export const recipeHistory = sqliteTable('recipe_history', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  recipeName: text('recipe_name').notNull(),
  recipeData: text('recipe_data', { mode: 'json' }).notNull().$type<RecipeData>(),

  servingsCooked: integer('servings_cooked').notNull(),
  sourceBatchId: text('source_batch_id'),  // Which batch this came from

  cookedAt: text('cooked_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  userIdx: index('idx_recipe_history_user').on(table.userId),
  cookedAtIdx: index('idx_recipe_history_cooked').on(table.cookedAt),
  nameIdx: index('idx_recipe_history_name').on(table.recipeName),
}));
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/history.ts

import { router, protectedProcedure } from '../../../trpc';
import { z } from 'zod';
import { eq, and, gte, desc, like } from 'drizzle-orm';
import { recipeHistory } from '../../../db/schema';

export const historyRouter = router({
  // Get paginated history
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.recipeHistory.findMany({
        where: eq(recipeHistory.userId, ctx.userId),
        orderBy: desc(recipeHistory.cookedAt),
        limit: input.limit,
        offset: input.offset,
      });

      // Get total count for pagination
      const total = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(recipeHistory)
        .where(eq(recipeHistory.userId, ctx.userId));

      return {
        items,
        total: total[0]?.count ?? 0,
        hasMore: input.offset + items.length < (total[0]?.count ?? 0),
      };
    }),

  // Search history by name
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.recipeHistory.findMany({
        where: and(
          eq(recipeHistory.userId, ctx.userId),
          like(recipeHistory.recipeName, `%${input.query}%`),
        ),
        orderBy: desc(recipeHistory.cookedAt),
        limit: 20,
      });
    }),

  // Get recent history for skill avoidance
  getRecent: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(30).default(14) }))
    .query(async ({ ctx, input }) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);

      const items = await ctx.db.query.recipeHistory.findMany({
        where: and(
          eq(recipeHistory.userId, ctx.userId),
          gte(recipeHistory.cookedAt, cutoff.toISOString()),
        ),
        orderBy: desc(recipeHistory.cookedAt),
      });

      // Return just what the skill needs
      return items.map(item => {
        const data = item.recipeData as RecipeData;
        return {
          recipeName: item.recipeName,
          cuisine: data.cuisine,
          cookedAt: item.cookedAt,
        };
      });
    }),

  // Get single history item
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.recipeHistory.findFirst({
        where: and(
          eq(recipeHistory.id, input),
          eq(recipeHistory.userId, ctx.userId),
        ),
      });
    }),

  // Get stats
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const total = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(recipeHistory)
      .where(eq(recipeHistory.userId, ctx.userId));

    const thisMonth = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(recipeHistory)
      .where(and(
        eq(recipeHistory.userId, ctx.userId),
        gte(recipeHistory.cookedAt, sql`date('now', 'start of month')`),
      ));

    const cuisines = await ctx.db
      .select({
        cuisine: sql<string>`json_extract(recipe_data, '$.cuisine')`,
        count: sql<number>`count(*)`,
      })
      .from(recipeHistory)
      .where(eq(recipeHistory.userId, ctx.userId))
      .groupBy(sql`json_extract(recipe_data, '$.cuisine')`)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    return {
      totalCooked: total[0]?.count ?? 0,
      thisMonth: thisMonth[0]?.count ?? 0,
      topCuisines: cuisines,
    };
  }),
});
```

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `HistoryPage` | Main history container |
| `HistoryList` | Paginated list of history cards |
| `HistoryCard` | Single history item (name, date, cuisine) |
| `HistorySearch` | Search input |
| `HistoryDetail` | Full recipe view (same as RecipeDetailSheet) |
| `HistoryStats` | Quick stats (total cooked, top cuisines) |

### Component Implementation

```typescript
// apps/web/src/modules/recipes/components/HistoryPage.tsx

import { useState } from 'react';
import { trpc } from '@/services/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { HistoryCard } from './HistoryCard';
import { HistoryStats } from './HistoryStats';
import { Search, History, ChevronLeft, ChevronRight } from 'lucide-react';

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: stats } = trpc.recipes.history.getStats.useQuery();

  const { data: historyData, isLoading } = search
    ? trpc.recipes.history.search.useQuery({ query: search })
    : trpc.recipes.history.list.useQuery({
        limit: pageSize,
        offset: page * pageSize,
      });

  const items = search
    ? historyData
    : historyData?.items;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <History className="h-5 w-5" />
          Cooking History
        </h2>
      </div>

      {/* Stats */}
      {stats && <HistoryStats stats={stats} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="pl-9"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <HistoryListSkeleton />
      ) : items?.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {search ? 'No recipes found' : 'No cooking history yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items?.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination (only for non-search) */}
      {!search && historyData && 'hasMore' in historyData && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(historyData.total / pageSize)}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!historyData.hasMore}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/HistoryCard.tsx

import { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Clock, Users, Calendar } from 'lucide-react';

interface Props {
  item: RecipeHistoryItem;
}

export function HistoryCard({ item }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const recipeData = item.recipeData as RecipeData;

  return (
    <>
      <div
        className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => setShowDetail(true)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{item.recipeName}</h4>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              <Badge variant="outline" className="text-xs">
                {recipeData.cuisine}
              </Badge>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {recipeData.totalTimeMinutes}m
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {item.servingsCooked}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(item.cookedAt), 'MMM d')}
            </span>
          </div>
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet open={showDetail} onOpenChange={setShowDetail}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{item.recipeName}</SheetTitle>
          </SheetHeader>
          {/* Same content as RecipeDetailSheet */}
          <RecipeDetail recipe={recipeData} servings={item.servingsCooked} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

```typescript
// apps/web/src/modules/recipes/components/HistoryStats.tsx

import { Card, CardContent } from '@/components/ui/card';

interface Props {
  stats: {
    totalCooked: number;
    thisMonth: number;
    topCuisines: { cuisine: string; count: number }[];
  };
}

export function HistoryStats({ stats }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{stats.totalCooked}</p>
          <p className="text-xs text-muted-foreground">Total Cooked</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{stats.thisMonth}</p>
          <p className="text-xs text-muted-foreground">This Month</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">
            {stats.topCuisines[0]?.cuisine ?? '-'}
          </p>
          <p className="text-xs text-muted-foreground">Top Cuisine</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Integration with Batch Clear

When `createNew` is called on the batch router:

```typescript
// In batch.createNew mutation:

// Get completed recipes from current batch
const completedRecipes = recipes.filter(r => r.status === 'completed');

// Add to history
for (const recipe of completedRecipes) {
  await ctx.db.insert(recipeHistory).values({
    userId: ctx.userId,
    recipeName: recipe.recipeName,
    recipeData: recipe.recipeData,
    servingsCooked: recipe.servings,
    sourceBatchId: currentBatch.id,
    cookedAt: recipe.completedAt ?? new Date().toISOString(),
  });
}

// Note: audible_original and audible_replacement are NOT added to history
```

---

## Integration with Skill Input

When building skill input:

```typescript
// In buildBatchInput helper:

const recentMeals = await trpc.recipes.history.getRecent.query({ days: 14 });

// Include in skill input
const input: BatchRequestInput = {
  // ...
  recentMeals: recentMeals,  // Skill uses this for avoidance
};
```

---

## Edge Cases

- **Same recipe cooked multiple times**: Each creates separate history entry
- **Batch deleted before clear**: Completed recipes lost (no history)
- **Search empty string**: Falls back to paginated list
- **Very long history**: Pagination prevents performance issues

---

## Testing

- Unit: History insertion logic
- Unit: Search query building
- Integration: Batch clear -> History flow
- Integration: Recent meals -> Skill input flow
- E2E: Browse and search history
