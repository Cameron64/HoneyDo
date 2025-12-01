import { z } from 'zod';
import { SHOPPING_CATEGORIES, QUANTITY_UNITS, type ShoppingCategoryId, type QuantityUnit } from '../constants/categories';

// Category ID enum from constants - preserving literal types
const categoryIds = SHOPPING_CATEGORIES.map((c) => c.id) as unknown as readonly [ShoppingCategoryId, ...ShoppingCategoryId[]];
export const shoppingCategorySchema = z.enum(categoryIds);

// Unit enum from constants - preserving literal types
const units = QUANTITY_UNITS as unknown as readonly [QuantityUnit, ...QuantityUnit[]];
export const quantityUnitSchema = z.enum(units);

// ============================================
// Shopping List Schemas
// ============================================

export const shoppingListSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  isDefault: z.boolean(),
  isArchived: z.boolean(),
  createdBy: z.string(),
  googleKeepId: z.string().nullable(),
  googleKeepSyncEnabled: z.boolean(),
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createShoppingListSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
});

export const updateShoppingListSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  googleKeepId: z.string().nullable().optional(),
  googleKeepSyncEnabled: z.boolean().optional(),
});

// ============================================
// Shopping Item Schemas
// ============================================

export const shoppingItemSchema = z.object({
  id: z.string(),
  listId: z.string(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().nullable(),
  unit: z.string().max(50).nullable(),
  category: shoppingCategorySchema.nullable(),
  note: z.string().max(500).nullable(),
  checked: z.boolean(),
  checkedAt: z.string().datetime().nullable(),
  checkedBy: z.string().nullable(),
  addedBy: z.string(),
  sortOrder: z.number().int(),
  googleKeepItemId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createShoppingItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1, 'Item name is required').max(200, 'Item name too long'),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  category: shoppingCategorySchema.optional(),
  note: z.string().max(500).optional(),
});

export const updateShoppingItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  category: shoppingCategorySchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const checkShoppingItemSchema = z.object({
  id: z.string(),
  checked: z.boolean(),
});

// Bulk operations
export const bulkAddItemsSchema = z.object({
  listId: z.string(),
  items: z.array(
    z.object({
      name: z.string().min(1).max(200),
      quantity: z.number().positive().optional(),
      unit: z.string().max(50).optional(),
      category: shoppingCategorySchema.optional(),
    })
  ).min(1).max(50),
});

export const reorderItemsSchema = z.object({
  listId: z.string(),
  itemIds: z.array(z.string()).min(1),
});

export const clearCheckedItemsSchema = z.object({
  listId: z.string(),
});

// ============================================
// AI Feature Schemas
// ============================================

export const expandItemSchema = z.object({
  itemName: z.string().min(1).max(200),
  existingItems: z.array(z.string()).optional(),
});

export const expandItemResponseSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      category: shoppingCategorySchema.optional(),
    })
  ),
});

export const categorizeItemSchema = z.object({
  itemName: z.string().min(1).max(200),
});

export const categorizeItemResponseSchema = z.object({
  category: shoppingCategorySchema,
});

export const suggestItemsSchema = z.object({
  currentItems: z.array(z.string()),
});

export const suggestItemsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string(),
      category: shoppingCategorySchema.optional(),
      reason: z.string().optional(),
    })
  ),
});

export const batchCategorizeSchema = z.object({
  items: z.array(z.string()).min(1).max(50),
});

export const batchCategorizeResponseSchema = z.object({
  categorized: z.record(z.string(), shoppingCategorySchema),
});

// ============================================
// Frequent Items Schema (for suggestions)
// ============================================

export const frequentItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  itemName: z.string(),
  category: shoppingCategorySchema.nullable(),
  useCount: z.number().int(),
  lastUsedAt: z.string().datetime(),
});

// ============================================
// Sync Schemas (for Google Keep)
// ============================================

export const syncStatusSchema = z.enum(['idle', 'syncing', 'error']);

export const syncLogSchema = z.object({
  id: z.string(),
  listId: z.string(),
  direction: z.enum(['import', 'export', 'bidirectional']),
  status: z.enum(['success', 'partial', 'error']),
  itemsSynced: z.number().int(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// ============================================
// Inferred Types
// ============================================

export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
export type UpdateShoppingListInput = z.infer<typeof updateShoppingListSchema>;

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type CheckShoppingItemInput = z.infer<typeof checkShoppingItemSchema>;
export type BulkAddItemsInput = z.infer<typeof bulkAddItemsSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type ClearCheckedItemsInput = z.infer<typeof clearCheckedItemsSchema>;

export type ExpandItemInput = z.infer<typeof expandItemSchema>;
export type ExpandItemResponse = z.infer<typeof expandItemResponseSchema>;
export type CategorizeItemInput = z.infer<typeof categorizeItemSchema>;
export type CategorizeItemResponse = z.infer<typeof categorizeItemResponseSchema>;
export type SuggestItemsInput = z.infer<typeof suggestItemsSchema>;
export type SuggestItemsResponse = z.infer<typeof suggestItemsResponseSchema>;
export type BatchCategorizeInput = z.infer<typeof batchCategorizeSchema>;
export type BatchCategorizeResponse = z.infer<typeof batchCategorizeResponseSchema>;

export type FrequentItem = z.infer<typeof frequentItemSchema>;
export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type SyncLog = z.infer<typeof syncLogSchema>;
