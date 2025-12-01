# Feature: Batch Skill Integration

## Overview

This feature enables communication between the HoneyDo app and **Claude Code running in headless mode**. The app invokes the `claude` CLI with the `-p` (print) flag to run non-interactively. Claude reads your historical recipe data, considers preferences, and returns a **batch** of recipe suggestions. This uses your existing Claude Code subscription - no separate API billing.

**Key Principle**: Use Claude Code's headless mode (`-p` flag) to invoke Claude from the backend without interactive UI.

**Key Change from Original**: No date-based scheduling. Batches are requested on-demand with a count parameter.

## How It Works

```
+---------------------------------------------------------------------+
|                     HoneyDo API Server                              |
|                                                                     |
|  1. Build prompt with preferences + batch size + recent history     |
|  2. spawn('claude', ['-p', '--output-format', 'json', ...])        |
|  3. Claude reads data/recipes/history.json                          |
|  4. Claude returns JSON batch of suggestions                        |
|  5. Parse, validate, store in batch_recipes table                   |
+---------------------------------------------------------------------+
```

## User Stories

- As a user, I want to request a batch of N meal suggestions
- As a user, I want suggestions to avoid recently cooked meals
- As a user, I want suggestions to respect my preferences
- As a user, I want to see AI reasoning for the batch
- As a user, I want to retry if the skill fails

## Acceptance Criteria

- [ ] Recipe history stored at `data/recipes/history.json`
- [ ] "Get Meal Ideas" button invokes Claude with preferences + batch size
- [ ] Claude response is validated and stored in batch
- [ ] Failed requests show clear error messages
- [ ] Retry mechanism for transient failures
- [ ] WebSocket notification when batch is ready
- [ ] Batch size is configurable (1-10, default from preferences)

---

## Technical Details

### Data Model

```typescript
// apps/api/src/db/schema/recipes.ts

// Recipe batches (the active meal list)
export const recipeBatches = sqliteTable('recipe_batches', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Batch state
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  // AI reasoning for the batch
  reasoning: text('reasoning'),

  // Error if skill failed
  error: text('error'),

  // Status: 'pending' | 'ready' | 'error'
  status: text('status').notNull().default('pending').$type<'pending' | 'ready' | 'error'>(),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  clearedAt: text('cleared_at'),  // When replaced by new batch
}, (table) => ({
  userIdx: index('idx_recipe_batches_user').on(table.createdBy),
  activeIdx: index('idx_recipe_batches_active').on(table.isActive),
}));

// Batch recipes (recipes in a batch)
export const batchRecipes = sqliteTable('batch_recipes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  batchId: text('batch_id').notNull().references(() => recipeBatches.id, { onDelete: 'cascade' }),

  // Recipe data (from skill output)
  recipeName: text('recipe_name').notNull(),
  recipeData: text('recipe_data', { mode: 'json' }).notNull().$type<RecipeData>(),

  // State: 'active', 'completed', 'audible_original', 'audible_replacement'
  status: text('status').notNull().default('active').$type<RecipeStatus>(),

  // For audible replacements, link to original
  audibleOriginalId: text('audible_original_id').references(() => batchRecipes.id, { onDelete: 'set null' }),

  // Audible metadata
  audibleReason: text('audible_reason').$type<AudibleReason>(),
  audibleDetails: text('audible_details'),

  // Position in list
  sortOrder: integer('sort_order').notNull().default(0),

  // Servings (may differ from recipe default)
  servings: integer('servings').notNull(),

  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  batchIdx: index('idx_batch_recipes_batch').on(table.batchId),
  statusIdx: index('idx_batch_recipes_status').on(table.status),
}));

// Types
type RecipeStatus = 'active' | 'completed' | 'audible_original' | 'audible_replacement';
type AudibleReason = 'missing_ingredient' | 'time_crunch' | 'mood_change' | 'other';

interface RecipeData {
  name: string;
  description: string;
  source: string;
  sourceUrl?: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  defaultServings: number;
  servingsUnit: string;
  cuisine: string;
  effort: number;
  ingredients: {
    name: string;
    amount: number;
    unit: string | null;
    category: string;
    preparation?: string;
    optional?: boolean;
  }[];
  instructions: string[];
  tags?: string[];
}
```

### Meal Suggestions Service

```typescript
// apps/api/src/services/meal-suggestions.ts

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { BatchRequestInput, SkillOutput } from '@honeydo/shared/types';
import { skillOutputSchema } from '@honeydo/shared/schemas';

export class MealSuggestionsService {
  constructor(private config: { projectRoot: string; timeout: number }) {}

  async getBatchSuggestions(input: BatchRequestInput): Promise<SkillOutput> {
    const userPrompt = this.buildBatchPrompt(input);

    return new Promise((resolve, reject) => {
      const proc = spawn('claude', [
        '-p',                          // Print mode (non-interactive)
        '--output-format', 'json',     // Get structured JSON response
        '--allowedTools', 'Read',      // Only allow reading files
        '--max-turns', '3',            // Limit iterations
        userPrompt,
      ], {
        cwd: this.config.projectRoot,
        timeout: this.config.timeout,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => stdout += data.toString());
      proc.stderr.on('data', (data) => stderr += data.toString());

      proc.on('error', (error) => {
        reject(new Error(`Claude process error: ${error.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          resolve(this.parseOutput(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private buildBatchPrompt(input: BatchRequestInput): string {
    return `
Please suggest meals for the following request.

## Request Type
batch

## Count
${input.count}

## Meal Types to Plan
${input.mealTypes.join(', ')}

## Default Servings
${input.servings}

## Recent Meals (avoid these - last 14 days from history)
${JSON.stringify(input.recentMeals, null, 2)}

## Current Batch Recipes (avoid duplicates)
${JSON.stringify(input.currentBatchRecipes)}

## Preferences
${JSON.stringify(input.preferences, null, 2)}

## Ingredient Preferences
${JSON.stringify(input.ingredientPreferences, null, 2)}

## Freeform Notes/Rules
${input.notes.map(n => \`[\${n.type}] \${n.content}\`).join('\n')}

## Context
- Season: ${input.context.season}

First, read the recipe history from data/recipes/history.json to see available recipes.
Then return your suggestions as JSON matching the output format.
`.trim();
  }

  private parseOutput(stdout: string): SkillOutput {
    // Parse Claude's JSON response
    const response = JSON.parse(stdout);
    const content = response.result || response.content?.[0]?.text || stdout;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = skillOutputSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid response format: ${result.error.message}`);
    }

    return result.data;
  }
}

export const mealSuggestionsService = new MealSuggestionsService({
  projectRoot: process.env.PROJECT_ROOT || process.cwd(),
  timeout: 180000,  // 3 minutes
});
```

### API (tRPC)

```typescript
// apps/api/src/modules/recipes/routers/batch.ts

import { router, protectedProcedure } from '../../../trpc';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { recipeBatches, batchRecipes, mealPreferences } from '../../../db/schema';
import { mealSuggestionsService } from '../../../services/meal-suggestions';
import { socketEmitter } from '../../../services/websocket';
import { buildBatchInput, getRecentMeals } from '../services/skill-helpers';

export const batchRouter = router({
  // Get active batch
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const batch = await ctx.db.query.recipeBatches.findFirst({
      where: and(
        eq(recipeBatches.createdBy, ctx.userId),
        eq(recipeBatches.isActive, true),
      ),
    });

    if (!batch) return null;

    const recipes = await ctx.db.query.batchRecipes.findMany({
      where: eq(batchRecipes.batchId, batch.id),
      orderBy: batchRecipes.sortOrder,
    });

    return { ...batch, recipes };
  }),

  // Request new batch of suggestions
  request: protectedProcedure
    .input(z.object({
      count: z.number().min(1).max(10).default(5),
      mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).default(['dinner']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user preferences
      const prefs = await ctx.db.query.mealPreferences.findFirst({
        where: eq(mealPreferences.userId, ctx.userId),
      });

      // Check for existing active batch
      const existingBatch = await ctx.db.query.recipeBatches.findFirst({
        where: and(
          eq(recipeBatches.createdBy, ctx.userId),
          eq(recipeBatches.isActive, true),
        ),
      });

      // Get current batch recipe names (to avoid duplicates)
      let currentBatchRecipes: string[] = [];
      if (existingBatch) {
        const existing = await ctx.db.query.batchRecipes.findMany({
          where: eq(batchRecipes.batchId, existingBatch.id),
        });
        currentBatchRecipes = existing.map(r => r.recipeName);
      }

      // Create or use existing batch
      let batch = existingBatch;
      if (!batch) {
        const [created] = await ctx.db.insert(recipeBatches)
          .values({
            createdBy: ctx.userId,
            status: 'pending',
          })
          .returning();
        batch = created;
      }

      // Build skill input
      const recentMeals = await getRecentMeals(ctx.db, 14);
      const skillInput = buildBatchInput({
        count: input.count,
        mealTypes: input.mealTypes,
        servings: prefs?.defaultServings ?? 2,
        preferences: prefs,
        recentMeals,
        currentBatchRecipes,
      });

      // Call Claude asynchronously
      mealSuggestionsService.getBatchSuggestions(skillInput)
        .then(async (output) => {
          // Get current max sort order
          const existing = await ctx.db.query.batchRecipes.findMany({
            where: eq(batchRecipes.batchId, batch!.id),
          });
          let sortOrder = existing.length;

          // Add recipes to batch
          for (const suggestion of output.suggestions) {
            await ctx.db.insert(batchRecipes).values({
              batchId: batch!.id,
              recipeName: suggestion.recipe.name,
              recipeData: suggestion.recipe,
              servings: prefs?.defaultServings ?? suggestion.recipe.defaultServings,
              sortOrder: sortOrder++,
            });
          }

          // Update batch status
          await ctx.db.update(recipeBatches)
            .set({
              status: 'ready',
              reasoning: output.reasoning,
            })
            .where(eq(recipeBatches.id, batch!.id));

          // Notify via WebSocket
          socketEmitter.toUser(ctx.userId, 'recipes:batch:created', {
            batchId: batch!.id,
          });
        })
        .catch(async (error) => {
          await ctx.db.update(recipeBatches)
            .set({
              status: 'error',
              error: error.message,
            })
            .where(eq(recipeBatches.id, batch!.id));

          socketEmitter.toUser(ctx.userId, 'recipes:batch:error', {
            batchId: batch!.id,
            error: error.message,
          });
        });

      return { batchId: batch.id, status: 'pending' };
    }),

  // Create new batch (clear old, roll over active)
  createNew: protectedProcedure
    .input(z.object({
      count: z.number().min(1).max(10).default(5),
      mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).default(['dinner']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get current active batch
      const currentBatch = await ctx.db.query.recipeBatches.findFirst({
        where: and(
          eq(recipeBatches.createdBy, ctx.userId),
          eq(recipeBatches.isActive, true),
        ),
      });

      if (currentBatch) {
        // Get recipes in current batch
        const recipes = await ctx.db.query.batchRecipes.findMany({
          where: eq(batchRecipes.batchId, currentBatch.id),
        });

        // Move completed to history
        const completedRecipes = recipes.filter(r => r.status === 'completed');
        for (const recipe of completedRecipes) {
          await ctx.db.insert(recipeHistory).values({
            userId: ctx.userId,
            recipeName: recipe.recipeName,
            recipeData: recipe.recipeData,
            servingsCooked: recipe.servings,
            sourceBatchId: currentBatch.id,
          });
        }

        // Mark current batch as inactive
        await ctx.db.update(recipeBatches)
          .set({
            isActive: false,
            clearedAt: new Date().toISOString(),
          })
          .where(eq(recipeBatches.id, currentBatch.id));

        // Get active recipes to roll over
        const activeRecipes = recipes.filter(r => r.status === 'active');

        // Create new batch
        const [newBatch] = await ctx.db.insert(recipeBatches)
          .values({
            createdBy: ctx.userId,
            status: 'ready',
          })
          .returning();

        // Roll over active recipes
        for (let i = 0; i < activeRecipes.length; i++) {
          await ctx.db.insert(batchRecipes).values({
            batchId: newBatch.id,
            recipeName: activeRecipes[i].recipeName,
            recipeData: activeRecipes[i].recipeData,
            servings: activeRecipes[i].servings,
            sortOrder: i,
          });
        }

        // Now request new suggestions
        // ... (same as request mutation above)
      }

      // ... rest of request logic
    }),

  // Get batch history
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.recipeBatches.findMany({
        where: and(
          eq(recipeBatches.createdBy, ctx.userId),
          eq(recipeBatches.isActive, false),
        ),
        orderBy: desc(recipeBatches.createdAt),
        limit: input.limit,
      });
    }),
});
```

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:batch:created` | Server->Client | `{ batchId }` |
| `recipes:batch:error` | Server->Client | `{ batchId, error }` |
| `recipes:batch:updated` | Server->Client | `{ batchId }` |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `GetIdeasButton` | Request batch with size input |
| `BatchSizeInput` | Number input for batch size |
| `NewBatchButton` | Clear and create new batch |
| `BatchStatus` | Show pending/ready/error state |
| `ReasoningPanel` | Collapsible AI explanation |

---

## Recipe History Data

Claude reads from `data/recipes/history.json`:

```json
{
  "recipes": [
    {
      "name": "Lemon Herb Chicken",
      "source": "NYT Cooking",
      "sourceUrl": "https://cooking.nytimes.com/...",
      "cuisine": "Mediterranean",
      "prepTimeMinutes": 15,
      "cookTimeMinutes": 45,
      "totalTimeMinutes": 60,
      "effort": 3,
      "defaultServings": 4,
      "servingsUnit": "servings",
      "ingredients": [...],
      "instructions": [...],
      "tags": ["weeknight", "one-pan"],
      "rating": 5,
      "timesMade": 8,
      "lastMade": "2024-12-15"
    }
  ],
  "metadata": {
    "lastUpdated": "2025-01-15",
    "totalRecipes": 47
  }
}
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Claude timeout (>3 min) | Store error, show retry button |
| Invalid JSON output | Validate schema, show parse error |
| Claude CLI not found | Clear error with install instructions |
| No history.json | Claude returns empty with explanation |

---

## Edge Cases

- **Claude returns empty**: Valid response, show "no suggestions" message
- **Add to existing batch**: New recipes appended with higher sort order
- **Overlapping requests**: Queue and process sequentially
- **Recipe history missing**: Claude handles gracefully

---

## Testing

- Unit: Input/output schema validation
- Unit: Batch prompt construction
- Integration: Request -> Response flow (mock subprocess)
- Integration: WebSocket notification delivery
- E2E: Full batch request flow
