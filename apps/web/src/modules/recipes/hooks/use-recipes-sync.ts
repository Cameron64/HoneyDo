import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useSocketEvent } from '@/services/socket/hooks';

interface WizardStepCompletedData {
  step: number;
  nextStep: number;
}

interface WizardFinishedData {
  batchId: string | null;
  listId: string | null;
}

export function useRecipesSync() {
  const utils = trpc.useUtils();

  // Handle new suggestions received
  const handleSuggestionsReceived = useCallback(
    ({ suggestionId }: { suggestionId: string }) => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.suggestions.getById.invalidate(suggestionId);
    },
    [utils]
  );

  // Handle suggestions updated (accept/reject)
  const handleSuggestionsUpdated = useCallback(
    ({ suggestionId }: { suggestionId: string }) => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.suggestions.getById.invalidate(suggestionId);
    },
    [utils]
  );

  // Handle suggestions error
  const handleSuggestionsError = useCallback(
    ({ suggestionId }: { suggestionId: string; error: string }) => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.suggestions.getById.invalidate(suggestionId);
    },
    [utils]
  );

  // Handle meal accepted
  const handleMealAccepted = useCallback(
    ({ date }: { mealId: string; date: string; mealType: string }) => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getByDate.invalidate(date);
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },
    [utils]
  );

  // Handle meal removed
  const handleMealRemoved = useCallback(
    ({ date }: { date: string; mealType: string }) => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getByDate.invalidate(date);
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },
    [utils]
  );

  // Handle shopping items generated
  const handleShoppingGenerated = useCallback(
    (_data: { listId: string; itemCount: number }) => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },
    [utils]
  );

  // Handle wizard step completed
  const handleWizardStepCompleted = useCallback(
    (_data: WizardStepCompletedData) => {
      // Invalidate wizard session and related data
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSuggestionProgress.invalidate();
    },
    [utils]
  );

  // Handle wizard finished
  const handleWizardFinished = useCallback(
    (_data: WizardFinishedData) => {
      // Invalidate all wizard-related queries
      utils.recipes.wizard.invalidate();
      // Also invalidate meals and shopping data
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getCurrentBatch.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.meals.getCurrentBatchPendingShoppingCount.invalidate();
      utils.recipes.shopping.getCurrentBatchIngredients.invalidate();
    },
    [utils]
  );

  // Handle batch created
  const handleBatchCreated = useCallback(
    (_data: { batchId: string; name: string | null; dateRange?: { start: string; end: string } }) => {
      utils.recipes.wizard.getActiveBatch.invalidate();
    },
    [utils]
  );

  // Subscribe to socket events
  useSocketEvent('recipes:suggestions:received', handleSuggestionsReceived);
  useSocketEvent('recipes:suggestions:updated', handleSuggestionsUpdated);
  useSocketEvent('recipes:suggestions:error', handleSuggestionsError);
  useSocketEvent('recipes:meal:accepted', handleMealAccepted);
  useSocketEvent('recipes:meal:removed', handleMealRemoved);
  useSocketEvent('recipes:shopping:generated', handleShoppingGenerated);
  useSocketEvent('recipes:wizard:step-completed', handleWizardStepCompleted);
  useSocketEvent('recipes:wizard:finished', handleWizardFinished);
  useSocketEvent('recipes:batch:created', handleBatchCreated);

  return {
    invalidateSuggestions: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
    },
    invalidateMeals: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
    },
    invalidateWizard: () => {
      utils.recipes.wizard.invalidate();
    },
    invalidateAll: () => {
      utils.recipes.preferences.get.invalidate();
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.wizard.invalidate();
    },
  };
}
