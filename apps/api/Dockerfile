# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace config files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy api app
COPY apps/api/ ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package first, then api
RUN pnpm --filter @honeydo/shared build
RUN pnpm --filter @honeydo/api build

# Production stage
FROM node:20-alpine AS runner

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 honeydo

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy packages (needed for workspace resolution)
COPY packages/ ./packages/

# Copy built api
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Create data directory for SQLite
RUN mkdir -p /app/apps/api/data && chown -R honeydo:nodejs /app/apps/api/data

USER honeydo

WORKDIR /app/apps/api

EXPOSE 3001

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

CMD ["node", "dist/server.js"]
