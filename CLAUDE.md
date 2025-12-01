# HoneyDo - Claude Code Instructions

## Project Overview

HoneyDo is a modular household management platform for a two-person household. It's a PWA hosted locally, accessible via Tailscale, with modules for shopping lists, recipes, meal planning, and home automation (Home Assistant integration).

**Key Principle**: AI is plumbing, not a gimmick. Every module can leverage AI through a shared service.

## Epic Status

| Epic | Status | Completion | Description |
|------|--------|------------|-------------|
| **Epic 1: Foundation** | ✅ Done | 100% | Project setup, auth, database, API, frontend shell, WebSocket, settings, PWA |
| **Epic 2: Shopping List** | ✅ Done | 100% | Lists, items, categories, real-time sync, AI features, undo |
| **Epic 3: Home Automation** | ✅ Done | 100% | HA connection, entity control, favorites, scenes (scheduler pending) |
| **Epic 4: Recipes** | ✅ Done | 100% | Preferences, AI suggestions, meal planning, shopping integration (scheduler pending)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React 18+, Vite, TanStack Router |
| UI | shadcn/ui + Tailwind CSS |
| State | Zustand (client), TanStack Query (server) |
| Backend | Fastify + tRPC |
| Database | SQLite + Drizzle ORM |
| Auth | Clerk (OAuth) |
| Real-time | Socket.io |
| AI | Anthropic Claude SDK |
| Validation | Zod (shared schemas) |

## Monorepo Structure

```
honeydo/
├── apps/
│   ├── web/                    # React PWA (Vite)
│   │   └── src/
│   │       ├── app/           # Routes/pages
│   │       ├── components/    # Shared UI components
│   │       ├── modules/       # Feature modules
│   │       │   ├── shopping/  # Shopping List (Epic 2) ✅
│   │       │   ├── home/      # Home Automation (Epic 3) ✅
│   │       │   └── recipes/   # Recipes & Meal Planning (Epic 4) ✅
│   │       ├── services/      # API clients
│   │       ├── stores/        # Zustand stores
│   │       └── hooks/         # Custom hooks
│   └── api/                    # Fastify backend
│       └── src/
│           ├── server.ts      # Entry point
│           ├── modules/       # tRPC routers per module
│           │   ├── shopping/  # Shopping List (Epic 2) ✅
│           │   ├── home/      # Home Automation (Epic 3) ✅
│           │   └── recipes/   # Recipes & Meal Planning (Epic 4) ✅
│           ├── services/      # Shared services (ai, auth, ha, meal-suggestions)
│           ├── prompts/       # AI system prompts (meal-suggestions.md)
│           ├── db/            # Drizzle schema + migrations
│           └── middleware/
├── packages/
│   └── shared/                # Types, Zod schemas, constants
│       └── src/
│           ├── types/         # TypeScript interfaces
│           ├── schemas/       # Zod validation schemas
│           └── constants/     # Categories, units, etc.
├── data/                      # Local data files
│   └── recipes/               # Recipe history JSON
└── docs/                      # Documentation (plans, epics, features)
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Development (all apps)
pnpm dev

# Development (specific app)
pnpm --filter @honeydo/web dev
pnpm --filter @honeydo/api dev

# Build
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Database
pnpm --filter @honeydo/api db:generate   # Generate migrations
pnpm --filter @honeydo/api db:migrate    # Run migrations
pnpm --filter @honeydo/api db:studio     # Drizzle Studio
```

## Docker Commands

```bash
# Start full stack (API + Web + Home Assistant)
docker compose up -d

# Start Home Assistant only (for local dev)
docker compose -f docker-compose.dev.yml up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f
docker compose logs -f api        # API logs only
docker compose logs -f homeassistant  # HA logs only

# Rebuild after code changes
docker compose build
docker compose up -d

# Full rebuild (no cache)
docker compose build --no-cache
```

## Key Conventions

### File Naming
- Components: `PascalCase.tsx` (e.g., `ShoppingList.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-shopping-list.ts`)
- Utils/services: `kebab-case.ts` (e.g., `ai-service.ts`)
- Types: `kebab-case.types.ts` or in `types/` directory

### Code Patterns

**tRPC Router Definition** (multi-router pattern for larger modules):
```typescript
// apps/api/src/modules/shopping/router.ts (3-router pattern)
export const shoppingRouter = router({
  lists: listsRouter,    // List CRUD
  items: itemsRouter,    // Item operations
  ai: aiRouter,          // AI features
});

// apps/api/src/modules/home/router.ts (5-router pattern)
export const homeRouter = router({
  config: configRouter,      // HA connection config (admin)
  entities: entitiesRouter,  // Entity queries
  actions: actionsRouter,    // Device control
  favorites: favoritesRouter,// User favorites
  scenes: scenesRouter,      // Custom scenes
});

// apps/api/src/modules/recipes/router.ts (5-router pattern)
export const recipesRouter = router({
  preferences: preferencesRouter,  // User meal preferences
  suggestions: suggestionsRouter,  // AI meal suggestions
  meals: mealsRouter,              // Accepted meals (calendar)
  shopping: shoppingRouter,        // Ingredient aggregation
  schedule: scheduleRouter,        // Auto-suggestion scheduling
});

// Usage:
trpc.shopping.lists.getDefault.useQuery();
trpc.shopping.items.add.useMutation();
trpc.home.config.getStatus.useQuery();
trpc.home.actions.toggle.useMutation();
trpc.recipes.preferences.get.useQuery();
trpc.recipes.suggestions.request.useMutation();
```

**Frontend Query Hook with Real-time Sync**:
```typescript
// Use tRPC hooks with WebSocket sync
const { data: list } = trpc.shopping.lists.getDefault.useQuery();
useShoppingSync({ listId: list?.id }); // Sets up WebSocket listeners

const checkItem = trpc.shopping.items.check.useMutation({
  onMutate: async ({ id, checked }) => {
    // Optimistic update
    utils.shopping.lists.getById.setData({ id: listId }, (old) => ({
      ...old!,
      items: old!.items.map((item) =>
        item.id === id ? { ...item, checked } : item
      ),
    }));
  },
});
```

**Zod Schema (shared)**:
```typescript
// packages/shared/src/schemas/shopping.ts
export const createShoppingItemSchema = z.object({
  listId: z.string(),
  name: z.string().min(1, 'Item name is required').max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  category: shoppingCategorySchema.optional(), // From constants
  note: z.string().max(500).optional(),
});

export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
```

**Drizzle Schema with Relations**:
```typescript
// apps/api/src/db/schema/shopping.ts
export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').$type<ShoppingCategoryId>(),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  checkedBy: text('checked_by').references(() => users.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// apps/api/src/db/schema/home-automation.ts
export const haEntities = sqliteTable('ha_entities', {
  entityId: text('entity_id').primaryKey(),       // e.g., "light.living_room"
  domain: text('domain').notNull(),               // e.g., "light"
  friendlyName: text('friendly_name'),
  state: text('state').notNull(),                 // e.g., "on", "off", "unavailable"
  attributes: text('attributes', { mode: 'json' }),// JSON object
  areaId: text('area_id'),
  lastChanged: text('last_changed'),
  lastUpdated: text('last_updated'),
}, (table) => ({
  domainIdx: index('idx_ha_entities_domain').on(table.domain),
}));

export const haScenes = sqliteTable('ha_scenes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  icon: text('icon'),
  description: text('description'),
  actions: text('actions', { mode: 'json' }).notNull(), // Array of service calls
  createdBy: text('created_by').notNull().references(() => users.id),
  isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

### WebSocket Events
- Namespace: `module:entity:action`
- Examples: `shopping:item:added`, `shopping:item:checked`, `home:entity:state-changed`

**Emitting Events (backend)**:
```typescript
socketEmitter.toOthers(ctx.userId, 'shopping:item:added', item);
socketEmitter.broadcast('home:entity:state-changed', { entityId, state, attributes });
```

**Handling Events (frontend)**:
```typescript
useSocketEvent('shopping:item:added', handleItemAdded);
useSocketEvent('home:entity:state-changed', handleStateChanged);
```

**Home Automation WebSocket Events**:
```typescript
// Connection status
'home:connection:status'     // { connected: boolean, error?: string }

// Entity state changes (from Home Assistant)
'home:entity:state-changed'  // { entityId, oldState, newState, attributes }

// Action execution
'home:action:executed'       // { entityId, service, status, error? }

// Scene events
'home:scene:activated'       // { sceneId, activatedBy }
'home:scene:created'         // HAScene
'home:scene:updated'         // HAScene
'home:scene:deleted'         // { id }
```

### AI Service Usage
```typescript
// Backend - currently rule-based, ready for Anthropic SDK
const result = await aiService.expandItem(itemName, existingItems);
// Returns: [{ name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' }, ...]

const category = await aiService.categorizeItem('milk');
// Returns: 'dairy'
```

### Home Automation Patterns

**Supported Domains**:
```typescript
// Controllable (can call services)
const CONTROLLABLE_DOMAINS = ['light', 'switch', 'fan', 'climate', 'lock', 'cover'];

// Read-only (display only)
const READONLY_DOMAINS = ['sensor', 'binary_sensor'];

// Sensitive (require confirmation)
const SENSITIVE_DOMAINS = ['lock', 'cover']; // Garage doors, door locks
```

**Entity Control Actions**:
```typescript
// Generic service call
trpc.home.actions.callService.useMutation();
// Input: { entityId, service: 'turn_on' | 'turn_off' | 'toggle', data?: {} }

// Quick toggle (lights, switches)
trpc.home.actions.toggle.useMutation();
// Input: { entityId }

// Light brightness (0-255)
trpc.home.actions.setBrightness.useMutation();
// Input: { entityId, brightness }

// Climate temperature
trpc.home.actions.setTemperature.useMutation();
// Input: { entityId, temperature, hvacMode? }

// Lock control (requires confirmation)
trpc.home.actions.setLockState.useMutation();
// Input: { entityId, locked, confirmed: true }
```

**Custom Scenes**:
```typescript
// Scene with multiple actions
const scene = {
  name: 'Movie Night',
  icon: 'mdi:movie',
  actions: [
    { entityId: 'light.living_room', service: 'turn_on', data: { brightness: 50 } },
    { entityId: 'light.kitchen', service: 'turn_off' },
    { entityId: 'switch.tv', service: 'turn_on' },
  ],
};

// Activate scene
trpc.home.scenes.activate.useMutation();
// Executes all actions in sequence
```

**Admin vs Protected Procedures**:
```typescript
// Admin-only (connection config)
adminProcedure  // For: configure, disconnect, reconnect

// Protected (user actions)
protectedProcedure  // For: toggle, favorites, scenes
```

## Important Files

- `docs/PLAN.md` - Master plan with full architecture
- `docs/epics/*/PLAN.md` - Epic-level plans
- `docs/epics/*/features/*/PLAN.md` - Feature specs with code examples
- `apps/api/src/db/schema/` - Database schemas
- `packages/shared/src/schemas/` - Zod validation schemas
- `apps/web/src/modules/` - Frontend module code

## Module System

Modules are self-contained but can communicate via events:

```typescript
// Emit
eventBus.emit('shopping:list:completed', { listId });

// Subscribe
eventBus.on('shopping:list:completed', handler);
```

Each module has:
- Database tables (prefixed by module)
- tRPC router
- Frontend routes
- Zustand store slice
- Event definitions

## Database

- **ORM**: Drizzle with SQLite
- **IDs**: Use `nanoid()` for primary keys
- **Timestamps**: Store as ISO strings (`text` type)
- **JSON**: Use `text` with JSON serialization for complex data

## Auth Context

- Clerk handles OAuth (Google primary)
- `ctx.userId` available in all protected procedures
- Roles: `admin`, `member`, `guest`
- Module access checked via `user_modules` table

## Styling

- Tailwind CSS with shadcn/ui components
- Mobile-first design (phone is primary device)
- Support light/dark themes via CSS variables
- Use `cn()` helper for conditional classes

## Testing

- Unit tests: Vitest
- Component tests: Testing Library
- E2E: Playwright (future)
- Test files: `*.test.ts` or `*.spec.ts` alongside source

## Things to Avoid

1. **Don't** import directly between modules - use events
2. **Don't** store sensitive data in localStorage
3. **Don't** expose API keys in frontend code
4. **Don't** use raw SQL - always use Drizzle
5. **Don't** skip Zod validation on API inputs
6. **Don't** create new modules without updating `docs/`

## Documentation First

Before implementing a feature:
1. Check if a plan exists in `docs/epics/*/features/`
2. Follow the technical details and code patterns in the plan
3. Update the plan if implementation differs significantly

## Environment Variables

```bash
# apps/api/.env
DATABASE_URL=./data/honeydo.db
CLERK_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=...

# apps/web/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Quick Reference

| Task | Location |
|------|----------|
| Add new tRPC route | `apps/api/src/modules/<module>/router.ts` |
| Add new page | `apps/web/src/pages/` + update `router.tsx` |
| Add new component | `apps/web/src/components/` or `apps/web/src/modules/<module>/components/` |
| Add shared type | `packages/shared/src/types/` |
| Add Zod schema | `packages/shared/src/schemas/` |
| Add DB table | `apps/api/src/db/schema/` |
| Add WebSocket event | `apps/api/src/services/websocket/` |

## Detailed Documentation

This project has comprehensive Claude instruction files throughout the codebase. Use these for detailed patterns and examples:

### Core Documentation

| Area | Location | Purpose |
|------|----------|---------|
| **API Backend** | `apps/api/CLAUDE.md` | Fastify, tRPC, services |
| **Database** | `apps/api/src/db/CLAUDE.md` | Drizzle ORM patterns |
| **Modules (API)** | `apps/api/src/modules/CLAUDE.md` | Creating new modules |
| **Web Frontend** | `apps/web/CLAUDE.md` | React, routing, state |
| **Components** | `apps/web/src/components/CLAUDE.md` | UI component patterns |
| **Modules (Web)** | `apps/web/src/modules/CLAUDE.md` | Frontend module organization |
| **Shared Package** | `packages/shared/CLAUDE.md` | Types, Zod schemas |
| **Schemas** | `packages/shared/src/schemas/CLAUDE.md` | Zod schema patterns |
| **Constants** | `packages/shared/src/constants/CLAUDE.md` | Category/unit constants |
| **Documentation** | `docs/CLAUDE.md` | Doc structure, standards |
| **Docker** | `docker/CLAUDE.md` | Container setup, compose files |

### Epic 2 (Shopping) Documentation

| Area | Location | Purpose |
|------|----------|---------|
| **Backend Module** | `apps/api/src/modules/shopping/CLAUDE.md` | API routes, WebSocket, AI |
| **Frontend Module** | `apps/web/src/modules/shopping/CLAUDE.md` | Components, hooks, stores |

### Epic 3 (Home Automation) Documentation

| Area | Location | Purpose |
|------|----------|---------|
| **Backend Module** | `apps/api/src/modules/home/CLAUDE.md` | HA connection, entity control, scenes, AI |
| **Frontend Module** | `apps/web/src/modules/home/CLAUDE.md` | Entity cards, favorites, scene management |

### Epic 4 (Recipes) Documentation

| Area | Location | Purpose |
|------|----------|---------|
| **Backend Module** | `apps/api/src/modules/recipes/CLAUDE.md` | Preferences, suggestions, meals, Claude skill integration |
| **Frontend Module** | `apps/web/src/modules/recipes/CLAUDE.md` | Preferences UI, suggestion workflow, meal calendar |

### When to Use Each File

- **Starting a new module?** → Read `apps/api/src/modules/CLAUDE.md` first, then see `shopping/CLAUDE.md` or `home/CLAUDE.md` as examples
- **Adding a database table?** → Read `apps/api/src/db/CLAUDE.md`
- **Creating React components?** → Read `apps/web/src/components/CLAUDE.md` and module-specific CLAUDE.md
- **Adding types/validation?** → Read `packages/shared/CLAUDE.md` and `packages/shared/src/schemas/CLAUDE.md`
- **Adding constants?** → Read `packages/shared/src/constants/CLAUDE.md`
- **Need tRPC examples?** → Read `apps/api/CLAUDE.md` and module-specific CLAUDE.md files
- **Need WebSocket sync examples?** → Read `apps/web/src/modules/shopping/CLAUDE.md` or `home/CLAUDE.md`
- **Need routing/state examples?** → Read `apps/web/CLAUDE.md`
- **Working with Home Assistant?** → Read `apps/api/src/modules/home/CLAUDE.md` for integration patterns
- **Need device control patterns?** → Read `apps/web/src/modules/home/CLAUDE.md` for entity cards and actions
- **Working with recipes/meal planning?** → Read `apps/api/src/modules/recipes/CLAUDE.md` for AI suggestion patterns
- **Need Claude skill integration?** → Read `apps/api/src/modules/recipes/CLAUDE.md` for headless CLI patterns
- **Docker setup or deployment?** → Read `docker/CLAUDE.md` for container configuration
