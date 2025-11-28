# Epic 1: Foundation

> Build the bones. Everything else stands on this.

## Overview

The Foundation epic establishes the core platform that all modules will build upon. This isn't about features users will directly interact with (except auth) - it's about creating a solid, extensible base that makes future development fast and reliable.

**When this epic is complete**, you'll have:
- A working monorepo with frontend and backend apps
- User authentication via Clerk
- A SQLite database with migrations
- Real-time WebSocket infrastructure
- A settings system
- PWA capability (installable, offline shell)
- The module system framework (even if no modules yet)

---

## Goals

1. **Developer Experience First** - Hot reload, type safety, clear project structure
2. **Production-Ready from Day One** - No "we'll fix it later" shortcuts
3. **Module System Ready** - Even before modules exist, the patterns are in place
4. **Minimal but Complete** - Only what's needed, but everything that's needed

---

## Non-Goals (for this epic)

- Any actual modules (shopping list, etc.)
- AI integration (service stub only)
- Google integration
- Home Assistant integration
- Complex theming (basic light/dark is fine)

---

## Technical Decisions

### Confirmed
| Decision | Choice | Notes |
|----------|--------|-------|
| Monorepo tool | pnpm + Turborepo | Fast, good caching |
| Frontend | React + Vite | Fast dev, good PWA plugins |
| UI Library | shadcn/ui + Tailwind | Customizable, accessible |
| Backend | Fastify | TypeScript-native, fast, plugins |
| Database | SQLite + Drizzle | Simple, type-safe |
| Auth | Clerk | OAuth, minimal setup |
| Real-time | Socket.io | Reliable, fallbacks |
| Validation | Zod | Shared schemas |

### To Decide
| Decision | Options | Recommendation |
|----------|---------|----------------|
| State management | Zustand / Jotai / TanStack Query | TanStack Query for server state, Zustand for UI state |
| API style | tRPC / REST | tRPC - full type safety across the stack |
| Routing | React Router / TanStack Router | TanStack Router - type-safe, file-based option |

---

## Architecture

### Package Structure

```
honeydo/
├── package.json              # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── packages/
│   └── shared/               # @honeydo/shared
│       ├── src/
│       │   ├── schemas/      # Zod schemas (used by both apps)
│       │   ├── types/        # TypeScript types
│       │   └── utils/        # Shared utilities
│       └── package.json
├── apps/
│   ├── web/                  # @honeydo/web
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── app/          # Routes
│   │   │   ├── components/   # Shared components
│   │   │   ├── modules/      # Module UI (empty for now)
│   │   │   ├── services/     # API client, socket client
│   │   │   ├── stores/       # Zustand stores
│   │   │   └── hooks/
│   │   ├── public/
│   │   │   └── manifest.json
│   │   └── package.json
│   └── api/                  # @honeydo/api
│       ├── src/
│       │   ├── server.ts     # Entry point
│       │   ├── routes/       # API routes
│       │   ├── modules/      # Module handlers (empty for now)
│       │   ├── services/     # Shared services
│       │   │   ├── auth.ts
│       │   │   ├── db.ts
│       │   │   ├── websocket.ts
│       │   │   └── ai.ts     # Stub only
│       │   ├── db/
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   └── middleware/
│       └── package.json
└── tools/
    └── scripts/
```

### Data Flow

```
┌─────────────┐     tRPC/HTTP      ┌─────────────┐
│   React     │◄──────────────────►│   Fastify   │
│   (Vite)    │                    │   (Node)    │
│             │◄──────────────────►│             │
└─────────────┘    Socket.io       └──────┬──────┘
       │                                  │
       │                                  ▼
       │                           ┌─────────────┐
       └─────── Clerk SDK ────────►│   Clerk     │
                                   └─────────────┘
                                          │
                                   ┌──────┴──────┐
                                   ▼             ▼
                              ┌────────┐   ┌─────────┐
                              │ SQLite │   │ Webhooks│
                              └────────┘   └─────────┘
```

---

## Features Breakdown

### Feature 1: Project Setup
**Goal**: Scaffolded monorepo with all tooling configured

- Initialize pnpm workspace
- Configure Turborepo
- Set up TypeScript configs (base + per-app)
- Configure ESLint + Prettier
- Create shared package
- Create web app skeleton (Vite + React)
- Create api app skeleton (Fastify)
- Verify cross-package imports work
- Add scripts: dev, build, lint, typecheck

**Acceptance Criteria**:
- `pnpm dev` starts both apps
- `pnpm build` builds both apps
- Shared types are importable from both apps

---

### Feature 2: Authentication
**Goal**: Users can sign in via Google OAuth, sessions are managed

- Set up Clerk application
- Install Clerk React SDK in web app
- Install Clerk Node SDK in api app
- Create sign-in/sign-up pages
- Protect routes (frontend)
- Create auth middleware (backend)
- Sync user data to local database on first login
- Set up Clerk webhooks for user events

**Acceptance Criteria**:
- User can sign in with Google
- Protected pages redirect to sign-in
- API routes reject unauthenticated requests
- User record created in SQLite after first login

---

### Feature 3: Database
**Goal**: SQLite database with Drizzle ORM, migrations working

- Install Drizzle ORM + SQLite driver (better-sqlite3)
- Create database connection service
- Define core schema (users, settings, modules, user_modules)
- Set up migration system
- Create seed script for development
- Add database scripts: migrate, generate, studio

**Acceptance Criteria**:
- Migrations run on app start (or via script)
- Drizzle Studio accessible for debugging
- User record can be created/queried

---

### Feature 4: API Foundation
**Goal**: Fastify server with tRPC, ready for module routes

- Set up Fastify with TypeScript
- Configure CORS for local development
- Install and configure tRPC adapter
- Create base router structure
- Create context with auth + db
- Add health check endpoint
- Set up error handling
- Create module router registration pattern

**Acceptance Criteria**:
- Server starts and responds to health check
- tRPC routes are type-safe end-to-end
- Auth context available in all procedures
- Clear pattern for adding module routers

---

### Feature 5: Frontend Shell
**Goal**: React app with routing, layout, and navigation

- Set up TanStack Router (or React Router)
- Create app layout (header, nav, content area)
- Create placeholder pages: Home, Settings, 404
- Set up shadcn/ui
- Configure Tailwind with custom theme
- Create base components: Button, Card, Input, etc.
- Implement responsive navigation (bottom nav on mobile, sidebar on desktop)
- Add loading states and error boundaries

**Acceptance Criteria**:
- App renders with navigation
- Routes work (/, /settings, 404 for unknown)
- UI components render correctly
- Responsive layout works on mobile and desktop

---

### Feature 6: WebSocket Infrastructure
**Goal**: Real-time event system for live updates

- Install Socket.io (server + client)
- Create WebSocket service on backend
- Integrate with Fastify
- Add authentication to socket connections
- Create event emitter/subscriber pattern
- Create React hook for socket connection
- Handle reconnection gracefully
- Create connection status indicator

**Acceptance Criteria**:
- Client connects to WebSocket on app load
- Only authenticated users can connect
- Events can be emitted from server, received on client
- Connection status visible in UI

---

### Feature 7: Settings Service
**Goal**: User preferences stored and synced

- Create settings schema (theme, notifications, module configs)
- Create settings tRPC routes (get, update)
- Create settings store on frontend
- Create Settings page UI
- Implement theme switching (light/dark/system)
- Sync settings on login
- Broadcast setting changes via WebSocket

**Acceptance Criteria**:
- User can change theme, it persists
- Settings page shows all options
- Changes sync across devices (via WebSocket)

---

### Feature 8: PWA Configuration
**Goal**: App is installable and has offline shell

- Configure vite-plugin-pwa
- Create manifest.json with icons
- Set up service worker for shell caching
- Add install prompt
- Handle offline state gracefully
- Test installation on mobile

**Acceptance Criteria**:
- App can be installed on phone/desktop
- Installed app loads shell even offline
- Offline indicator shows when disconnected

---

## Module System (Preparation)

Even though no modules are built yet, the patterns should be in place:

### Backend Module Pattern
```typescript
// apps/api/src/modules/example/index.ts
import { router } from '../../trpc';
import { exampleRouter } from './router';

export const exampleModule = {
  id: 'example',
  name: 'Example Module',
  router: exampleRouter,
  // migrations, events, etc.
};
```

### Frontend Module Pattern
```typescript
// apps/web/src/modules/example/index.ts
export const exampleModule = {
  id: 'example',
  name: 'Example Module',
  icon: 'Package',
  routes: [
    { path: '/example', component: ExamplePage },
  ],
};
```

### Registration
```typescript
// apps/api/src/modules/index.ts
export const modules = [
  // exampleModule,
] as const;

// Modules are registered at startup
// Routes, events, and migrations are auto-discovered
```

---

## Definition of Done

This epic is complete when:

- [ ] `pnpm dev` starts the full stack
- [ ] User can sign in with Google and see their name
- [ ] Database has core tables and migrations work
- [ ] tRPC routes are fully typed end-to-end
- [ ] Settings page allows theme switching
- [ ] WebSocket connection is established and authenticated
- [ ] App is installable as PWA
- [ ] Module system patterns are documented and ready
- [ ] All code passes lint and typecheck
- [ ] Basic README updated with setup instructions

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Clerk complexity | Medium | Start with basic OAuth only, add features later |
| tRPC learning curve | Low | Good docs, type errors guide you |
| PWA service worker bugs | Medium | Test early, use established plugin |
| SQLite limitations | Low | Fine for this scale, can migrate later if needed |

---

## Dependencies

- Clerk account (free tier is fine)
- Node.js 18+
- pnpm installed globally

---

## Features Index

```
docs/epics/1-foundation/features/
├── 1-project-setup/PLAN.md
├── 2-authentication/PLAN.md
├── 3-database/PLAN.md
├── 4-api-foundation/PLAN.md
├── 5-frontend-shell/PLAN.md
├── 6-websocket/PLAN.md
├── 7-settings/PLAN.md
└── 8-pwa/PLAN.md
```

---

*This epic should be completed before any modules are built.*
