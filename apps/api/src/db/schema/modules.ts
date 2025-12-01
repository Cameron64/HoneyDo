import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

// Module registry
export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(), // 'shopping-list', 'recipes', etc.
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// User module access/preferences
export const userModules = sqliteTable(
  'user_modules',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.moduleId] }),
  })
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type UserModule = typeof userModules.$inferSelect;
export type NewUserModule = typeof userModules.$inferInsert;
