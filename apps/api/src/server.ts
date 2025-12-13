import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { clerkPlugin } from '@clerk/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { initializeWebSocket } from './services/websocket';
import { registerClerkWebhook } from './routes/webhooks/clerk';
import { getClaudeSession } from './services/claude-session';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Environment Detection & Safety Checks
// =============================================================================
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV = NODE_ENV === 'development';

// CRITICAL: Fail fast if dangerous flags are set in production
if (IS_PROD) {
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    console.error('FATAL: DEV_BYPASS_AUTH cannot be enabled in production!');
    process.exit(1);
  }
  if (process.env.MOCK_MEAL_SUGGESTIONS === 'true') {
    console.error('FATAL: MOCK_MEAL_SUGGESTIONS cannot be enabled in production!');
    process.exit(1);
  }
  // Verify required secrets are present
  const requiredSecrets = ['CLERK_SECRET_KEY', 'ANTHROPIC_API_KEY'];
  const missingSecrets = requiredSecrets.filter((key) => !process.env[key]);
  if (missingSecrets.length > 0) {
    console.error(`FATAL: Missing required secrets in production: ${missingSecrets.join(', ')}`);
    process.exit(1);
  }
}

console.log(`[Server] Environment: ${NODE_ENV} (IS_PROD=${IS_PROD}, IS_DEV=${IS_DEV})`);

// Runtime config - can be toggled via /config endpoint in development
// These override env vars when set (null means use env var)
export const runtimeConfig = {
  devBypassAuth: null as boolean | null,
  mockMealSuggestions: null as boolean | null,
};

// Helper to get effective config value (runtime override or env var)
export function getConfig() {
  return {
    devBypassAuth: runtimeConfig.devBypassAuth ?? process.env.DEV_BYPASS_AUTH === 'true',
    mockMealSuggestions: runtimeConfig.mockMealSuggestions ?? process.env.MOCK_MEAL_SUGGESTIONS === 'true',
  };
}

// Tailscale HTTPS certs (optional - for PWA support over Tailscale)
const certPath = path.resolve(__dirname, '../../../certs/cams-work-comp.taila29c19.ts.net.crt');
const keyPath = path.resolve(__dirname, '../../../certs/cams-work-comp.taila29c19.ts.net.key');
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

const server = Fastify({
  logger: IS_PROD
    ? { level: process.env.LOG_LEVEL ?? 'warn' }
    : {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      },
  ...(hasCerts && {
    https: {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
  }),
});

async function start() {
  // Register plugins
  // CORS: Allow all origins for LAN testing (use function to echo back origin)
  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow all origins for development/LAN access
      // In production, restrict this
      console.log('[CORS] Request from origin:', origin);
      cb(null, true);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(clerkPlugin);

  // Health check (non-tRPC) - includes dev flags for debug panel
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    // Only expose dev config in development mode
    ...(IS_DEV && { config: getConfig() }),
  }));

  // Config endpoint - toggle dev flags at runtime (development only)
  server.post('/config', async (request, reply) => {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Config changes not allowed in production' });
    }

    const body = request.body as {
      devBypassAuth?: boolean;
      mockMealSuggestions?: boolean;
    };

    // Update runtime config
    if (typeof body.devBypassAuth === 'boolean') {
      runtimeConfig.devBypassAuth = body.devBypassAuth;
      console.log(`[Config] devBypassAuth set to: ${body.devBypassAuth}`);
    }
    if (typeof body.mockMealSuggestions === 'boolean') {
      runtimeConfig.mockMealSuggestions = body.mockMealSuggestions;
      console.log(`[Config] mockMealSuggestions set to: ${body.mockMealSuggestions}`);
    }

    return { success: true, config: getConfig() };
  });

  // Error logging endpoint - persists errors to a file Claude can read
  const errorLogPath = path.resolve(__dirname, '../../../data/errors.json');

  // Ensure error log file exists
  if (!fs.existsSync(errorLogPath)) {
    fs.writeFileSync(errorLogPath, '[]', 'utf-8');
  }

  server.post('/errors/log', async (request, reply) => {
    try {
      const error = request.body as {
        module: string;
        source: string;
        message: string;
        details?: unknown;
        timestamp: string;
        url: string;
      };

      // Read existing errors
      const existing = JSON.parse(fs.readFileSync(errorLogPath, 'utf-8')) as unknown[];

      // Add new error at the beginning, keep last 100
      existing.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...error,
      });
      const trimmed = existing.slice(0, 100);

      // Write back
      fs.writeFileSync(errorLogPath, JSON.stringify(trimmed, null, 2), 'utf-8');

      return { success: true };
    } catch (err) {
      console.error('[ErrorLog] Failed to persist error:', err);
      return reply.status(500).send({ success: false });
    }
  });

  // Clerk webhooks
  await registerClerkWebhook(server);

  // tRPC
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ error, path }: { error: Error; path?: string }) {
        console.error(`Error in tRPC handler [${path}]:`, error);
      },
    },
  });

  // Start server first, then initialize WebSocket
  const port = parseInt(process.env.API_PORT ?? '3001', 10);
  const host = process.env.API_HOST ?? '0.0.0.0';

  await server.listen({ port, host });

  // Initialize WebSocket after server is listening
  initializeWebSocket(server.server);

  const protocol = hasCerts ? 'https' : 'http';
  console.log(`Server running at ${protocol}://${host}:${port}`);

  // Warm up Claude session in background (non-blocking)
  // This eliminates cold start time on first meal suggestion request
  console.log('[Server] MOCK_MEAL_SUGGESTIONS =', process.env.MOCK_MEAL_SUGGESTIONS);
  if (process.env.MOCK_MEAL_SUGGESTIONS !== 'true') {
    console.log('[Server] Starting Claude session warmup in background...');
    getClaudeSession().warmup().catch((err) => {
      console.error('[Server] ❌ Claude session warmup FAILED:', err.message);
      console.error('[Server] Full error:', err);
    });
  } else {
    console.log('[Server] Skipping Claude warmup (mock mode enabled)');
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
