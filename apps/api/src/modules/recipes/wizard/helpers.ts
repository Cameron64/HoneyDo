/**
 * Wizard Helper Functions
 *
 * Shared utilities for the wizard workflow.
 */

import {
  wizardSessions,
  batches,
  type WizardSessionRow,
  type BatchRow,
  type AcceptedMealRow,
} from '../../../db/schema';
import type { MealDisposition } from '@honeydo/shared';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Get the active batch for a user
 */
export async function getActiveBatch(
  db: typeof import('../../../db').db,
  userId: string
): Promise<BatchRow | null> {
  const batch = await db.query.batches.findFirst({
    where: and(eq(batches.userId, userId), eq(batches.status, 'active')),
    orderBy: desc(batches.createdAt),
  });
  return batch || null;
}

/**
 * Get or create wizard session for a user
 */
export async function getOrCreateWizardSession(
  db: typeof import('../../../db').db,
  userId: string
): Promise<WizardSessionRow> {
  // Check for existing session
  const session = await db.query.wizardSessions.findFirst({
    where: eq(wizardSessions.userId, userId),
  });

  if (session) {
    return session;
  }

  // Get the active batch (if any) to set as previous batch
  const activeBatch = await getActiveBatch(db, userId);

  // Create new session
  const [newSession] = await db
    .insert(wizardSessions)
    .values({
      userId,
      currentStep: 1,
      previousBatchId: activeBatch?.id || null,
    })
    .returning();

  return newSession;
}

/**
 * Suggest disposition for a meal based on its status
 */
export function suggestDisposition(meal: AcceptedMealRow): MealDisposition {
  if (meal.completed) {
    return 'completed';
  }
  if (meal.isAudible) {
    return 'discard'; // Audibles should be discarded without history
  }
  return 'discard'; // Default to discard, user can change to rollover
}

/**
 * Format date range for display
 */
export function formatDateRange(start: string, _end: string): string {
  const startDate = new Date(start);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)}`;
}
