# HoneyDo - Master Plan

## Vision
A modular, extensible household management platform accessible to family members. Built as a PWA with AI capabilities woven throughout, designed to grow with evolving needs.

## Architecture Overview

| Layer | Technology |
|-------|------------|
| **Frontend** | React PWA + Tailwind + shadcn/ui |
| **Backend** | Node.js |
| **Database** | SQLite |
| **Auth** | Clerk (OAuth) |
| **Real-time** | WebSockets |
| **AI** | Anthropic API |
| **Hosting** | Local server via Tailscale |
| **Structure** | Monorepo |

## Core Principles

1. **Modular by Design** - Features are self-contained modules that can be enabled/disabled per user
2. **Shared Services** - Common infrastructure (auth, AI, notifications, settings) available to all modules
3. **Mobile-First** - PWA optimized for phone/tablet use
4. **AI-Native** - Every module can leverage AI through a unified interface
5. **Permission-Based** - Role-based access control for users and modules

## Shared Services

- **Authentication** - Clerk OAuth integration
- **AI Service** - Anthropic API wrapper available to all modules
- **Settings** - User preferences, module toggles, theming
- **Notifications** - System-wide notification service
- **WebSocket Hub** - Real-time event distribution
- **Google Integration** - Shared Google API client (Keep, Tasks, Calendar, etc.)
- **Home Assistant** - Smart home integration layer

## Epics

| # | Epic | Status | Description |
|---|------|--------|-------------|
| 1 | Foundation | Planned | Core platform, auth, shared services |
| 2 | Shopping List | Planned | First module - list management with Google Keep sync |
| 3 | Home Automation | Future | Home Assistant integration |
| 4 | Recipes | Future | Recipe management and meal planning |

## Documentation Structure

```
/docs
  PLAN.md                          # This file - master plan
  /epics
    /{epicNumber}-{epicName}/
      PLAN.md                      # Epic overview and goals
      /features
        /{featureNumber}-{featureName}/
          PLAN.md                  # Feature specification
```
