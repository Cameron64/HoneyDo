# Feature 1.1: Project Setup

> Get the monorepo scaffolded and all tooling configured.

## Overview

This feature establishes the foundation of the codebase. When complete, developers can run `pnpm dev` and have both frontend and backend running with hot reload, shared types working across packages, and all linting/formatting enforced.

## Acceptance Criteria

- [ ] Monorepo initialized with pnpm workspaces
- [ ] Turborepo configured for task orchestration
- [ ] TypeScript configured with strict mode
- [ ] ESLint + Prettier configured and enforced
- [ ] Three packages exist: `@honeydo/shared`, `@honeydo/web`, `@honeydo/api`
- [ ] `pnpm dev` starts both apps with hot reload
- [ ] `pnpm build` builds all packages
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Shared types importable from both apps

## Technical Details

### Package Manager: pnpm

Why pnpm over npm/yarn:
- Faster installs via hard links
- Strict dependency resolution (no phantom dependencies)
- Built-in workspace support
- Works well with Turborepo

### Monorepo Tool: Turborepo

Why Turborepo:
- Smart caching (skips unchanged packages)
- Parallel task execution
- Simple configuration
- Good pnpm integration

### Directory Structure

```
honeydo/
├── .github/
│   └── workflows/           # CI (future)
├── .vscode/
│   └── settings.json        # Shared VS Code settings
├── apps/
│   ├── api/                 # Fastify backend
│   │   ├── src/
│   │   │   └── server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   └── App.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   └── shared/              # Shared types & utils
│       ├── src/
│       │   ├── index.ts
│       │   ├── types/
│       │   └── schemas/
│       ├── package.json
│       └── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── package.json             # Root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json       # Shared TS config
└── turbo.json
```

### Configuration Files

#### pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

#### turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

#### tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

#### Root package.json
```json
{
  "name": "honeydo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.3.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

### Package Configurations

#### packages/shared/package.json
```json
{
  "name": "@honeydo/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

#### apps/web/package.json
```json
{
  "name": "@honeydo/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@honeydo/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

#### apps/api/package.json
```json
{
  "name": "@honeydo/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^4.25.0",
    "@honeydo/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0"
  }
}
```

## Implementation Steps

1. **Initialize repository**
   ```bash
   mkdir honeydo && cd honeydo
   pnpm init
   git init
   ```

2. **Create workspace structure**
   ```bash
   mkdir -p apps/web apps/api packages/shared
   ```

3. **Configure pnpm workspace**
   - Create `pnpm-workspace.yaml`
   - Add workspace protocol to package.json

4. **Set up TypeScript**
   - Create `tsconfig.base.json`
   - Create per-package tsconfig files extending base

5. **Set up ESLint + Prettier**
   - Install dependencies
   - Create config files
   - Add lint scripts

6. **Set up Turborepo**
   - Install turbo
   - Create `turbo.json`
   - Configure pipeline

7. **Scaffold shared package**
   - Create package.json
   - Add placeholder types
   - Export from index

8. **Scaffold web app**
   - Initialize Vite + React
   - Configure to use shared package
   - Create minimal App component

9. **Scaffold API app**
   - Initialize Fastify
   - Configure TypeScript
   - Create health check endpoint

10. **Verify everything works**
    - `pnpm install`
    - `pnpm dev` (both apps start)
    - `pnpm build` (builds succeed)
    - `pnpm lint` && `pnpm typecheck` (pass)
    - Import shared type in both apps

## Environment Variables

Create `.env.example` at root:
```env
# API
API_PORT=3001
API_HOST=localhost

# Web
VITE_API_URL=http://localhost:3001

# Database (Feature 3)
DATABASE_URL=./data/honeydo.db

# Clerk (Feature 2)
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Anthropic (Future)
ANTHROPIC_API_KEY=
```

## VS Code Configuration

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## Definition of Done

- [ ] Fresh clone + `pnpm install` works
- [ ] `pnpm dev` starts API on :3001 and web on :5173
- [ ] Hot reload works for both apps
- [ ] Shared types compile and are importable
- [ ] All lint rules pass
- [ ] TypeScript strict mode enabled, no errors
- [ ] README updated with setup instructions

## Dependencies

None - this is the first feature.

## Estimated Complexity

Low-Medium. Mostly configuration, but getting all the pieces to work together can be fiddly.
