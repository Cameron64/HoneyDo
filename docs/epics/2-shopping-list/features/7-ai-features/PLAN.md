# Feature 2.7: AI Features

> Smart expansion, categorization, and suggestions.

## Overview

This feature adds AI capabilities to the shopping list - expanding vague items like "taco stuff" into specific ingredients, auto-categorizing items, and suggesting items you might have forgotten.

## Acceptance Criteria

- [ ] "Taco stuff" expands to specific ingredients
- [ ] User can accept/reject AI expansions
- [ ] New items auto-categorized
- [ ] Suggestions shown based on common items
- [ ] AI features are optional (graceful degradation)
- [ ] Rate limiting to control API costs

## Technical Details

### AI Service Integration

```typescript
// apps/api/src/services/ai.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const aiService = {
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Fast and cheap for simple tasks
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].type === 'text'
      ? response.content[0].text
      : '';
  },

  async json<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const response = await this.complete(prompt, systemPrompt);
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  },
};
```

### AI Router

```typescript
// apps/api/src/modules/shopping/ai.router.ts
import { z } from 'zod';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import { aiService } from '../../services/ai';
import { SHOPPING_CATEGORIES } from '@honeydo/shared';

const expandResultSchema = z.object({
  isExpanded: z.boolean(),
  items: z.array(z.object({
    name: z.string(),
    category: z.string().optional(),
    quantity: z.string().optional(),
  })),
  originalInterpretation: z.string().optional(),
});

export const aiRouter = router({
  // Expand vague items
  expandItem: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(200),
      context: z.object({
        existingItems: z.array(z.string()).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const categoryList = SHOPPING_CATEGORIES.map(c => c.id).join(', ');

      const systemPrompt = `You are a helpful shopping assistant. When given a vague or composite shopping item, expand it into specific items. Categories available: ${categoryList}.`;

      const prompt = `The user wants to add "${input.text}" to their shopping list.
${input.context?.existingItems?.length ? `They already have: ${input.context.existingItems.join(', ')}` : ''}

If this is a vague or composite item (like "taco stuff", "breakfast items", "salad ingredients"), expand it into specific items they likely need.

If this is already a specific item, return it as-is with isExpanded: false.

Return JSON only:
{
  "isExpanded": boolean,
  "items": [{ "name": string, "category": string, "quantity"?: string }],
  "originalInterpretation": string // What you understood they meant
}`;

      const result = await aiService.json<z.infer<typeof expandResultSchema>>(prompt, systemPrompt);
      return expandResultSchema.parse(result);
    }),

  // Categorize an item
  categorizeItem: protectedProcedure
    .input(z.object({
      name: z.string(),
    }))
    .mutation(async ({ input }) => {
      const categoryList = SHOPPING_CATEGORIES.map(c => c.id).join(', ');

      const prompt = `Categorize this shopping item into one of these categories: ${categoryList}

Item: "${input.name}"

Return only the category ID, nothing else.`;

      const category = await aiService.complete(prompt);
      const cleaned = category.trim().toLowerCase();

      // Validate it's a real category
      const valid = SHOPPING_CATEGORIES.find(c => c.id === cleaned);
      return { category: valid?.id ?? 'other' };
    }),

  // Suggest items based on patterns
  suggestItems: protectedProcedure
    .input(z.object({
      listId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get current items
      const currentItems = await ctx.db.query.shoppingItems.findMany({
        where: and(
          eq(shoppingItems.listId, input.listId),
          eq(shoppingItems.checked, false)
        ),
      });

      // Get frequently purchased items
      const frequentItems = await ctx.db.query.shoppingFrequentItems.findMany({
        where: eq(shoppingFrequentItems.userId, ctx.userId),
        orderBy: desc(shoppingFrequentItems.useCount),
        limit: 20,
      });

      const currentNames = currentItems.map(i => i.name.toLowerCase());
      const frequentNames = frequentItems
        .filter(f => !currentNames.includes(f.itemName.toLowerCase()))
        .slice(0, 10);

      if (frequentNames.length === 0) {
        return { suggestions: [] };
      }

      const prompt = `The user is making a shopping list. They currently have: ${currentNames.join(', ')}

They frequently buy these items that aren't on the list: ${frequentNames.map(f => f.itemName).join(', ')}

Suggest up to 5 items they might want to add. Consider what items commonly go together.

Return JSON only:
{
  "suggestions": [
    { "name": string, "reason": string }
  ]
}`;

      const result = await aiService.json<{ suggestions: Array<{ name: string; reason: string }> }>(prompt);
      return result;
    }),

  // Batch categorize items
  batchCategorize: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const categoryList = SHOPPING_CATEGORIES.map(c => c.id).join(', ');

      const prompt = `Categorize these shopping items. Categories: ${categoryList}

Items:
${input.items.map((i, idx) => `${idx + 1}. ${i.name}`).join('\n')}

Return JSON array with same order:
[{ "id": string, "category": string }]`;

      const result = await aiService.json<Array<{ id: string; category: string }>>(prompt);

      // Update items with categories
      for (const item of result) {
        await ctx.db.update(shoppingItems)
          .set({ category: item.category })
          .where(eq(shoppingItems.id, item.id));
      }

      return { categorized: result.length };
    }),
});
```

### Expansion UI

```tsx
// apps/web/src/modules/shopping/components/AIExpandSheet.tsx
import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '../../../components/ui/sheet';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Sparkles, Loader2 } from 'lucide-react';

interface AIExpandSheetProps {
  input: string;
  listId: string;
  open: boolean;
  onClose: () => void;
  existingItems: string[];
}

export function AIExpandSheet({
  input,
  listId,
  open,
  onClose,
  existingItems,
}: AIExpandSheetProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();
  const expand = trpc.shopping.ai.expandItem.useMutation();
  const addBulk = trpc.shopping.items.addBulk.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
      onClose();
    },
  });

  // Trigger expansion when sheet opens
  useEffect(() => {
    if (open && input) {
      expand.mutate({ text: input, context: { existingItems } });
    }
  }, [open, input]);

  useEffect(() => {
    if (expand.data?.items) {
      // Select all by default
      setSelected(new Set(expand.data.items.map((_, i) => i)));
    }
  }, [expand.data]);

  const handleToggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  };

  const handleAddSelected = () => {
    if (!expand.data) return;

    const items = expand.data.items
      .filter((_, i) => selected.has(i))
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        category: item.category,
      }));

    addBulk.mutate({ listId, items });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Expand "{input}"
          </SheetTitle>
        </SheetHeader>

        <div className="py-4">
          {expand.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : expand.data?.isExpanded ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">
                {expand.data.originalInterpretation}
              </p>
              {expand.data.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg border p-3"
                  onClick={() => handleToggle(index)}
                >
                  <Checkbox checked={selected.has(index)} />
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.quantity && (
                        <span className="text-muted-foreground mr-1">
                          {item.quantity}
                        </span>
                      )}
                      {item.name}
                    </p>
                    {item.category && (
                      <p className="text-xs text-muted-foreground capitalize">
                        {item.category}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              This looks like a specific item. Adding it as-is.
            </p>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAddSelected}
            disabled={selected.size === 0 || addBulk.isPending}
          >
            Add {selected.size} item{selected.size !== 1 ? 's' : ''}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

### Auto-Categorization Hook

```typescript
// apps/web/src/modules/shopping/hooks/useAutoCategory.ts
import { useEffect } from 'react';
import { trpc } from '../../../lib/trpc';

export function useAutoCategory(listId: string) {
  const utils = trpc.useUtils();
  const { data: items } = trpc.shopping.items.getByList.useQuery(listId);
  const categorize = trpc.shopping.ai.categorizeItem.useMutation();

  useEffect(() => {
    // Find uncategorized items
    const uncategorized = items?.filter(i => !i.category && !i.checked);

    if (uncategorized?.length) {
      // Categorize one at a time to avoid rate limits
      const item = uncategorized[0];
      categorize.mutate(
        { name: item.name },
        {
          onSuccess: (data) => {
            // Update item with category
            utils.shopping.items.getByList.setData(listId, (old) =>
              old?.map(i =>
                i.id === item.id ? { ...i, category: data.category } : i
              )
            );
          },
        }
      );
    }
  }, [items]);
}
```

### Suggestions Component

```tsx
// apps/web/src/modules/shopping/components/AISuggestions.tsx
import { trpc } from '../../../lib/trpc';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Sparkles, Plus, X } from 'lucide-react';

interface AISuggestionsProps {
  listId: string;
}

export function AISuggestions({ listId }: AISuggestionsProps) {
  const { data, isLoading } = trpc.shopping.ai.suggestItems.useQuery(
    { listId },
    { refetchInterval: 5 * 60 * 1000 } // Refresh every 5 minutes
  );

  const utils = trpc.useUtils();
  const addItem = trpc.shopping.items.add.useMutation({
    onSuccess: () => {
      utils.shopping.items.getByList.invalidate(listId);
      utils.shopping.ai.suggestItems.invalidate({ listId });
    },
  });

  if (isLoading || !data?.suggestions?.length) {
    return null;
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {data.suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="h-auto py-1"
              onClick={() => addItem.mutate({ listId, name: suggestion.name })}
              title={suggestion.reason}
            >
              <Plus className="mr-1 h-3 w-3" />
              {suggestion.name}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Frequent Items Tracking

```typescript
// apps/api/src/modules/shopping/utils/tracking.ts
export async function trackFrequentItem(
  db: DB,
  userId: string,
  itemName: string,
  category?: string
) {
  const normalized = itemName.toLowerCase().trim();

  await db.insert(shoppingFrequentItems)
    .values({
      userId,
      itemName: normalized,
      category,
      useCount: 1,
      lastUsedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [shoppingFrequentItems.userId, shoppingFrequentItems.itemName],
      set: {
        useCount: sql`use_count + 1`,
        lastUsedAt: new Date().toISOString(),
        category: category ?? sql`category`,
      },
    });
}
```

## Implementation Steps

1. **Set Up AI Service**
   - Anthropic client wrapper
   - JSON extraction helper
   - Error handling

2. **Create AI Router**
   - expandItem mutation
   - categorizeItem mutation
   - suggestItems query
   - batchCategorize mutation

3. **Build Expansion UI**
   - Trigger detection in QuickAddBar
   - AIExpandSheet component
   - Selection and add flow

4. **Implement Auto-Categorization**
   - Hook to detect uncategorized items
   - Background categorization
   - Rate limiting

5. **Build Suggestions**
   - Track frequent items
   - AISuggestions component
   - Add from suggestion

6. **Add Rate Limiting**
   - Track AI calls per user
   - Graceful degradation when exceeded

## Rate Limiting

```typescript
// apps/api/src/middleware/ai-rate-limit.ts
const AI_RATE_LIMIT = 50; // calls per hour per user

export async function checkAIRateLimit(userId: string): Promise<boolean> {
  const key = `ai:rate:${userId}:${Math.floor(Date.now() / 3600000)}`;
  const count = await redis.incr(key);
  await redis.expire(key, 3600);
  return count <= AI_RATE_LIMIT;
}
```

## Definition of Done

- [ ] "Taco stuff" expands to ~7 ingredients
- [ ] User can select which expanded items to add
- [ ] New items get auto-categorized
- [ ] Suggestions appear based on patterns
- [ ] AI features degrade gracefully when unavailable
- [ ] Rate limiting prevents abuse

## Dependencies

- Feature 2.2 (Item Management) - items exist
- Feature 2.5 (Categories) - categories exist
- Anthropic API key configured

## Cost Considerations

- Use Claude Haiku for simple tasks (cheapest)
- Batch operations where possible
- Cache categorization results
- Consider local model fallback (future)

## Notes

- Expansion phrases: "stuff", "things for", "ingredients for"
- Consider fuzzy matching for suggestions
- User can disable AI features in settings
