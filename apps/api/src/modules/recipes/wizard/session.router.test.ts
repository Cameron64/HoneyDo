/**
 * Tests for wizard session router, specifically the goBack mutation
 * that cleans up acceptedMeals when navigating back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../../../db/schema';

// Create an in-memory database for testing
function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  // Create tables manually for in-memory database
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'member',
      preferences TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      date_range_start TEXT NOT NULL,
      date_range_end TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      total_meals INTEGER,
      completed_meals INTEGER,
      rolled_over_meals INTEGER,
      discarded_meals INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      archived_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wizard_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      current_step INTEGER DEFAULT 1,
      meal_dispositions TEXT,
      rollover_count INTEGER DEFAULT 0,
      total_meal_count INTEGER,
      manual_pick_count INTEGER DEFAULT 0,
      manual_pick_ids TEXT DEFAULT '[]',
      target_meal_count INTEGER,
      accepted_meal_ids TEXT,
      current_suggestion_request_id TEXT,
      selected_ingredients TEXT,
      target_list_id TEXT,
      new_batch_id TEXT,
      previous_batch_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meal_suggestions (
      id TEXT PRIMARY KEY,
      requested_by TEXT NOT NULL,
      requested_at TEXT DEFAULT (datetime('now')),
      date_range_start TEXT NOT NULL,
      date_range_end TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      suggestions TEXT,
      visible_count INTEGER,
      reasoning TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accepted_meals (
      id TEXT PRIMARY KEY,
      suggestion_id TEXT,
      suggestion_index INTEGER,
      batch_id TEXT,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      recipe_name TEXT NOT NULL,
      recipe_data TEXT NOT NULL,
      servings INTEGER NOT NULL,
      shopping_list_generated INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      is_rollover INTEGER DEFAULT 0,
      rollover_from_batch_id TEXT,
      is_manual_pick INTEGER DEFAULT 0,
      is_audible INTEGER DEFAULT 0,
      replaced_meal_id TEXT,
      rating INTEGER,
      user_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (suggestion_id) REFERENCES meal_suggestions(id) ON DELETE SET NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
    );
  `);

  return { db, sqlite };
}

// Helper to simulate the goBack logic
async function simulateGoBack(
  db: ReturnType<typeof drizzle>,
  userId: string,
  target: 'step1' | 'step2a' | 'step2b' | 'step2c' | 'step3'
) {
  const { wizardSessions, acceptedMeals } = schema;

  const session = await db.query.wizardSessions.findFirst({
    where: eq(wizardSessions.userId, userId),
  });

  if (!session) {
    throw new Error('No active wizard session');
  }

  const currentAcceptedMealIds = (session.acceptedMealIds ?? []) as string[];

  // Helper to delete accepted meals by IDs
  const deleteAcceptedMealsByIds = async (mealIds: string[]) => {
    if (mealIds.length > 0) {
      // Use raw SQL for in-memory test since inArray might not work
      for (const mealId of mealIds) {
        await db.delete(acceptedMeals).where(eq(acceptedMeals.id, mealId));
      }
    }
  };

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  switch (target) {
    case 'step2a':
      if (session.currentStep < 2) {
        throw new Error('Cannot go to Step 2a - complete Step 1 first.');
      }
      await deleteAcceptedMealsByIds(currentAcceptedMealIds);
      updates.currentStep = 2;
      updates.totalMealCount = null;
      updates.manualPickCount = 0;
      updates.manualPickIds = [];
      updates.targetMealCount = null;
      updates.acceptedMealIds = [];
      updates.currentSuggestionRequestId = null;
      break;

    case 'step2b':
      if (session.currentStep < 2 || session.totalMealCount == null) {
        throw new Error('Cannot go to Step 2b - complete Step 2a first.');
      }
      if ((session.manualPickCount ?? 0) === 0) {
        throw new Error('No manual picks configured.');
      }
      await deleteAcceptedMealsByIds(currentAcceptedMealIds);
      updates.currentStep = 2;
      updates.manualPickIds = [];
      updates.targetMealCount = null;
      updates.acceptedMealIds = [];
      updates.currentSuggestionRequestId = null;
      break;

    case 'step2c':
      if (session.currentStep < 2 || session.totalMealCount == null) {
        throw new Error('Cannot go to Step 2c - complete earlier steps first.');
      }
      const manualPickCount = session.manualPickCount ?? 0;
      const manualPickMealIds = currentAcceptedMealIds.slice(0, manualPickCount);
      const aiAcceptedMealIds = currentAcceptedMealIds.slice(manualPickCount);
      await deleteAcceptedMealsByIds(aiAcceptedMealIds);
      updates.currentStep = 2;
      updates.targetMealCount = null;
      updates.acceptedMealIds = manualPickMealIds;
      updates.currentSuggestionRequestId = null;
      break;

    default:
      throw new Error(`Unsupported target: ${target}`);
  }

  await db
    .update(wizardSessions)
    .set(updates)
    .where(eq(wizardSessions.id, session.id));

  return { success: true, target };
}

describe('wizard session goBack cleanup', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let testUserId: string;
  let testBatchId: string;

  beforeEach(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;

    // Create test user
    testUserId = nanoid();
    await db.insert(schema.users).values({
      id: testUserId,
      email: 'test@example.com',
      name: 'Test User',
    });

    // Create test batch
    testBatchId = nanoid();
    await db.insert(schema.batches).values({
      id: testBatchId,
      userId: testUserId,
      dateRangeStart: '2025-01-15',
      dateRangeEnd: '2025-01-21',
      status: 'active',
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('should delete all accepted meals when going back to step2a', async () => {
    // Create wizard session at step 2 with manual picks configured
    const sessionId = nanoid();
    const mealId1 = nanoid();
    const mealId2 = nanoid();
    const mealId3 = nanoid();

    await db.insert(schema.wizardSessions).values({
      id: sessionId,
      userId: testUserId,
      currentStep: 2,
      totalMealCount: 5,
      manualPickCount: 2,
      manualPickIds: [
        { recipeId: 'recipe1', recipeName: 'Recipe 1', servings: 4, addedAt: new Date().toISOString() },
        { recipeId: 'recipe2', recipeName: 'Recipe 2', servings: 4, addedAt: new Date().toISOString() },
      ],
      acceptedMealIds: [mealId1, mealId2, mealId3], // 2 manual + 1 AI
      newBatchId: testBatchId,
    });

    // Create accepted meals
    const recipeData = {
      name: 'Test Recipe',
      description: 'A test recipe',
      source: 'test',
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      defaultServings: 4,
      servingsUnit: 'servings',
      cuisine: 'American',
      effort: 2,
      ingredients: [],
      instructions: [],
    };

    await db.insert(schema.acceptedMeals).values([
      { id: mealId1, batchId: testBatchId, date: '2025-01-15', mealType: 'dinner', recipeName: 'Recipe 1', recipeData, servings: 4, isManualPick: true },
      { id: mealId2, batchId: testBatchId, date: '2025-01-16', mealType: 'dinner', recipeName: 'Recipe 2', recipeData, servings: 4, isManualPick: true },
      { id: mealId3, batchId: testBatchId, date: '2025-01-17', mealType: 'dinner', recipeName: 'AI Recipe', recipeData, servings: 4, isManualPick: false },
    ]);

    // Verify meals exist before goBack
    const mealsBefore = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsBefore).toHaveLength(3);

    // Go back to step 2a
    await simulateGoBack(db, testUserId, 'step2a');

    // Verify all meals are deleted
    const mealsAfter = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsAfter).toHaveLength(0);

    // Verify session state is reset
    const session = await db.query.wizardSessions.findFirst({
      where: eq(schema.wizardSessions.userId, testUserId),
    });
    expect(session?.totalMealCount).toBeNull();
    expect(session?.manualPickCount).toBe(0);
    expect(session?.manualPickIds).toEqual([]);
    expect(session?.acceptedMealIds).toEqual([]);
  });

  it('should delete all accepted meals when going back to step2b', async () => {
    // Create wizard session at step 2 with manual picks configured
    const sessionId = nanoid();
    const mealId1 = nanoid();
    const mealId2 = nanoid();

    await db.insert(schema.wizardSessions).values({
      id: sessionId,
      userId: testUserId,
      currentStep: 2,
      totalMealCount: 5,
      manualPickCount: 2,
      manualPickIds: [
        { recipeId: 'recipe1', recipeName: 'Recipe 1', servings: 4, addedAt: new Date().toISOString() },
        { recipeId: 'recipe2', recipeName: 'Recipe 2', servings: 4, addedAt: new Date().toISOString() },
      ],
      acceptedMealIds: [mealId1, mealId2],
      newBatchId: testBatchId,
    });

    // Create accepted meals
    const recipeData = {
      name: 'Test Recipe',
      description: 'A test recipe',
      source: 'test',
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      defaultServings: 4,
      servingsUnit: 'servings',
      cuisine: 'American',
      effort: 2,
      ingredients: [],
      instructions: [],
    };

    await db.insert(schema.acceptedMeals).values([
      { id: mealId1, batchId: testBatchId, date: '2025-01-15', mealType: 'dinner', recipeName: 'Recipe 1', recipeData, servings: 4, isManualPick: true },
      { id: mealId2, batchId: testBatchId, date: '2025-01-16', mealType: 'dinner', recipeName: 'Recipe 2', recipeData, servings: 4, isManualPick: true },
    ]);

    // Verify meals exist before goBack
    const mealsBefore = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsBefore).toHaveLength(2);

    // Go back to step 2b
    await simulateGoBack(db, testUserId, 'step2b');

    // Verify all meals are deleted
    const mealsAfter = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsAfter).toHaveLength(0);

    // Verify session state - keeps totalMealCount and manualPickCount
    const session = await db.query.wizardSessions.findFirst({
      where: eq(schema.wizardSessions.userId, testUserId),
    });
    expect(session?.totalMealCount).toBe(5);
    expect(session?.manualPickCount).toBe(2);
    expect(session?.manualPickIds).toEqual([]);
    expect(session?.acceptedMealIds).toEqual([]);
  });

  it('should only delete AI-accepted meals when going back to step2c', async () => {
    // Create wizard session at step 2 with both manual picks and AI accepted
    const sessionId = nanoid();
    const manualMealId1 = nanoid();
    const manualMealId2 = nanoid();
    const aiMealId1 = nanoid();
    const aiMealId2 = nanoid();

    await db.insert(schema.wizardSessions).values({
      id: sessionId,
      userId: testUserId,
      currentStep: 2,
      totalMealCount: 6,
      manualPickCount: 2,
      manualPickIds: [
        { recipeId: 'recipe1', recipeName: 'Manual Recipe 1', servings: 4, addedAt: new Date().toISOString() },
        { recipeId: 'recipe2', recipeName: 'Manual Recipe 2', servings: 4, addedAt: new Date().toISOString() },
      ],
      // Manual picks are first, then AI accepted
      acceptedMealIds: [manualMealId1, manualMealId2, aiMealId1, aiMealId2],
      newBatchId: testBatchId,
    });

    // Create accepted meals
    const recipeData = {
      name: 'Test Recipe',
      description: 'A test recipe',
      source: 'test',
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      defaultServings: 4,
      servingsUnit: 'servings',
      cuisine: 'American',
      effort: 2,
      ingredients: [],
      instructions: [],
    };

    await db.insert(schema.acceptedMeals).values([
      { id: manualMealId1, batchId: testBatchId, date: '2025-01-15', mealType: 'dinner', recipeName: 'Manual Recipe 1', recipeData, servings: 4, isManualPick: true },
      { id: manualMealId2, batchId: testBatchId, date: '2025-01-16', mealType: 'dinner', recipeName: 'Manual Recipe 2', recipeData, servings: 4, isManualPick: true },
      { id: aiMealId1, batchId: testBatchId, date: '2025-01-17', mealType: 'dinner', recipeName: 'AI Recipe 1', recipeData, servings: 4, isManualPick: false },
      { id: aiMealId2, batchId: testBatchId, date: '2025-01-18', mealType: 'dinner', recipeName: 'AI Recipe 2', recipeData, servings: 4, isManualPick: false },
    ]);

    // Verify all meals exist before goBack
    const mealsBefore = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsBefore).toHaveLength(4);

    // Go back to step 2c
    await simulateGoBack(db, testUserId, 'step2c');

    // Verify only manual pick meals remain
    const mealsAfter = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsAfter).toHaveLength(2);
    expect(mealsAfter.map((m) => m.id).sort()).toEqual([manualMealId1, manualMealId2].sort());

    // Verify session state - keeps manual picks
    const session = await db.query.wizardSessions.findFirst({
      where: eq(schema.wizardSessions.userId, testUserId),
    });
    expect(session?.totalMealCount).toBe(6);
    expect(session?.manualPickCount).toBe(2);
    expect(session?.acceptedMealIds).toEqual([manualMealId1, manualMealId2]);
  });

  it('should allow re-creating meals after going back and forward again', async () => {
    // This tests the exact scenario that was broken
    const sessionId = nanoid();
    const originalMealId = nanoid();

    await db.insert(schema.wizardSessions).values({
      id: sessionId,
      userId: testUserId,
      currentStep: 2,
      totalMealCount: 3,
      manualPickCount: 1,
      manualPickIds: [
        { recipeId: 'recipe1', recipeName: 'Original Recipe', servings: 4, addedAt: new Date().toISOString() },
      ],
      acceptedMealIds: [originalMealId],
      newBatchId: testBatchId,
    });

    const recipeData = {
      name: 'Test Recipe',
      description: 'A test recipe',
      source: 'test',
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      defaultServings: 4,
      servingsUnit: 'servings',
      cuisine: 'American',
      effort: 2,
      ingredients: [],
      instructions: [],
    };

    // Create original accepted meal
    await db.insert(schema.acceptedMeals).values({
      id: originalMealId,
      batchId: testBatchId,
      date: '2025-01-15',
      mealType: 'dinner',
      recipeName: 'Original Recipe',
      recipeData,
      servings: 4,
      isManualPick: true,
    });

    // User goes back to step2b to change their selection
    await simulateGoBack(db, testUserId, 'step2b');

    // Verify the original meal is deleted
    const mealsAfterGoBack = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(mealsAfterGoBack).toHaveLength(0);

    // Now simulate selecting a new recipe and completing manual picks
    // (This is what completeManualPicks does)
    const newMealId = nanoid();

    // Update session with new manual pick
    await db
      .update(schema.wizardSessions)
      .set({
        manualPickIds: [
          { recipeId: 'recipe2', recipeName: 'New Recipe', servings: 4, addedAt: new Date().toISOString() },
        ],
      })
      .where(eq(schema.wizardSessions.userId, testUserId));

    // Create new accepted meal
    await db.insert(schema.acceptedMeals).values({
      id: newMealId,
      batchId: testBatchId,
      date: '2025-01-15',
      mealType: 'dinner',
      recipeName: 'New Recipe',
      recipeData: { ...recipeData, name: 'New Recipe' },
      servings: 4,
      isManualPick: true,
    });

    // Update session with new accepted meal ID
    await db
      .update(schema.wizardSessions)
      .set({
        acceptedMealIds: [newMealId],
      })
      .where(eq(schema.wizardSessions.userId, testUserId));

    // Verify only the new meal exists (no orphans)
    const finalMeals = await db.query.acceptedMeals.findMany({
      where: eq(schema.acceptedMeals.batchId, testBatchId),
    });
    expect(finalMeals).toHaveLength(1);
    expect(finalMeals[0].id).toBe(newMealId);
    expect(finalMeals[0].recipeName).toBe('New Recipe');

    // Verify session state is consistent
    const finalSession = await db.query.wizardSessions.findFirst({
      where: eq(schema.wizardSessions.userId, testUserId),
    });
    expect(finalSession?.acceptedMealIds).toEqual([newMealId]);
  });
});
