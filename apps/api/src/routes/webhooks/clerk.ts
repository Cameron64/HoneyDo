import type { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/backend';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface ClerkUserData {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

async function upsertUser(clerkUser: ClerkUserData) {
  const name = [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(' ').trim() || null;

  await db
    .insert(users)
    .values({
      id: clerkUser.id,
      email: clerkUser.email_addresses[0]?.email_address ?? '',
      name,
      avatarUrl: clerkUser.image_url ?? null,
      role: 'member',
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: clerkUser.email_addresses[0]?.email_address,
        name,
        avatarUrl: clerkUser.image_url ?? null,
        updatedAt: new Date().toISOString(),
      },
    });
}

async function deleteUser(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}

export async function registerClerkWebhook(fastify: FastifyInstance) {
  fastify.post('/api/webhooks/clerk', async (request, reply) => {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('CLERK_WEBHOOK_SECRET not configured');
      return reply.status(500).send({ error: 'Webhook secret not configured' });
    }

    const headers = request.headers as Record<string, string>;
    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      return reply.status(400).send({ error: 'Missing svix headers' });
    }

    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(JSON.stringify(request.body), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as WebhookEvent;
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    try {
      switch (evt.type) {
        case 'user.created':
        case 'user.updated':
          await upsertUser(evt.data as ClerkUserData);
          break;
        case 'user.deleted':
          if (evt.data.id) {
            await deleteUser(evt.data.id);
          }
          break;
      }

      return { success: true };
    } catch (error) {
      console.error('Webhook processing failed:', error);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  });
}
