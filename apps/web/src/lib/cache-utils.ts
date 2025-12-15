/**
 * Cache Invalidation Utilities
 *
 * Centralized helpers for invalidating tRPC query caches.
 * Use these instead of manually calling multiple invalidate() calls.
 *
 * Usage:
 * ```tsx
 * const { invalidateMeals } = useCacheInvalidation();
 *
 * const mutation = trpc.recipes.meals.remove.useMutation({
 *   onSuccess: () => {
 *     invalidateMeals();
 *   },
 * });
 * ```
 */

import { trpc } from './trpc';

/** Return type for the cache invalidation hook */
interface CacheInvalidationHelpers {
  invalidateMeals: () => void;
  invalidateMealsByDate: (date: string) => void;
  invalidateSuggestions: () => void;
  invalidateSuggestionsById: (suggestionId: string) => void;
  invalidateWizard: () => void;
  invalidateWizardSession: () => void;
  invalidateShopping: () => void;
  invalidateBatchHistory: () => void;
  invalidateRecipeLibrary: () => void;
  invalidateAllRecipes: () => void;
}

/**
 * Hook that provides cache invalidation helpers.
 * Must be called within a component (uses tRPC context).
 */
export function useCacheInvalidation(): CacheInvalidationHelpers {
  const utils = trpc.useUtils();

  return {
    /**
     * Invalidate all meal-related queries.
     * Use after: adding, removing, completing, or modifying meals.
     */
    invalidateMeals: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
    },

    /**
     * Invalidate meal queries for a specific date.
     * Use after: modifying a meal on a specific date.
     */
    invalidateMealsByDate: (date: string) => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getByDate.invalidate(date);
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },

    /**
     * Invalidate all suggestion-related queries.
     * Use after: requesting, accepting, or rejecting suggestions.
     */
    invalidateSuggestions: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
    },

    /**
     * Invalidate suggestions with a specific ID.
     * Use after: modifying a specific suggestion batch.
     */
    invalidateSuggestionsById: (suggestionId: string) => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.suggestions.getById.invalidate(suggestionId);
    },

    /**
     * Invalidate all wizard-related queries.
     * Use after: wizard step completion, abandonment, or finish.
     */
    invalidateWizard: () => {
      utils.recipes.wizard.invalidate();
    },

    /**
     * Invalidate wizard session queries.
     * Use after: wizard step transitions.
     */
    invalidateWizardSession: () => {
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSuggestionProgress.invalidate();
    },

    /**
     * Invalidate shopping-related queries.
     * Use after: generating shopping lists from meals.
     */
    invalidateShopping: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
      utils.shopping.lists.getDefault.invalidate();
    },

    /**
     * Invalidate batch history queries.
     * Use after: deleting or modifying batches.
     */
    invalidateBatchHistory: () => {
      utils.recipes.wizard.getBatchHistory.invalidate();
      utils.shopping.lists.invalidate();
      utils.shopping.items.invalidate();
    },

    /**
     * Invalidate recipe library queries.
     * Use after: adding, removing, or modifying recipes in history.
     */
    invalidateRecipeLibrary: () => {
      utils.recipes.history.getAll.invalidate();
      utils.recipes.history.getCuisines.invalidate();
    },

    /**
     * Invalidate all recipes module queries.
     * Use sparingly - prefer specific invalidation methods.
     */
    invalidateAllRecipes: () => {
      utils.recipes.preferences.get.invalidate();
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.wizard.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },
  };
}
