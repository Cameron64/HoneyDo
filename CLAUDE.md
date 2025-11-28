# HoneyDo - Claude Code Instructions

## Project Overview

HoneyDo is a modular household management platform for a two-person household. It's a PWA hosted locally, accessible via Tailscale, with modules for shopping lists, recipes, meal planning, and home automation (Home Assistant integration).

**Key Principle**: AI is plumbing, not a gimmick. Every module can leverage AI through a shared service.

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
│   │       │   ├── shopping-list/
│   │       │   ├── recipes/
│   │       │   └── home-automation/
│   │       ├── services/      # API clients
│   │       ├── stores/        # Zustand stores
│   │       └── hooks/         # Custom hooks
│   └── api/                    # Fastify backend
│       └── src/
│           ├── server.ts      # Entry point
│           ├── modules/       # tRPC routers per module
│           ├── services/      # Shared services (ai, auth, ha)
│           ├── db/            # Drizzle schema + migrations
│           └── middleware/
├── packages/
│   ├── shared/                # Types, Zod schemas, utils
│   └── ui/                    # Shared UI components (if needed)
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

## Key Conventions

### File Naming
- Components: `PascalCase.tsx` (e.g., `ShoppingList.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-shopping-list.ts`)
- Utils/services: `kebab-case.ts` (e.g., `ai-service.ts`)
- Types: `kebab-case.types.ts` or in `types/` directory

### Code Patterns

**tRPC Router Definition**:
```typescript
// apps/api/src/modules/shopping-list/router.ts
export const shoppingListRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.shoppingLists.findMany();
  }),

  create: protectedProcedure
    .input(createListSchema)
    .mutation(async ({ ctx, input }) => {
      // implementation
    }),
});
```

**Frontend Query Hook**:
```typescript
// Use tRPC hooks directly
const { data, isLoading } = trpc.shoppingList.getAll.useQuery();
const createMutation = trpc.shoppingList.create.useMutation();
```

**Zod Schema (shared)**:
```typescript
// packages/shared/src/schemas/shopping-list.ts
export const createListSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateListInput = z.infer<typeof createListSchema>;
```

**Drizzle Schema**:
```typescript
// apps/api/src/db/schema/shopping-list.ts
export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

### WebSocket Events
- Namespace: `module:entity:action`
- Examples: `shopping:item:added`, `home:device:state-changed`

### AI Service Usage
```typescript
// Backend
const result = await aiService.complete({
  module: 'shopping-list',
  prompt: 'Expand "taco stuff" into ingredients',
  context: { existingItems: [...] }
});

// For JSON responses
const data = await aiService.json<ExpansionResult>(prompt);
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
| Add new page | `apps/web/src/app/routes/<module>/` |
| Add new component | `apps/web/src/components/` or `apps/web/src/modules/<module>/components/` |
| Add shared type | `packages/shared/src/types/` |
| Add Zod schema | `packages/shared/src/schemas/` |
| Add DB table | `apps/api/src/db/schema/` |
| Add WebSocket event | `apps/api/src/services/websocket.ts` |
