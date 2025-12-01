import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users } from './users';
import type { HADomain, SceneAction } from '@honeydo/shared';

// ============================================
// Home Assistant Configuration
// ============================================

/**
 * Single-row table for HA connection configuration.
 * Only one HA instance can be configured at a time.
 */
export const haConfig = sqliteTable('ha_config', {
  id: integer('id').primaryKey().default(1),
  url: text('url').notNull(), // ws://homeassistant.local:8123/api/websocket
  accessToken: text('access_token').notNull(), // Encrypted long-lived token
  isConnected: integer('is_connected', { mode: 'boolean' }).notNull().default(false),
  lastConnectedAt: text('last_connected_at'),
  lastError: text('last_error'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

// ============================================
// Cached Entity States
// ============================================

/**
 * Cached entity states from Home Assistant.
 * Updated in real-time via WebSocket subscription.
 */
export const haEntities = sqliteTable(
  'ha_entities',
  {
    entityId: text('entity_id').primaryKey(), // light.living_room
    domain: text('domain').$type<HADomain>().notNull(), // light, switch, sensor, etc.
    friendlyName: text('friendly_name'),
    state: text('state'), // on, off, 72, unavailable, etc.
    attributes: text('attributes', { mode: 'json' }).$type<Record<string, unknown>>(),
    areaId: text('area_id'), // For room grouping
    lastChanged: text('last_changed'),
    lastUpdated: text('last_updated'),
  },
  (table) => ({
    domainIdx: index('ha_entities_domain_idx').on(table.domain),
    areaIdx: index('ha_entities_area_idx').on(table.areaId),
  })
);

// ============================================
// User Favorites
// ============================================

/**
 * User-pinned entities for quick access on dashboard.
 */
export const haFavorites = sqliteTable(
  'ha_favorites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').notNull(),
    displayName: text('display_name'), // Custom name override
    icon: text('icon'), // Custom icon override
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIdIdx: index('ha_favorites_user_id_idx').on(table.userId),
    sortOrderIdx: index('ha_favorites_sort_order_idx').on(table.sortOrder),
  })
);

// ============================================
// Custom Scenes
// ============================================

/**
 * HoneyDo-specific scenes (not Home Assistant scenes).
 * Each scene contains a list of service calls to execute.
 */
export const haScenes = sqliteTable(
  'ha_scenes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    icon: text('icon'),
    description: text('description'),
    actions: text('actions', { mode: 'json' }).$type<SceneAction[]>().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (table) => ({
    createdByIdx: index('ha_scenes_created_by_idx').on(table.createdBy),
    sortOrderIdx: index('ha_scenes_sort_order_idx').on(table.sortOrder),
  })
);

// ============================================
// Action Log
// ============================================

/**
 * Log of all actions taken (for debugging and accountability).
 */
export const haActionLog = sqliteTable(
  'ha_action_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    actionType: text('action_type').$type<'service_call' | 'scene_activate'>().notNull(),
    details: text('details', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<'success' | 'error'>().notNull(),
    errorMessage: text('error_message'),
    executedAt: text('executed_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIdIdx: index('ha_action_log_user_id_idx').on(table.userId),
    actionTypeIdx: index('ha_action_log_action_type_idx').on(table.actionType),
    executedAtIdx: index('ha_action_log_executed_at_idx').on(table.executedAt),
  })
);

// ============================================
// Relations
// ============================================

export const haFavoritesRelations = relations(haFavorites, ({ one }) => ({
  user: one(users, {
    fields: [haFavorites.userId],
    references: [users.id],
  }),
}));

export const haScenesRelations = relations(haScenes, ({ one }) => ({
  creator: one(users, {
    fields: [haScenes.createdBy],
    references: [users.id],
  }),
}));

export const haActionLogRelations = relations(haActionLog, ({ one }) => ({
  user: one(users, {
    fields: [haActionLog.userId],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type HAConfigRow = typeof haConfig.$inferSelect;
export type NewHAConfig = typeof haConfig.$inferInsert;

export type HAEntityRow = typeof haEntities.$inferSelect;
export type NewHAEntity = typeof haEntities.$inferInsert;

export type HAFavoriteRow = typeof haFavorites.$inferSelect;
export type NewHAFavorite = typeof haFavorites.$inferInsert;

export type HASceneRow = typeof haScenes.$inferSelect;
export type NewHAScene = typeof haScenes.$inferInsert;

export type HAActionLogRow = typeof haActionLog.$inferSelect;
export type NewHAActionLog = typeof haActionLog.$inferInsert;
