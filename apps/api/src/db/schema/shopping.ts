import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users';
import type { ShoppingCategoryId } from '@honeydo/shared';

// ============================================
// Shopping Lists
// ============================================

export const shoppingLists = sqliteTable(
  'shopping_lists',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Google Keep sync fields
    googleKeepId: text('google_keep_id'),
    googleKeepSyncEnabled: integer('google_keep_sync_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastSyncedAt: text('last_synced_at'),

    // Timestamps
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    createdByIdx: index('shopping_lists_created_by_idx').on(table.createdBy),
    isDefaultIdx: index('shopping_lists_is_default_idx').on(table.isDefault),
  })
);

// ============================================
// Shopping Items
// ============================================

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    listId: text('list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    quantity: integer('quantity'),
    unit: text('unit'),
    category: text('category').$type<ShoppingCategoryId>(),
    note: text('note'),

    // Check state
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    checkedAt: text('checked_at'),
    checkedBy: text('checked_by').references(() => users.id, { onDelete: 'set null' }),

    // Tracking
    addedBy: text('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),

    // Google Keep sync
    googleKeepItemId: text('google_keep_item_id'),

    // Recipe/meal tracking - which meals this ingredient is for
    fromMeals: text('from_meals', { mode: 'json' }).$type<string[]>(),

    // Timestamps
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    listIdIdx: index('shopping_items_list_id_idx').on(table.listId),
    checkedIdx: index('shopping_items_checked_idx').on(table.checked),
    categoryIdx: index('shopping_items_category_idx').on(table.category),
    sortOrderIdx: index('shopping_items_sort_order_idx').on(table.sortOrder),
  })
);

// ============================================
// Frequent Items (for AI suggestions)
// ============================================

export const shoppingFrequentItems = sqliteTable(
  'shopping_frequent_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemName: text('item_name').notNull(),
    category: text('category').$type<ShoppingCategoryId>(),
    useCount: integer('use_count').notNull().default(1),
    lastUsedAt: text('last_used_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIdIdx: index('shopping_frequent_items_user_id_idx').on(table.userId),
    useCountIdx: index('shopping_frequent_items_use_count_idx').on(table.useCount),
  })
);

// ============================================
// Sync Log (for debugging Keep sync)
// ============================================

export const shoppingSyncLog = sqliteTable(
  'shopping_sync_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    listId: text('list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    direction: text('direction').$type<'import' | 'export' | 'bidirectional'>().notNull(),
    status: text('status').$type<'success' | 'partial' | 'error'>().notNull(),
    itemsSynced: integer('items_synced').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    listIdIdx: index('shopping_sync_log_list_id_idx').on(table.listId),
  })
);

// ============================================
// Google Keep Credentials (encrypted)
// ============================================

export const googleKeepCredentials = sqliteTable('google_keep_credentials', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  masterToken: text('master_token').notNull(), // Should be encrypted
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

// ============================================
// Relations
// ============================================

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  creator: one(users, {
    fields: [shoppingLists.createdBy],
    references: [users.id],
  }),
  items: many(shoppingItems),
  syncLogs: many(shoppingSyncLog),
}));

export const shoppingItemsRelations = relations(shoppingItems, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingItems.listId],
    references: [shoppingLists.id],
  }),
  addedByUser: one(users, {
    fields: [shoppingItems.addedBy],
    references: [users.id],
    relationName: 'addedByUser',
  }),
  checkedByUser: one(users, {
    fields: [shoppingItems.checkedBy],
    references: [users.id],
    relationName: 'checkedByUser',
  }),
}));

export const shoppingFrequentItemsRelations = relations(shoppingFrequentItems, ({ one }) => ({
  user: one(users, {
    fields: [shoppingFrequentItems.userId],
    references: [users.id],
  }),
}));

export const shoppingSyncLogRelations = relations(shoppingSyncLog, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingSyncLog.listId],
    references: [shoppingLists.id],
  }),
}));

export const googleKeepCredentialsRelations = relations(googleKeepCredentials, ({ one }) => ({
  user: one(users, {
    fields: [googleKeepCredentials.userId],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type NewShoppingList = typeof shoppingLists.$inferInsert;

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type NewShoppingItem = typeof shoppingItems.$inferInsert;

export type ShoppingFrequentItemRow = typeof shoppingFrequentItems.$inferSelect;
export type NewShoppingFrequentItem = typeof shoppingFrequentItems.$inferInsert;

export type ShoppingSyncLogRow = typeof shoppingSyncLog.$inferSelect;
export type NewShoppingSyncLog = typeof shoppingSyncLog.$inferInsert;

export type GoogleKeepCredentialsRow = typeof googleKeepCredentials.$inferSelect;
export type NewGoogleKeepCredentials = typeof googleKeepCredentials.$inferInsert;
