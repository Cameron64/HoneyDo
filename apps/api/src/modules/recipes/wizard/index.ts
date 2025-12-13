/**
 * Wizard Router Index
 *
 * Multi-step workflow for transitioning between meal planning batches:
 * - Step 1: Manage current batch (rollover, complete, discard meals)
 * - Step 2: Get new suggestions (request AI suggestions, accept/decline)
 * - Step 3: Manage shopping list (select ingredients, create list)
 * - Step 4: Complete (summary and finish)
 *
 * This module uses a flat router structure for backward compatibility,
 * but the implementation is split across multiple files for maintainability.
 *
 * Sub-routers are also exported for potential future nested access:
 *   trpc.recipes.wizard.session.start
 *   trpc.recipes.wizard.step1.complete
 *   etc.
 */

import { router } from '../../../trpc';
import { sessionRouter } from './session.router';
import { step1Router } from './step1.router';
import { step2Router } from './step2.router';
import { step2ManualRouter } from './step2-manual.router';
import { step3Router } from './step3.router';
import { step4Router } from './step4.router';
import { batchesRouter } from './batches.router';

/**
 * Wizard Router - Flat structure for backward compatibility
 *
 * Combines all wizard procedures into a single flat namespace.
 * This maintains the existing API: trpc.recipes.wizard.start, etc.
 */
export const wizardRouter = router({
  // ============================================
  // Session Management (from session.router.ts)
  // ============================================
  start: sessionRouter.start,
  abandon: sessionRouter.abandon,
  getSession: sessionRouter.getSession,
  goBack: sessionRouter.goBack,

  // ============================================
  // Step 1: Manage Current Batch (from step1.router.ts)
  // ============================================
  getCurrentBatchMeals: step1Router.getCurrentBatchMeals,
  setMealDispositions: step1Router.setMealDispositions,
  completeStep1: step1Router.complete,

  // ============================================
  // Step 2a: Plan Batch (from step2-manual.router.ts)
  // ============================================
  setMealCounts: step2ManualRouter.setMealCounts,

  // ============================================
  // Step 2b: Manual Picks (from step2-manual.router.ts)
  // ============================================
  addManualPick: step2ManualRouter.addManualPick,
  removeManualPick: step2ManualRouter.removeManualPick,
  getManualPicks: step2ManualRouter.getManualPicks,
  completeManualPicks: step2ManualRouter.completeManualPicks,

  // ============================================
  // Step 2c: AI Suggestions (from step2.router.ts)
  // ============================================
  getSuggestionProgress: step2Router.getSuggestionProgress,
  getCurrentSuggestion: step2Router.getCurrentSuggestion,
  setTargetCount: step2Router.setTargetCount,
  requestMoreSuggestions: step2Router.requestMoreSuggestions,
  fetchMoreHiddenSuggestions: step2Router.fetchMoreHiddenSuggestions,
  acceptSuggestion: step2Router.acceptSuggestion,
  declineSuggestion: step2Router.declineSuggestion,
  completeStep2: step2Router.complete,

  // ============================================
  // Step 3: Manage Shopping List (from step3.router.ts)
  // ============================================
  getShoppingPreview: step3Router.getShoppingPreview,
  getExistingLists: step3Router.getExistingLists,
  completeStep3: step3Router.complete,

  // ============================================
  // Step 4: Complete (from step4.router.ts)
  // ============================================
  getCompletionSummary: step4Router.getCompletionSummary,
  finishWizard: step4Router.finish,

  // ============================================
  // Batches Management (from batches.router.ts)
  // ============================================
  getActiveBatch: batchesRouter.getActive,
  getBatchHistory: batchesRouter.getHistory,
  getBatchById: batchesRouter.getById,
  deleteBatch: batchesRouter.delete,
  deleteBatches: batchesRouter.deleteMany,
});

// Export sub-routers for potential future nested access
export { sessionRouter } from './session.router';
export { step1Router } from './step1.router';
export { step2Router, step2QueriesRouter, step2RequestRouter, step2ActionsRouter } from './step2.router';
export { step2ManualRouter } from './step2-manual.router';
export { step3Router } from './step3.router';
export { step4Router } from './step4.router';
export { batchesRouter } from './batches.router';
export * from './helpers';
export * from './step2-helpers';
