import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { clerkPlugin } from '@clerk/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { initializeWebSocket } from './services/websocket';
import { registerClerkWebhook } from './routes/webhooks/clerk';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
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

  // Health check (non-tRPC)
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

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

  console.log(`Server running at http://${host}:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
