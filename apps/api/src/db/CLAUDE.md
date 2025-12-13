# HoneyDo Database - Claude Code Instructions

> SQLite database with Drizzle ORM

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm db:generate` | Generate migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:studio` | Open Drizzle Studio GUI |
| `pnpm db:seed` | Run database seeding |

## Database Structure

```
apps/api/src/db/
├── CLAUDE.md              # This file
├── index.ts               # Database client export
├── seed.ts                # Seeding script
└── schema/
    ├── index.ts           # Export all tables
    ├── users.ts           # Users table
    ├── settings.ts        # Settings tables
    ├── modules.ts         # Module registry
    ├── shopping.ts        # Shopping lists/items (Epic 2)
    ├── home-automation.ts # HA entities/scenes/config (Epic 3)
    └── recipes.ts         # Meal preferences/suggestions/meals/wizard (Epic 4)
```

## Drizzle Basics

### Table Definition

```typescript
// apps/api/src/db/schema/<module>.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const tableName = sqliteTable('table_name', {
  // Columns go here
});
```

### Column Types

| Drizzle Type | SQLite Type | TypeScript | Use For |
|--------------|-------------|------------|---------|
| `text('col')` | TEXT | `string` | Strings, IDs, dates, JSON |
| `integer('col')` | INTEGER | `number` | Numbers, booleans |
| `real('col')` | REAL | `number` | Floating point |
| `blob('col')` | BLOB | `Buffer` | Binary data |

### Column Modifiers

```typescript
// Required field
name: text('name').notNull()

// Primary key with nanoid
id: text('id').primaryKey().$defaultFn(() => nanoid())

// Default value
isActive: integer('is_active', { mode: 'boolean' }).default(true)

// SQL default (evaluated by SQLite)
createdAt: text('created_at').default(sql`(datetime('now'))`)

// Foreign key
userId: text('user_id').references(() => users.id)

// Foreign key with cascade
userId: text('user_id').references(() => users.id, { onDelete: 'cascade' })

// JSON column (stored as text)
metadata: text('metadata', { mode: 'json' }).$type<{ foo: string }>()

// Boolean (SQLite uses integers)
checked: integer('checked', { mode: 'boolean' }).default(false)

// Unique constraint
email: text('email').unique()

// On update (Drizzle helper, not SQLite native)
updatedAt: text('updated_at').$onUpdate(() => new Date().toISOString())
```

## Common Patterns

### IDs

Always use `nanoid()` for primary keys:

```typescript
import { nanoid } from 'nanoid';

id: text('id').primaryKey().$defaultFn(() => nanoid())
```

Why: URL-safe, shorter than UUID, good for client-side generation if needed.

### Timestamps

Store as ISO strings (TEXT), not integers:

```typescript
createdAt: text('created_at')
  .notNull()
  .default(sql`(datetime('now'))`),

updatedAt: text('updated_at')
  .notNull()
  .default(sql`(datetime('now'))`)
  .$onUpdate(() => new Date().toISOString()),
```

### Foreign Keys

Always define foreign key constraints:

```typescript
// Simple reference
userId: text('user_id')
  .notNull()
  .references(() => users.id)

// With cascade delete (delete items when parent is deleted)
listId: text('list_id')
  .notNull()
  .references(() => shoppingLists.id, { onDelete: 'cascade' })

// With set null (set to null when parent is deleted)
assignedTo: text('assigned_to')
  .references(() => users.id, { onDelete: 'set null' })
```

### Enums

Store as text with TypeScript type constraint:

```typescript
status: text('status')
  .$type<'pending' | 'active' | 'completed'>()
  .default('pending')
  .notNull()
```

### JSON Data

For complex nested data:

```typescript
preferences: text('preferences', { mode: 'json' })
  .$type<{
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
  }>()
```

Note: No indexing or querying inside JSON. For queryable fields, use separate columns.

### Composite Primary Keys

For junction/pivot tables:

```typescript
import { primaryKey } from 'drizzle-orm/sqlite-core';

export const userModules = sqliteTable('user_modules', {
  userId: text('user_id').notNull().references(() => users.id),
  moduleId: text('module_id').notNull().references(() => modules.id),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.moduleId] }),
}));
```

### Indexes

```typescript
import { index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull(),
  category: text('category'),
}, (table) => ({
  listIdIdx: index('shopping_items_list_id_idx').on(table.listId),
  categoryIdx: index('shopping_items_category_idx').on(table.category),
}));
```

## Relations

Relations enable the Drizzle query API with eager loading:

```typescript
import { relations } from 'drizzle-orm';

// One-to-many: A user has many lists
export const usersRelations = relations(users, ({ many }) => ({
  lists: many(shoppingLists),
}));

// Many-to-one: A list belongs to a user
export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  creator: one(users, {
    fields: [shoppingLists.createdBy],
    references: [users.id],
  }),
  items: many(shoppingItems),
}));

// Many-to-one: An item belongs to a list
export const shoppingItemsRelations = relations(shoppingItems, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingItems.listId],
    references: [shoppingLists.id],
  }),
}));
```

## Query API

### Basic Queries

```typescript
import { db } from './index';
import { shoppingLists, shoppingItems } from './schema';
import { eq, and, or, not, gt, lt, gte, lte, like, isNull, isNotNull, desc, asc } from 'drizzle-orm';

// Find all
const lists = await db.query.shoppingLists.findMany();

// Find with filter
const activeLists = await db.query.shoppingLists.findMany({
  where: eq(shoppingLists.isArchived, false),
});

// Find one
const list = await db.query.shoppingLists.findFirst({
  where: eq(shoppingLists.id, listId),
});

// With relations (eager loading)
const listWithItems = await db.query.shoppingLists.findFirst({
  where: eq(shoppingLists.id, listId),
  with: {
    items: true,
    creator: true,
  },
});

// Nested relations
const listDeep = await db.query.shoppingLists.findFirst({
  where: eq(shoppingLists.id, listId),
  with: {
    items: {
      with: { checkedByUser: true },
      orderBy: [asc(shoppingItems.sortOrder)],
    },
  },
});

// Order by
const sortedLists = await db.query.shoppingLists.findMany({
  orderBy: [desc(shoppingLists.updatedAt)],
});

// Limit and offset
const pagedLists = await db.query.shoppingLists.findMany({
  limit: 10,
  offset: 20,
});

// Complex where
const items = await db.query.shoppingItems.findMany({
  where: and(
    eq(shoppingItems.listId, listId),
    eq(shoppingItems.checked, false),
    or(
      like(shoppingItems.name, '%milk%'),
      like(shoppingItems.name, '%eggs%')
    )
  ),
});
```

### Insert

```typescript
// Single insert
const [newList] = await db.insert(shoppingLists)
  .values({
    name: 'Groceries',
    householdId: 'household123',
    createdBy: userId,
  })
  .returning();

// Multiple insert
const newItems = await db.insert(shoppingItems)
  .values([
    { listId, name: 'Milk' },
    { listId, name: 'Eggs' },
    { listId, name: 'Bread' },
  ])
  .returning();

// Insert or ignore (on conflict do nothing)
await db.insert(users)
  .values({ id: clerkId, email })
  .onConflictDoNothing();

// Upsert (insert or update)
await db.insert(users)
  .values({ id: clerkId, email, name })
  .onConflictDoUpdate({
    target: users.id,
    set: { email, name, updatedAt: new Date().toISOString() },
  });
```

### Update

```typescript
// Update with where
await db.update(shoppingItems)
  .set({
    checked: true,
    checkedBy: userId,
    checkedAt: new Date().toISOString(),
  })
  .where(eq(shoppingItems.id, itemId));

// Update with returning
const [updated] = await db.update(shoppingLists)
  .set({ name: 'New Name' })
  .where(eq(shoppingLists.id, listId))
  .returning();

// Increment/decrement
await db.update(shoppingItems)
  .set({
    sortOrder: sql`${shoppingItems.sortOrder} + 1`,
  })
  .where(gt(shoppingItems.sortOrder, position));
```

### Delete

```typescript
// Delete with where
await db.delete(shoppingItems)
  .where(eq(shoppingItems.id, itemId));

// Delete multiple
await db.delete(shoppingItems)
  .where(eq(shoppingItems.listId, listId));

// Delete with returning
const [deleted] = await db.delete(shoppingLists)
  .where(eq(shoppingLists.id, listId))
  .returning();
```

### Aggregations

```typescript
import { count, sum, avg, min, max } from 'drizzle-orm';

// Count
const [{ value }] = await db.select({ value: count() })
  .from(shoppingItems)
  .where(eq(shoppingItems.listId, listId));

// Count with condition
const [{ unchecked }] = await db.select({
  unchecked: count(sql`CASE WHEN ${shoppingItems.checked} = 0 THEN 1 END`)
})
  .from(shoppingItems)
  .where(eq(shoppingItems.listId, listId));

// Group by
const byCategory = await db.select({
  category: shoppingItems.category,
  count: count(),
})
  .from(shoppingItems)
  .where(eq(shoppingItems.listId, listId))
  .groupBy(shoppingItems.category);
```

### Raw SQL

For complex queries:

```typescript
import { sql } from 'drizzle-orm';

// Raw expression in select
const items = await db.select({
  id: shoppingItems.id,
  name: shoppingItems.name,
  daysSinceCreated: sql<number>`julianday('now') - julianday(${shoppingItems.createdAt})`,
}).from(shoppingItems);

// Full raw query
const result = await db.run(sql`
  SELECT * FROM shopping_items
  WHERE list_id = ${listId}
  ORDER BY sort_order
`);
```

## Migrations

### Development Workflow

1. Modify schema files in `src/db/schema/`
2. Generate migration: `pnpm db:generate`
3. Review generated migration in `drizzle/` folder
4. Apply migration: `pnpm db:migrate`

### Quick Push (Dev Only)

For rapid iteration, push changes directly:
```bash
pnpm db:push
```

**Warning:** This may lose data. Only use in development.

### Migration Files

Generated migrations are in `drizzle/` folder:
```
drizzle/
├── 0000_initial.sql
├── 0001_add_shopping_tables.sql
└── meta/
    └── _journal.json
```

## Database File Location

Development database: `apps/api/data/honeydo.db`

This path is configured via `DATABASE_URL` in `.env`.

## Seeding

```typescript
// apps/api/src/db/seed.ts
import { db } from './index';
import { users, shoppingLists, shoppingItems } from './schema';

async function seed() {
  // Clear existing data
  await db.delete(shoppingItems);
  await db.delete(shoppingLists);

  // Insert test data
  const [list] = await db.insert(shoppingLists)
    .values({
      name: 'Weekly Groceries',
      householdId: 'test-household',
      createdBy: 'test-user',
    })
    .returning();

  await db.insert(shoppingItems)
    .values([
      { listId: list.id, name: 'Milk', category: 'Dairy' },
      { listId: list.id, name: 'Eggs', category: 'Dairy' },
      { listId: list.id, name: 'Bread', category: 'Bakery' },
    ]);

  console.log('Seeding complete!');
}

seed().catch(console.error);
```

Run: `pnpm db:seed`

## Drizzle Studio

Visual database browser:

```bash
pnpm db:studio
```

Opens at http://local.drizzle.studio

## Best Practices

1. **Always use transactions for multi-step operations**
   ```typescript
   await db.transaction(async (tx) => {
     await tx.insert(shoppingLists).values(...);
     await tx.insert(shoppingItems).values(...);
   });
   ```

2. **Use returning() when you need the inserted/updated row**
   ```typescript
   const [item] = await db.insert(...).returning();
   ```

3. **Add indexes for frequently queried columns**
   ```typescript
   listIdIdx: index('items_list_id_idx').on(table.listId)
   ```

4. **Use cascade deletes for child records**
   ```typescript
   .references(() => parent.id, { onDelete: 'cascade' })
   ```

5. **Keep schema files focused** - one file per module/feature

6. **Export everything from index.ts**
   ```typescript
   // schema/index.ts
   export * from './users';
   export * from './shopping-list';
   ```

## Files to Reference

- DB client: `src/db/index.ts`
- Schema exports: `src/db/schema/index.ts`
- Drizzle config: `drizzle.config.ts` (root of api app)
- Type definitions: `packages/shared/src/types/`
