# HoneyDo Docker - Claude Code Instructions

> Docker Compose setup for running HoneyDo with Home Assistant

## Overview

HoneyDo uses Docker Compose to run a complete stack:
- **API** - Fastify backend (Node.js)
- **Web** - React PWA (nginx)
- **Home Assistant** - Home automation platform

## File Structure

```
honeydo/
├── docker-compose.yml        # Full production stack
├── docker-compose.dev.yml    # Home Assistant only (for local dev)
├── .dockerignore             # Root ignore file
├── .env                      # Environment variables (secrets)
├── docker/
│   └── CLAUDE.md            # This file
├── apps/
│   ├── api/
│   │   ├── Dockerfile       # Multi-stage Node.js build
│   │   └── .dockerignore
│   └── web/
│       ├── Dockerfile       # Multi-stage nginx build
│       ├── nginx.conf       # SPA routing config
│       └── .dockerignore
```

## Docker Compose Files

### `docker-compose.yml` - Full Stack

Use for production or full local testing:

```bash
docker compose up -d
```

**Services:**
| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| `api` | honeydo-api | 3001 | Fastify + tRPC backend |
| `web` | honeydo-web | 80 | React PWA via nginx |
| `homeassistant` | honeydo-homeassistant | 8123 | Home Assistant |

**Volumes:**
| Volume | Purpose |
|--------|---------|
| `honeydo-api-data` | SQLite database |
| `honeydo-ha-config` | Home Assistant config |

**Internal Networking:**
- API connects to HA via `http://homeassistant:8123`
- Web connects to API via `http://api:3001` (build-time)

### `docker-compose.dev.yml` - Development

Use when developing locally with `pnpm dev`:

```bash
docker compose -f docker-compose.dev.yml up -d
```

**Services:**
| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| `homeassistant` | honeydo-homeassistant-dev | 8123 | Home Assistant |

This starts only Home Assistant. Run API and Web locally:
```bash
pnpm dev
```

Then update `apps/api/.env`:
```bash
HOME_ASSISTANT_URL=http://localhost:8123
```

## Dockerfiles

### API Dockerfile (`apps/api/Dockerfile`)

Multi-stage build:
1. **Builder** - Install deps, build TypeScript
2. **Runner** - Production Node.js image

Key features:
- Uses pnpm workspaces (copies full workspace)
- Builds shared package first
- Non-root user (`honeydo`)
- Health check endpoint

```dockerfile
# Build context must be repo root:
docker build -f apps/api/Dockerfile .
```

### Web Dockerfile (`apps/web/Dockerfile`)

Multi-stage build:
1. **Builder** - Install deps, run Vite build
2. **Runner** - nginx with static files

Key features:
- Build-time args for environment variables
- SPA routing via nginx config
- Gzip compression
- Cache headers for static assets

```dockerfile
# Build context must be repo root:
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_URL=http://localhost:3001 \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_... \
  .
```

## Environment Variables

### Required for Docker Compose

Create `.env` in repo root:

```bash
# Authentication (Clerk)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Home Assistant (after initial setup)
HOME_ASSISTANT_TOKEN=<long-lived-access-token>

# Timezone
TZ=America/Denver
```

### How Variables Flow

| Variable | Used By | Set In |
|----------|---------|--------|
| `CLERK_SECRET_KEY` | API runtime | `.env` → docker-compose |
| `CLERK_PUBLISHABLE_KEY` | Web build + API | `.env` → docker-compose |
| `VITE_*` | Web build only | docker-compose build args |
| `HOME_ASSISTANT_TOKEN` | API runtime | `.env` → docker-compose |
| `HOME_ASSISTANT_URL` | API runtime | Hardcoded in docker-compose |

## Common Tasks

### Start Full Stack

```bash
# First time
cp .env.example .env
# Edit .env with your values

docker compose up -d
```

### Rebuild After Code Changes

```bash
docker compose build
docker compose up -d
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f homeassistant
```

### Access Container Shell

```bash
# API container
docker compose exec api sh

# Home Assistant container
docker compose exec homeassistant bash
```

### Reset Everything

```bash
# Stop and remove containers, networks
docker compose down

# Also remove volumes (DATA LOSS!)
docker compose down -v
```

### Check Service Health

```bash
docker compose ps
```

## Home Assistant Setup

### First-Time Setup

1. Start Home Assistant:
   ```bash
   docker compose up -d homeassistant
   ```

2. Open http://localhost:8123

3. Complete onboarding wizard

4. Create Long-Lived Access Token:
   - Click your profile (bottom-left)
   - Scroll to "Long-Lived Access Tokens"
   - Click "Create Token"
   - Name it "HoneyDo"
   - Copy the token (only shown once!)

5. Add token to `.env`:
   ```bash
   HOME_ASSISTANT_TOKEN=<your-token>
   ```

6. Restart stack:
   ```bash
   docker compose restart api
   ```

### HA Configuration Persistence

Home Assistant config is stored in the `honeydo-ha-config` volume.

To backup:
```bash
docker run --rm -v honeydo-ha-config:/config -v $(pwd):/backup alpine \
  tar czf /backup/ha-config-backup.tar.gz -C /config .
```

To restore:
```bash
docker run --rm -v honeydo-ha-config:/config -v $(pwd):/backup alpine \
  tar xzf /backup/ha-config-backup.tar.gz -C /config
```

## Networking

### Internal Network

All services connect via `honeydo-network` bridge:

```
┌─────────────────────────────────────────────────────────┐
│                  honeydo-network                        │
│                                                         │
│  ┌─────────┐    ┌─────────┐    ┌───────────────────┐   │
│  │   web   │───▶│   api   │───▶│  homeassistant    │   │
│  │ :80     │    │ :3001   │    │  :8123            │   │
│  └─────────┘    └─────────┘    └───────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │              │                   │
         ▼              ▼                   ▼
    localhost:80   localhost:3001    localhost:8123
```

### Service Discovery

Services reference each other by name:
- API → HA: `http://homeassistant:8123`
- Web → API: Build-time env var

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
netstat -ano | findstr :3001

# Or on Linux/Mac
lsof -i :3001
```

### Container Won't Start

```bash
# Check logs
docker compose logs api

# Check container status
docker compose ps -a
```

### Database Issues

SQLite database is in the `honeydo-api-data` volume.

To access:
```bash
docker compose exec api sh
# Inside container:
sqlite3 /app/apps/api/data/honeydo.db
```

### Home Assistant Connection Failed

1. Check HA is running:
   ```bash
   docker compose ps homeassistant
   ```

2. Check API can reach HA:
   ```bash
   docker compose exec api wget -qO- http://homeassistant:8123/api/ || echo "Failed"
   ```

3. Check token is set:
   ```bash
   docker compose exec api printenv HOME_ASSISTANT_TOKEN
   ```

## Production Considerations

### Security

- Use Docker secrets for sensitive values (not env vars)
- Enable HTTPS via reverse proxy (Traefik, nginx, Caddy)
- Set `CORS_ORIGIN` to your actual domain

### Performance

- Use multi-core: `docker compose up -d --scale api=2`
- Add Redis for session storage (future)
- Use CDN for static assets

### Monitoring

- Add health checks for all services
- Use `docker compose logs` or ship to logging service
- Monitor with Prometheus + Grafana (future)

## Quick Reference

| Task | Command |
|------|---------|
| Start all | `docker compose up -d` |
| Stop all | `docker compose down` |
| View logs | `docker compose logs -f` |
| Rebuild | `docker compose build && docker compose up -d` |
| HA only (dev) | `docker compose -f docker-compose.dev.yml up -d` |
| Shell into API | `docker compose exec api sh` |
| Check status | `docker compose ps` |
