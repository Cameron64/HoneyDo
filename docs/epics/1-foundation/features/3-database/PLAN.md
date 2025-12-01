# Feature 1.3: Database

> SQLite + Drizzle ORM. Simple, type-safe, file-based.

## Overview

This feature sets up SQLite as the database with Drizzle ORM for type-safe queries. The database file lives on the local server, making backups trivial (just copy the file). Migrations are managed by Drizzle Kit.

## Acceptance Criteria

- [ ] SQLite database created and accessible
- [ ] Drizzle ORM configured with type inference
- [ ] Core schema defined (users, settings, modules)
- [ ] Migrations system working
- [ ] Seed script for development data
- [ ] Drizzle Studio accessible for debugging
- [ ] Database service injectable in API routes

## Technical Details

### Why SQLite + Drizzle

**SQLite**:
- Zero configuration
- File-based (easy backups)
- Fast for small-medium datasets
- Perfect for local-first apps
- WAL mode for concurrent reads

**Drizzle**:
- Type-safe queries
- SQL-like syntax (not magic)
- Lightweight runtime
- Great migration tooling
- Studio for visual debugging

### Directory Structure

```
apps/api/
├── src/
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   ├── schema/
│   │   │   ├── index.ts      # Export all schemas
│   │   │   ├── users.ts
│   │   │   ├── settings.ts
│   │   │   └── modules.ts
│   │   └── seed.ts           # Development seed data
│   └── ...
├── drizzle/
│   └── migrations/           # Generated migrations
├── drizzle.config.ts
└── data/
    └── honeydo.db            # SQLite database file
```

### Installation

```bash
pnpm add drizzle-orm better-sqlite3 --filter @honeydo/api
pnpm add -D drizzle-kit @types/better-sqlite3 --filter @honeydo/api
```

### Configuration

#### drizzle.config.ts
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data/honeydo.db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

### Database Connection

```typescript
// apps/api/src/db/index.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL ?? './data/honeydo.db');

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

### Core Schema

#### users.ts
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // Clerk user ID
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role', {
    enum: ['admin', 'member', 'guest']
  }).notNull().default('member'),
  preferences: text('preferences', { mode: 'json' }).$type<UserPreferences>(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
}
```

#### settings.ts
```typescript
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

// Global settings (not user-specific)
export const globalSettings = sqliteTable('global_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// User-specific settings
export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.key] }),
}));

export type GlobalSetting = typeof globalSettings.$inferSelect;
export type UserSetting = typeof userSettings.$inferSelect;
```

#### modules.ts
```typescript
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

// Module registry
export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(),                    // 'shopping-list', 'recipes', etc.
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }),
  sortOrder: integer('sort_order').notNull().default(0),
});

// User module access/preferences
export const userModules = sqliteTable('user_modules', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.moduleId] }),
}));

export type Module = typeof modules.$inferSelect;
export type UserModule = typeof userModules.$inferSelect;
```

#### schema/index.ts
```typescript
// Export all schemas
export * from './users';
export * from './settings';
export * from './modules';

// Re-export for relations (if needed later)
```

### Migration Commands

Add to `apps/api/package.json`:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate:sqlite",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push:sqlite",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

### Migration Workflow

1. **Development**: Use `db:push` for quick iteration (applies schema directly)
2. **Production**: Use `db:generate` then `db:migrate` for versioned migrations

### Seed Script

```typescript
// apps/api/src/db/seed.ts
import { db } from './index';
import { users, modules, userModules } from './schema';

async function seed() {
  console.log('Seeding database...');

  // Seed default modules
  await db.insert(modules).values([
    {
      id: 'shopping-list',
      name: 'Shopping List',
      description: 'Shared shopping lists with Google Keep sync',
      icon: 'ShoppingCart',
      enabled: true,
      sortOrder: 1,
    },
    {
      id: 'home-automation',
      name: 'Home Automation',
      description: 'Control your smart home via Home Assistant',
      icon: 'Home',
      enabled: true,
      sortOrder: 2,
    },
    {
      id: 'recipes',
      name: 'Recipes',
      description: 'Recipe book and meal planning',
      icon: 'ChefHat',
      enabled: true,
      sortOrder: 3,
    },
  ]).onConflictDoNothing();

  console.log('Seeding complete!');
}

seed().catch(console.error);
```

### Drizzle Studio

Run `pnpm db:studio` in the api directory to open a visual database browser at `http://localhost:4983`.

### Usage in Routes

```typescript
// Example: Get user by ID
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
});

// Example: Insert new user
await db.insert(users).values({
  id: clerkUserId,
  email: 'user@example.com',
  name: 'John Doe',
});

// Example: Update user
await db.update(users)
  .set({ name: 'Jane Doe', updatedAt: new Date().toISOString() })
  .where(eq(users.id, userId));
```

## Implementation Steps

1. **Install Dependencies**
   - drizzle-orm, better-sqlite3
   - drizzle-kit (dev)

2. **Create Directory Structure**
   - db/ folder with schema, migrations
   - data/ folder for database file

3. **Configure Drizzle**
   - Create drizzle.config.ts
   - Set up database connection

4. **Define Core Schema**
   - users table
   - settings tables
   - modules tables

5. **Set Up Migrations**
   - Generate initial migration
   - Test migration flow

6. **Create Seed Script**
   - Default modules
   - Optional test user (dev only)

7. **Add NPM Scripts**
   - db:generate, db:push, db:migrate
   - db:studio, db:seed

8. **Integrate with API**
   - Export db instance
   - Use in auth webhook (user sync)

9. **Test Queries**
   - Insert, select, update, delete
   - Verify type inference works

10. **Document Backup Strategy**
    - Simple: copy honeydo.db file
    - Can automate later

## Environment Variables

```env
DATABASE_URL=./data/honeydo.db
```

## Backup Strategy

SQLite makes backups trivial:

```bash
# Manual backup
cp data/honeydo.db data/backups/honeydo-$(date +%Y%m%d).db

# Or use SQLite's backup API
sqlite3 data/honeydo.db ".backup 'data/backups/honeydo-backup.db'"
```

Consider automated daily backups (cron job on server).

## Definition of Done

- [ ] Database file created at configured path
- [ ] All core tables exist (users, settings, modules)
- [ ] Migrations generate and apply cleanly
- [ ] Drizzle Studio shows tables and data
- [ ] Seed script populates default modules
- [ ] Type inference works in API routes
- [ ] WAL mode enabled for performance

## Dependencies

- Feature 1.1 (Project Setup) - complete

## Notes

- SQLite doesn't need a separate server process
- WAL mode allows concurrent reads while writing
- Consider adding indexes as queries are identified
- Foreign key constraints enforced by default in better-sqlite3
