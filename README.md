# HoneyDo

A modular household management platform built as a PWA with AI capabilities.

## Features

- **Modular Architecture** - Add and enable features as needed
- **AI-Powered** - Anthropic integration across all modules
- **Mobile-First** - PWA optimized for any device
- **Self-Hosted** - Run on your own hardware, access via Tailscale
- **Real-time Sync** - Changes sync across devices instantly via WebSocket

## Planned Modules

- Shopping List (with Google Keep sync)
- Home Automation (Home Assistant)
- Recipe Management & Meal Planning

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React 18, Vite, TanStack Router |
| UI | shadcn/ui + Tailwind CSS |
| State | Zustand (client), TanStack Query (server) |
| Backend | Fastify + tRPC |
| Database | SQLite + Drizzle ORM |
| Auth | Clerk (OAuth) |
| Real-time | Socket.io |
| AI | Anthropic Claude SDK |
| Validation | Zod (shared schemas) |

## Getting Started

### Option 1: Docker (Recommended)

The easiest way to run HoneyDo is with Docker Compose, which includes everything:
- HoneyDo API
- HoneyDo Web (PWA)
- Home Assistant

**Prerequisites:**
- Docker and Docker Compose

**Steps:**

1. Clone and configure:
   ```bash
   git clone <repo-url>
   cd honeydo
   cp .env.example .env
   ```

2. Edit `.env` with your Clerk keys and other configuration

3. Start everything:
   ```bash
   docker compose up -d
   ```

4. Access the services:
   - **HoneyDo Web**: http://localhost
   - **HoneyDo API**: http://localhost:3001
   - **Home Assistant**: http://localhost:8123

5. First-time Home Assistant setup:
   - Go to http://localhost:8123
   - Complete the onboarding wizard
   - Create a Long-Lived Access Token (Profile → Long-Lived Access Tokens)
   - Add the token to your `.env` as `HOME_ASSISTANT_TOKEN`
   - Restart the stack: `docker compose restart`

### Option 2: Local Development

**Prerequisites:**

- Node.js 18+
- pnpm 9+
- A Clerk account (for authentication)
- (Optional) Docker for Home Assistant

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd honeydo
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Copy environment files:
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

4. Configure environment variables:
   - Get your Clerk keys from [clerk.com](https://clerk.com)
   - Update `.env` files with your values

5. Create the database directory:
   ```bash
   mkdir -p apps/api/data
   ```

6. Push the database schema:
   ```bash
   pnpm --filter @honeydo/api db:push
   ```

7. Seed the database (optional):
   ```bash
   pnpm --filter @honeydo/api db:seed
   ```

### Development

Start both frontend and backend:
```bash
pnpm dev
```

Or start individually:
```bash
# API (port 3001)
pnpm --filter @honeydo/api dev

# Web (port 5173)
pnpm --filter @honeydo/web dev
```

### Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint on all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm format` | Format code with Prettier |
| `pnpm --filter @honeydo/api db:studio` | Open Drizzle Studio |
| `pnpm --filter @honeydo/api db:push` | Push schema changes |
| `pnpm --filter @honeydo/api db:generate` | Generate migrations |

### Docker Commands

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start all services |
| `docker compose down` | Stop all services |
| `docker compose logs -f` | Follow logs |
| `docker compose logs -f api` | Follow API logs only |
| `docker compose restart` | Restart all services |
| `docker compose build` | Rebuild images |
| `docker compose -f docker-compose.dev.yml up -d` | Start Home Assistant only (for local dev) |

## Project Structure

```
honeydo/
├── apps/
│   ├── api/                 # Fastify backend
│   │   ├── src/
│   │   │   ├── db/         # Database (Drizzle)
│   │   │   ├── modules/    # Feature modules
│   │   │   ├── services/   # Shared services
│   │   │   └── trpc/       # tRPC setup
│   │   └── drizzle/        # Migrations
│   └── web/                 # React frontend
│       └── src/
│           ├── components/ # UI components
│           ├── pages/      # Route pages
│           ├── services/   # API clients
│           └── stores/     # Zustand stores
├── packages/
│   └── shared/             # Shared types & schemas
└── docs/                   # Documentation
```

## Documentation

- [Master Plan](./docs/PLAN.md) - Full project architecture
- [Epic 1: Foundation](./docs/epics/1-foundation/PLAN.md) - Core platform setup
- [Epic 2: Shopping List](./docs/epics/2-shopping-list/PLAN.md) - Shopping module
- [Epic 3: Home Automation](./docs/epics/3-home-automation/PLAN.md) - Home Assistant integration
- [Epic 4: Recipes](./docs/epics/4-recipes/PLAN.md) - Recipe & meal planning

## License

Private project - Not for distribution.
