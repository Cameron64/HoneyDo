/**
 * Step 2 Router - Get New Suggestions
 *
 * Handles AI meal suggestion requests, accepting/declining suggestions,
 * and managing the hidden backup suggestion pool.
 *
 * This file combines the sub-routers for backward compatibility.
 * The implementation is split across:
 * - step2-queries.router.ts: Progress, current suggestion, target count
 * - step2-request.router.ts: AI suggestion requests
 * - step2-actions.router.ts: Accept/decline, complete step
 */

import { router } from '../../../trpc';
import { step2QueriesRouter } from './step2-queries.router';
import { step2RequestRouter } from './step2-request.router';
import { step2ActionsRouter } from './step2-actions.router';

export const step2Router = router({
  // Queries (from step2-queries.router.ts)
  getSuggestionProgress: step2QueriesRouter.getSuggestionProgress,
  getCurrentSuggestion: step2QueriesRouter.getCurrentSuggestion,
  setTargetCount: step2QueriesRouter.setTargetCount,

  // Request (from step2-request.router.ts)
  requestMoreSuggestions: step2RequestRouter.requestMoreSuggestions,
  fetchMoreHiddenSuggestions: step2RequestRouter.fetchMoreHiddenSuggestions,

  // Actions (from step2-actions.router.ts)
  acceptSuggestion: step2ActionsRouter.acceptSuggestion,
  declineSuggestion: step2ActionsRouter.declineSuggestion,
  complete: step2ActionsRouter.complete,
});

// Export sub-routers for potential direct access
export { step2QueriesRouter } from './step2-queries.router';
export { step2RequestRouter } from './step2-request.router';
export { step2ActionsRouter } from './step2-actions.router';
