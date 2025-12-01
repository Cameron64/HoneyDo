import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';
import {
  expandItemSchema,
  categorizeItemSchema,
  suggestItemsSchema,
  batchCategorizeSchema,
  SHOPPING_CATEGORIES,
  type ShoppingCategoryId,
} from '@honeydo/shared';
import { shoppingFrequentItems } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { ITEM_EXPANSIONS } from './expansions';

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 50; // calls per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return;
  }

  if (userLimit.count >= RATE_LIMIT) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `AI rate limit exceeded. Try again in ${Math.ceil((userLimit.resetAt - now) / 60000)} minutes.`,
    });
  }

  userLimit.count++;
}

// Category name to ID mapping for AI responses
const categoryNameToId: Record<string, ShoppingCategoryId> = {};
for (const cat of SHOPPING_CATEGORIES) {
  categoryNameToId[cat.name.toLowerCase()] = cat.id;
  categoryNameToId[cat.id] = cat.id;
}

// Helper to normalize category from AI response
function normalizeCategory(category: string | undefined | null): ShoppingCategoryId {
  if (!category) return 'other';
  const normalized = category.toLowerCase().trim();
  return categoryNameToId[normalized] ?? 'other';
}

// AI Service (placeholder - will be implemented with actual Anthropic SDK)
// For now, we'll use rule-based logic that can be replaced with AI later
const aiService = {
  async expandItem(
    itemName: string,
    existingItems: string[]
  ): Promise<{ name: string; quantity?: number; unit?: string; category?: ShoppingCategoryId }[]> {
    const normalized = itemName.toLowerCase().trim();
    const expansion = ITEM_EXPANSIONS[normalized];

    if (expansion) {
      // Filter out items already on the list
      const existingLower = new Set(existingItems.map((i) => i.toLowerCase()));
      return expansion.filter((item) => !existingLower.has(item.name.toLowerCase()));
    }

    // If not a known expansion, return as-is with auto-categorization
    const category = await aiService.categorizeItem(itemName);
    return [{ name: itemName, category }];
  },

  async categorizeItem(itemName: string): Promise<ShoppingCategoryId> {
    // Simple keyword-based categorization
    const normalized = itemName.toLowerCase();

    const rules: [string[], ShoppingCategoryId][] = [
      [['apple', 'banana', 'orange', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'broccoli', 'spinach', 'avocado', 'pepper', 'garlic', 'celery', 'cucumber', 'mushroom', 'fruit', 'vegetable', 'produce', 'greens', 'berries'], 'produce'],
      [['bread', 'bagel', 'muffin', 'roll', 'croissant', 'bun', 'tortilla', 'pita'], 'bakery'],
      [['turkey', 'ham', 'salami', 'deli', 'roast beef', 'bologna', 'pastrami'], 'deli'],
      [['beef', 'chicken', 'pork', 'steak', 'ground', 'bacon', 'sausage', 'fish', 'salmon', 'shrimp', 'seafood', 'meat'], 'meat'],
      [['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'sour cream', 'cottage', 'dairy'], 'dairy'],
      [['frozen', 'ice cream', 'pizza frozen', 'frozen vegetable', 'frozen fruit'], 'frozen'],
      [['pasta', 'rice', 'cereal', 'flour', 'sugar', 'oil', 'sauce', 'canned', 'soup', 'beans', 'seasoning', 'spice', 'salt', 'pepper', 'vinegar', 'condiment', 'mayo', 'mustard', 'ketchup'], 'pantry'],
      [['chip', 'cookie', 'cracker', 'candy', 'snack', 'popcorn', 'pretzel', 'nut', 'granola bar'], 'snacks'],
      [['water', 'soda', 'juice', 'coffee', 'tea', 'beer', 'wine', 'drink', 'beverage'], 'beverages'],
      [['paper towel', 'toilet paper', 'dish soap', 'laundry', 'trash bag', 'cleaning', 'household', 'detergent', 'sponge'], 'household'],
      [['shampoo', 'soap', 'toothpaste', 'deodorant', 'lotion', 'razor', 'personal', 'body wash'], 'personal'],
    ];

    for (const [keywords, category] of rules) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        return category;
      }
    }

    return 'other';
  },

  async suggestItems(
    currentItems: string[],
    frequentItems: { itemName: string; category: string | null }[]
  ): Promise<{ name: string; category?: ShoppingCategoryId; reason?: string }[]> {
    // Suggest frequent items not already on the list
    const currentLower = new Set(currentItems.map((i) => i.toLowerCase()));
    const suggestions: { name: string; category?: ShoppingCategoryId; reason?: string }[] = [];

    for (const freq of frequentItems) {
      if (!currentLower.has(freq.itemName.toLowerCase()) && suggestions.length < 5) {
        suggestions.push({
          name: freq.itemName,
          category: normalizeCategory(freq.category),
          reason: 'Frequently purchased',
        });
      }
    }

    return suggestions;
  },

  async batchCategorize(items: string[]): Promise<Record<string, ShoppingCategoryId>> {
    const result: Record<string, ShoppingCategoryId> = {};
    for (const item of items) {
      result[item] = await aiService.categorizeItem(item);
    }
    return result;
  },
};

export const aiRouter = router({
  // Expand a vague item into specific ingredients
  expand: protectedProcedure
    .input(expandItemSchema)
    .mutation(async ({ ctx, input }) => {
      checkRateLimit(ctx.userId);

      const items = await aiService.expandItem(
        input.itemName,
        input.existingItems ?? []
      );

      return { items };
    }),

  // Categorize a single item
  categorize: protectedProcedure
    .input(categorizeItemSchema)
    .mutation(async ({ ctx, input }) => {
      checkRateLimit(ctx.userId);

      const category = await aiService.categorizeItem(input.itemName);

      return { category };
    }),

  // Get AI suggestions based on patterns
  suggest: protectedProcedure
    .input(suggestItemsSchema)
    .query(async ({ ctx, input }) => {
      // Get user's frequent items
      const frequentItems = await ctx.db.query.shoppingFrequentItems.findMany({
        where: eq(shoppingFrequentItems.userId, ctx.userId),
        orderBy: desc(shoppingFrequentItems.useCount),
        limit: 20,
      });

      const suggestions = await aiService.suggestItems(input.currentItems, frequentItems);

      return { suggestions };
    }),

  // Batch categorize multiple items
  batchCategorize: protectedProcedure
    .input(batchCategorizeSchema)
    .mutation(async ({ ctx, input }) => {
      checkRateLimit(ctx.userId);

      const categorized = await aiService.batchCategorize(input.items);

      return { categorized };
    }),
});
