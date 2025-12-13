# Production stage - run TypeScript directly with tsx
FROM node:20-alpine

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
COPY tsconfig.base.json ./

# Copy packages
COPY packages/ ./packages/

# Copy api source
COPY apps/api/ ./apps/api/

# Copy MCP servers (needed for meal-suggestions service)
COPY apps/mcp-servers/ ./apps/mcp-servers/

# Install all dependencies (tsx is a dev dependency)
RUN pnpm install --frozen-lockfile

# Create data directory for SQLite
RUN mkdir -p /app/apps/api/data && chown -R honeydo:nodejs /app/apps/api/data

USER honeydo

WORKDIR /app/apps/api

EXPOSE 3001

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

CMD ["pnpm", "exec", "tsx", "src/server.ts"]
