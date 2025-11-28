# HoneyDo - Master Plan

> A home that thinks with you, not for you.

## The Vision

HoneyDo is the central nervous system of your household. It's the place you and your wife go to manage the mundane and orchestrate the complex - shopping lists, meal planning, home automation, and whatever life throws at you next. It grows with your needs, learns your patterns, and stays out of the way until you need it.

**The end state**: You open HoneyDo on your phone while at the grocery store. It knows what you need because it's been paying attention - the pantry is low on pasta, you planned tacos for Thursday, and your wife added milk an hour ago. You ask it "what am I forgetting?" and it reminds you about the light bulbs for the garage that burned out last week. When you get home, the porch light is already on because Home Assistant knew you were close.

This isn't a fantasy. It's a platform built module by module, integration by integration, until your home just... works.

---

## Core Philosophy

### 1. Modular, Not Monolithic
Every feature is a module. Modules can be enabled, disabled, or ignored entirely. The shopping list doesn't care if home automation exists. But when both exist, they can talk to each other - "when I mark 'arrived home' in Home Assistant, clear the 'pick up groceries' reminder."

### 2. AI as a Utility, Not a Gimmick
AI isn't a chatbot bolted onto the side. It's plumbing. Every module can ask questions, get suggestions, parse natural language, or generate content through a shared AI service. The shopping list module can understand "we need stuff for tacos" and expand it. The recipe module can suggest meals based on what's about to expire. The AI is the connective tissue.

### 3. Household-First, Not User-First
This is a shared space. Both users see the same shopping list. Both can control the lights. Permissions exist for safety (maybe guests can view but not edit), but the default assumption is collaboration. No "my lists" vs "your lists" - just "our lists."

### 4. Offline-Capable, Cloud-Optional
It runs on your hardware. It works without internet (except for AI features). Your data never leaves your network unless you want it to. Tailscale provides secure access from anywhere without exposing ports to the world.

### 5. Progressive Enhancement
Start simple. Add complexity only when needed. The shopping list doesn't need AI on day one - it needs to let you add "milk" quickly. AI suggestions come later. Google Keep sync comes later. The foundation supports growth, but growth is optional.

---

## User Experience Vision

### The Daily Flow

**Morning**
- Open HoneyDo, greeted by a dashboard showing what matters today
- Quick glance at the shopping list (wife added items overnight)
- Home automation status: everything normal
- AI summary: "You're low on coffee. Want me to add it to the list?"

**During the Day**
- Add items to shopping list via quick-add (voice, text, whatever)
- Wife adds items from her phone - they appear instantly (WebSockets)
- Get a notification: "Motion detected in garage" (Home Assistant)

**Evening**
- Check off items at the store
- Ask AI: "What can we make with what we have?"
- Toggle movie mode from the couch (dims lights, turns on TV)

### The Interface

**Mobile-First, Always**
- Designed for one-handed phone use
- Large touch targets, swipe gestures
- Works beautifully on tablet and desktop too, but phone is primary

**Module Switcher**
- Bottom navigation or sidebar depending on screen size
- Only shows enabled modules
- Quick access to AI assistant from anywhere

**Theming**
- Light/dark mode (system preference + manual toggle)
- Accent color customization
- Possibly seasonal themes for fun

**Shared Visual Language**
- Consistent card-based layouts
- Unified iconography
- Standardized interactions (swipe to delete, long-press for options, etc.)

---

## Technical Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         HoneyDo PWA                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    React + shadcn/ui                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │Shopping │ │ Recipes │ │  Home   │ │ Future  │       │   │
│  │  │  List   │ │         │ │  Auto   │ │ Module  │       │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │   │
│  │       └───────────┴──────────┴───────────┘             │   │
│  │                        │                                │   │
│  │              Shared Service Layer                       │   │
│  │    (Auth, Settings, AI Client, Notifications)          │   │
│  └─────────────────────────┬───────────────────────────────┘   │
└────────────────────────────┼───────────────────────────────────┘
                             │ HTTP / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Node.js Backend                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Gateway                           │   │
│  │         (Express/Fastify + WebSocket Server)            │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────┬───────────┴───────────┬─────────────┐        │
│  │   Module    │     Shared Services   │   Module    │        │
│  │  Handlers   │                       │  Handlers   │        │
│  └──────┬──────┘                       └──────┬──────┘        │
│         │         ┌─────────────┐             │               │
│         │         │    Auth     │ (Clerk)     │               │
│         │         ├─────────────┤             │               │
│         │         │     AI      │ (Anthropic) │               │
│         │         ├─────────────┤             │               │
│         │         │  Settings   │             │               │
│         │         ├─────────────┤             │               │
│         │         │   Events    │ (WebSocket) │               │
│         │         ├─────────────┤             │               │
│         │         │   Google    │ (APIs)      │               │
│         │         ├─────────────┤             │               │
│         │         │ HomeAssist  │             │               │
│         │         └─────────────┘             │               │
│         │                │                    │               │
│         └────────────────┼────────────────────┘               │
│                          ▼                                     │
│                    ┌──────────┐                                │
│                    │  SQLite  │                                │
│                    └──────────┘                                │
└─────────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐       ┌──────────┐
    │  Clerk   │      │ Anthropic│       │  Google  │
    │  (Auth)  │      │   (AI)   │       │  (APIs)  │
    └──────────┘      └──────────┘       └──────────┘
                             │
                             ▼
                    ┌──────────────┐
                    │Home Assistant│
                    │   (Local)    │
                    └──────────────┘
```

### Tech Stack Details

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Monorepo** | pnpm workspaces + Turborepo | Fast, efficient, shared dependencies |
| **Frontend Framework** | React 18+ | Familiar, ecosystem, PWA support |
| **UI Components** | shadcn/ui | Customizable, accessible, Tailwind-native |
| **Styling** | Tailwind CSS | Utility-first, themeable, mobile-friendly |
| **State Management** | Zustand or Jotai | Lightweight, TypeScript-friendly |
| **Backend Framework** | Fastify | Fast, TypeScript-native, plugin system |
| **Database** | SQLite + Drizzle ORM | Simple, file-based, type-safe queries |
| **Auth** | Clerk | OAuth done right, minimal setup |
| **Real-time** | Socket.io | Reliable WebSockets with fallbacks |
| **AI** | Anthropic SDK | Claude for all AI features |
| **Validation** | Zod | Shared schemas frontend/backend |
| **API Contract** | tRPC or REST + OpenAPI | Type-safe API calls |

### Monorepo Structure

```
honeydo/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── docs/
│   ├── PLAN.md
│   └── epics/
├── packages/
│   ├── shared/                 # Shared types, utils, schemas
│   │   ├── src/
│   │   │   ├── types/         # TypeScript types
│   │   │   ├── schemas/       # Zod schemas
│   │   │   └── utils/         # Shared utilities
│   │   └── package.json
│   └── ui/                     # Shared UI components (if needed beyond shadcn)
│       └── package.json
├── apps/
│   ├── web/                    # React PWA
│   │   ├── src/
│   │   │   ├── app/           # Routes/pages
│   │   │   ├── components/    # UI components
│   │   │   ├── modules/       # Module-specific code
│   │   │   │   ├── shopping-list/
│   │   │   │   ├── recipes/
│   │   │   │   └── home-automation/
│   │   │   ├── services/      # API clients, shared services
│   │   │   ├── stores/        # State management
│   │   │   └── hooks/         # Custom hooks
│   │   ├── public/
│   │   └── package.json
│   └── api/                    # Node.js backend
│       ├── src/
│       │   ├── server.ts      # Entry point
│       │   ├── routes/        # API routes
│       │   ├── modules/       # Module-specific handlers
│       │   │   ├── shopping-list/
│       │   │   ├── recipes/
│       │   │   └── home-automation/
│       │   ├── services/      # Shared services
│       │   │   ├── ai.ts
│       │   │   ├── auth.ts
│       │   │   ├── google.ts
│       │   │   ├── homeassistant.ts
│       │   │   └── websocket.ts
│       │   ├── db/            # Database schema, migrations
│       │   └── middleware/    # Auth, logging, etc.
│       └── package.json
└── tools/                      # Scripts, generators
```

---

## Shared Services Deep Dive

### Authentication (Clerk)

**Responsibilities**
- OAuth sign-in (Google primary, others optional)
- Session management
- User metadata storage (role, preferences)
- Webhook handling for user events

**User Roles**
- **Admin**: Full access, can manage other users, toggle modules globally
- **Member**: Full access to enabled modules, can't manage users
- **Guest**: Read-only or limited access (future consideration)

**Data Model**
```
User
├── id (from Clerk)
├── email
├── name
├── role (admin | member | guest)
├── enabledModules[]
├── preferences (JSON - theme, defaults, etc.)
└── createdAt / updatedAt
```

### AI Service (Anthropic)

**Responsibilities**
- Centralized Anthropic client with rate limiting
- Shared conversation context (optional per-module memory)
- Prompt templates for common operations
- Streaming support for real-time responses

**Module Integration Pattern**
```typescript
// Any module can request AI assistance
const ai = useAIService();

// Simple completion
const suggestions = await ai.complete({
  module: 'shopping-list',
  prompt: 'Expand "taco stuff" into specific ingredients',
  context: { currentList: [...] }
});

// Conversational
const response = await ai.chat({
  module: 'recipes',
  message: 'What can I make with chicken and rice?',
  history: conversationHistory
});
```

**AI Capabilities by Module**
| Module | AI Use Cases |
|--------|--------------|
| Shopping List | Expand vague items, suggest missing items, categorize |
| Recipes | Suggest meals, scale recipes, substitutions |
| Home Automation | Natural language commands, routine suggestions |
| Global Assistant | Cross-module queries, general help |

### Settings Service

**Responsibilities**
- User preferences (theme, defaults)
- Module configuration (per-user enable/disable)
- System settings (admin only)
- Settings sync across devices

**Data Model**
```
Settings
├── userId
├── theme (light | dark | system)
├── accentColor
├── modules
│   ├── shoppingList: { enabled, defaultList, ... }
│   ├── recipes: { enabled, ... }
│   └── homeAutomation: { enabled, ... }
└── notifications
    ├── enabled
    ├── pushEnabled
    └── emailEnabled
```

### Real-time Events (WebSocket)

**Responsibilities**
- Push updates when data changes (another user adds to list)
- Module-specific event channels
- Connection state management
- Reconnection with missed event replay

**Event Types**
```typescript
// Shopping List
'shopping:item:added'
'shopping:item:updated'
'shopping:item:removed'
'shopping:list:cleared'

// Home Automation
'home:device:state-changed'
'home:automation:triggered'

// System
'system:settings:updated'
'system:notification'
```

### Google Integration

**Responsibilities**
- OAuth token management (via Clerk or separate)
- Google Keep sync (unofficial API)
- Future: Calendar, Tasks, etc.

**Google Keep Sync Strategy**
- Two-way sync with conflict resolution
- HoneyDo is source of truth
- Periodic sync + manual trigger
- Handle API instability gracefully (it's unofficial)

### Home Assistant Integration

**Responsibilities**
- WebSocket connection to local HA instance
- Entity state subscriptions
- Service calls (turn on light, etc.)
- Automation triggers

**Integration Pattern**
- Connect via HA WebSocket API
- Subscribe to relevant entity changes
- Expose simplified API to frontend
- Cache entity states for quick access

---

## Module System Design

### Module Contract

Every module must implement:

```typescript
interface HoneyDoModule {
  // Metadata
  id: string;                    // 'shopping-list'
  name: string;                  // 'Shopping List'
  description: string;
  icon: string;                  // Lucide icon name
  version: string;

  // Permissions
  requiredPermissions: Permission[];

  // Routes
  routes: ModuleRoute[];         // Frontend routes
  apiRoutes: APIRoute[];         // Backend routes

  // Database
  migrations: Migration[];       // Schema migrations

  // Integration points
  events: EventDefinition[];     // Events this module emits
  subscriptions: string[];       // Events this module listens to

  // AI
  aiCapabilities: AICapability[];

  // Lifecycle
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
}
```

### Module Registration

```typescript
// modules/index.ts
import { shoppingListModule } from './shopping-list';
import { recipesModule } from './recipes';
import { homeAutomationModule } from './home-automation';

export const modules = [
  shoppingListModule,
  recipesModule,
  homeAutomationModule,
] as const;

// Runtime registration
modules.forEach(module => {
  registerRoutes(module.routes);
  registerAPIRoutes(module.apiRoutes);
  registerEvents(module.events);
  subscribeToEvents(module.subscriptions);
});
```

### Module Isolation

- Each module has its own database tables (prefixed)
- Each module has its own state slice
- Modules communicate via events, not direct imports
- Shared services accessed via dependency injection

### Module Communication

```typescript
// Module A emits
eventBus.emit('shopping:list:completed', { listId: '123' });

// Module B subscribes
eventBus.on('shopping:list:completed', async ({ listId }) => {
  // Maybe trigger a recipe suggestion?
  await suggestRecipeFromPurchases(listId);
});
```

---

## Data Model Overview

### Core Tables

```sql
-- Users (synced from Clerk)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- Clerk user ID
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'member',
  preferences JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  key TEXT NOT NULL,
  value JSON NOT NULL,
  UNIQUE(user_id, key)
);

-- Module registry (which modules are globally available)
CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSON
);

-- User module access
CREATE TABLE user_modules (
  user_id TEXT REFERENCES users(id),
  module_id TEXT REFERENCES modules(id),
  enabled BOOLEAN DEFAULT true,
  config JSON,
  PRIMARY KEY (user_id, module_id)
);
```

### Module: Shopping List

```sql
-- Lists
CREATE TABLE shopping_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  is_default BOOLEAN DEFAULT false,
  google_keep_id TEXT,           -- For sync
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Items
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  list_id TEXT REFERENCES shopping_lists(id),
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  checked BOOLEAN DEFAULT false,
  checked_by TEXT REFERENCES users(id),
  added_by TEXT REFERENCES users(id),
  sort_order INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync tracking
CREATE TABLE shopping_sync_log (
  id INTEGER PRIMARY KEY,
  list_id TEXT REFERENCES shopping_lists(id),
  direction TEXT,                -- 'push' | 'pull'
  status TEXT,
  details JSON,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Module: Recipes (Future)

```sql
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  ingredients JSON,              -- Array of { name, amount, unit }
  instructions JSON,             -- Array of steps
  prep_time INTEGER,             -- Minutes
  cook_time INTEGER,
  servings INTEGER,
  tags JSON,                     -- Array of strings
  source_url TEXT,
  image_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  meal_type TEXT,                -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipe_id TEXT REFERENCES recipes(id),
  notes TEXT,
  created_by TEXT REFERENCES users(id)
);
```

### Module: Home Automation (Future)

```sql
-- Cached Home Assistant entities
CREATE TABLE ha_entities (
  entity_id TEXT PRIMARY KEY,
  friendly_name TEXT,
  domain TEXT,                   -- 'light', 'switch', 'sensor', etc.
  state TEXT,
  attributes JSON,
  last_updated DATETIME
);

-- Custom scenes/routines in HoneyDo
CREATE TABLE ha_scenes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  actions JSON,                  -- Array of HA service calls
  created_by TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quick toggles for dashboard
CREATE TABLE ha_favorites (
  id INTEGER PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  entity_id TEXT,
  sort_order INTEGER
);
```

---

## Security Considerations

### Authentication & Authorization
- All API routes require valid Clerk session
- Role-based access enforced at API level
- Module access checked before route handling

### Data Security
- SQLite database file permissions restricted
- No sensitive data in localStorage (tokens in httpOnly cookies via Clerk)
- API keys stored in environment variables, never committed

### Network Security
- Tailscale provides encrypted tunnel
- No ports exposed to public internet
- HTTPS via Tailscale MagicDNS or local cert

### Input Validation
- All inputs validated with Zod schemas
- SQL injection prevented via ORM parameterized queries
- XSS prevented via React's default escaping

---

## Roadmap

### Phase 1: Foundation (Epic 1)
- [ ] Project scaffolding (monorepo, tooling)
- [ ] Basic frontend shell with routing
- [ ] Backend setup with database
- [ ] Clerk authentication integration
- [ ] Settings service
- [ ] WebSocket infrastructure
- [ ] PWA configuration

### Phase 2: Shopping List (Epic 2)
- [ ] List CRUD operations
- [ ] Item management
- [ ] Real-time sync between users
- [ ] Categories and sorting
- [ ] Google Keep sync (unofficial API)
- [ ] AI: item expansion, suggestions

### Phase 3: Home Automation (Epic 3)
- [ ] Home Assistant connection
- [ ] Entity state display
- [ ] Quick toggle controls
- [ ] Custom scenes
- [ ] Dashboard widgets
- [ ] AI: natural language commands

### Phase 4: Recipes (Epic 4)
- [ ] Recipe CRUD
- [ ] Meal planning calendar
- [ ] Shopping list integration
- [ ] Recipe import from URL
- [ ] AI: suggestions, scaling, substitutions

### Phase 5: Polish & Enhancement
- [ ] Offline support (service worker)
- [ ] Push notifications
- [ ] Voice input
- [ ] Widgets / quick actions
- [ ] Performance optimization

---

## Success Metrics

How do we know HoneyDo is working?

1. **Daily Use**: Both users open the app at least once daily
2. **Sync Works**: Items added by one user appear for the other within seconds
3. **AI Adds Value**: AI suggestions are used, not dismissed
4. **Reliability**: 99%+ uptime on local network
5. **Extensibility**: Adding a new module takes hours, not days

---

## Open Questions

1. **State Management**: Zustand vs Jotai vs TanStack Query for server state?
2. **API Style**: tRPC (full type safety) vs REST (simpler, more tooling)?
3. **PWA Framework**: Vite PWA plugin vs Workbox directly?
4. **Testing Strategy**: What level of test coverage? E2E framework?
5. **CI/CD**: GitHub Actions for what? Auto-deploy to home server?

---

## Documentation Index

```
docs/
├── PLAN.md                              # This document
└── epics/
    ├── 1-foundation/
    │   ├── PLAN.md
    │   └── features/
    │       ├── 1-project-setup/
    │       ├── 2-authentication/
    │       ├── 3-database/
    │       ├── 4-api-foundation/
    │       ├── 5-frontend-shell/
    │       ├── 6-websocket/
    │       ├── 7-settings/
    │       └── 8-pwa/
    ├── 2-shopping-list/
    │   ├── PLAN.md
    │   └── features/
    │       ├── 1-list-crud/
    │       ├── 2-item-management/
    │       ├── 3-realtime-sync/
    │       ├── 4-categories/
    │       ├── 5-google-keep-sync/
    │       └── 6-ai-features/
    ├── 3-home-automation/
    │   └── PLAN.md
    └── 4-recipes/
        └── PLAN.md
```

---

*This is a living document. Update it as decisions are made and the vision evolves.*
