import { eq } from 'drizzle-orm';
import { shoppingLists } from '../../db/schema';
import type { DB } from '../../db';

/**
 * Update a shopping list's `updatedAt` timestamp.
 * Call this after any item mutation to keep the list's timestamp current.
 */
export async function updateListTimestamp(db: DB, listId: string): Promise<void> {
  await db
    .update(shoppingLists)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(shoppingLists.id, listId));
}
