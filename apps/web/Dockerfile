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

# Copy web app
COPY apps/web/ ./apps/web/

# Copy API source (needed for tRPC type imports)
COPY apps/api/ ./apps/api/

# Copy MCP servers (needed for API type imports)
COPY apps/mcp-servers/ ./apps/mcp-servers/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build args for Vite environment variables
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL

# Build shared package first, then web
RUN pnpm --filter @honeydo/shared build
RUN pnpm --filter @honeydo/web build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy nginx configs (default HTTP, SSL version mounted at runtime)
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx-ssl.conf /etc/nginx/nginx-ssl.conf

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Expose ports (80 for HTTP redirect, 443 for HTTPS)
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
