# HoneyDo

A modular household management platform built as a PWA with AI capabilities.

## Features

- **Modular Architecture** - Add and enable features as needed
- **AI-Powered** - Anthropic integration across all modules
- **Mobile-First** - PWA optimized for any device
- **Self-Hosted** - Run on your own hardware, access via Tailscale
- **Real-time Sync** - Changes sync across devices instantly via WebSocket

## Modules

- **Shopping List** - Collaborative shopping lists with AI categorization
- **Home Automation** - Home Assistant integration for device control
- **Recipe Management** - AI-powered meal suggestions and planning

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

## Environments

HoneyDo supports separate development and production environments:

| Environment | Web | API | Database |
|-------------|-----|-----|----------|
| **Development** | `http://localhost:5173` (local) or `:8080` (Docker) | `http://...:3001` | `docker/data/dev/` |
| **Production** | `https://...:8443` (HTTPS) | `https://...:3001` (HTTPS) | `docker/data/prod/` |

## Getting Started

### Prerequisites

- Docker and Docker Compose
- (For local dev) Node.js 20+, pnpm 9+

### Quick Start (Development)

1. Clone and configure:
   ```bash
   git clone <repo-url>
   cd honeydo
   cp .env.example .env
   # Edit .env with your Clerk keys, Anthropic API key, etc.
   ```

2. Start the development stack:
   ```bash
   pnpm docker:dev
   # Or: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

3. Access the services:
   - **Web**: http://localhost:8080
   - **API**: http://localhost:3001
   - **Home Assistant**: http://localhost:8123

### Production Deployment

Production uses HTTPS with Tailscale certificates for PWA support.

1. Create production secrets:
   ```bash
   cp docker/secrets/.env.prod.example docker/secrets/.env.prod
   # Edit with production secrets (Clerk keys, Anthropic API key, etc.)
   ```

2. Generate Tailscale certificates (for HTTPS):
   ```bash
   tailscale cert <your-hostname>.ts.net
   # Move certs to ./certs/ directory
   ```

3. Build and deploy:
   ```bash
   # Build with secrets
   docker compose --env-file docker/secrets/.env.prod \
     -f docker-compose.yml -f docker-compose.prod.yml build

   # Start production
   docker compose --env-file docker/secrets/.env.prod \
     -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

4. Access production:
   - **Web**: https://your-hostname.ts.net:8443
   - **API**: https://your-hostname.ts.net:3001

### Local Development (Without Docker)

For faster iteration, run API and Web locally with only Home Assistant in Docker:

```bash
# Start Home Assistant
docker compose -f docker-compose.dev.yml up homeassistant -d

# Install dependencies
pnpm install

# Start dev servers
pnpm dev
```

Access at http://localhost:5173

## Docker Commands

| Command | Description |
|---------|-------------|
| `pnpm docker:dev` | Start development stack |
| `pnpm docker:prod` | Start production stack |
| `docker compose down` | Stop all services |
| `docker compose logs -f api` | Follow API logs |
| `docker compose logs -f web` | Follow web logs |

### Rebuilding

```bash
# Development
docker compose -f docker-compose.yml -f docker-compose.dev.yml build

# Production (with secrets for build args)
docker compose --env-file docker/secrets/.env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
```

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps locally |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm --filter @honeydo/api db:studio` | Open Drizzle Studio |
| `pnpm --filter @honeydo/api db:push` | Push schema changes |

## Project Structure

```
honeydo/
├── apps/
│   ├── api/                 # Fastify backend
│   │   ├── src/
│   │   │   ├── db/         # Database (Drizzle)
│   │   │   ├── modules/    # Feature modules
│   │   │   ├── services/   # AI, WebSocket, Home Assistant
│   │   │   └── trpc/       # tRPC setup
│   │   └── Dockerfile
│   └── web/                 # React PWA
│       ├── src/
│       │   ├── components/ # UI components
│       │   ├── modules/    # Feature modules
│       │   └── services/   # Socket client
│       ├── Dockerfile
│       └── nginx-ssl.conf  # Production HTTPS config
├── packages/
│   └── shared/             # Shared types & Zod schemas
├── docker/
│   ├── data/               # Persistent data (dev/prod separated)
│   └── secrets/            # Production secrets (git-ignored)
├── certs/                  # SSL certificates (git-ignored)
├── docker-compose.yml      # Base configuration
├── docker-compose.dev.yml  # Development overrides
└── docker-compose.prod.yml # Production overrides
```

## Environment Files

| File | Purpose | Git |
|------|---------|-----|
| `.env` | Root env vars for local dev | Ignored |
| `.env.development` | Dev defaults template | Tracked |
| `.env.production` | Prod config template (no secrets) | Tracked |
| `docker/secrets/.env.prod` | Production secrets | Ignored |
| `apps/api/.env` | API-specific vars (local dev) | Ignored |
| `apps/web/.env` | Web-specific vars (local dev) | Ignored |

## Home Assistant Setup

1. Access Home Assistant at http://localhost:8123
2. Complete the onboarding wizard
3. Create a Long-Lived Access Token:
   - Profile (bottom-left) → Long-Lived Access Tokens → Create Token
4. Add to your `.env` or `docker/secrets/.env.prod`:
   ```
   HOME_ASSISTANT_TOKEN=<your-token>
   ```
5. Restart the API: `docker compose restart api`

## Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions
- [docs/](./docs/) - Feature documentation and plans

## License

Private project - Not for distribution.
