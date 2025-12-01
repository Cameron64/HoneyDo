import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { MealDispositionCard } from './MealDispositionCard';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Check, RotateCcw, Trash2, AlertCircle } from 'lucide-react';
import type { WizardSession, MealDisposition } from '@honeydo/shared';

interface ManageBatchStepProps {
  session: WizardSession;
  onStepComplete: () => void;
}

export function ManageBatchStep({ session, onStepComplete }: ManageBatchStepProps) {
  const utils = trpc.useUtils();

  const { data: meals, isLoading: mealsLoading } = trpc.recipes.wizard.getCurrentBatchMeals.useQuery();

  const setDispositions = trpc.recipes.wizard.setMealDispositions.useMutation({
    onError: (error) => {
      console.error('Failed to set dispositions:', error);
    },
  });

  const completeStep = trpc.recipes.wizard.completeStep1.useMutation({
    onSuccess: () => {
      // Invalidate both getSession and start queries to ensure UI updates
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      onStepComplete();
    },
  });

  const [dispositions, setLocalDispositions] = useState<Record<string, MealDisposition>>({});

  // Initialize with smart defaults when meals load
  useEffect(() => {
    if (meals && meals.length > 0) {
      const initial: Record<string, MealDisposition> = {};
      meals.forEach((m) => {
        // Pre-fill from session if available
        const existing = session.mealDispositions?.find((d) => d.mealId === m.id);
        if (existing) {
          initial[m.id] = existing.disposition;
        } else if (m.completed) {
          // Already marked as cooked
          initial[m.id] = 'completed';
        } else if (m.isAudible) {
          // Audibles should be discarded
          initial[m.id] = 'discard';
        } else {
          // Default to discard for uncooked meals
          initial[m.id] = 'discard';
        }
      });
      setLocalDispositions(initial);
    }
  }, [meals, session.mealDispositions]);

  const handleQuickAction = (action: MealDisposition) => {
    if (!meals) return;
    const updated: Record<string, MealDisposition> = {};
    meals.forEach((m) => {
      // Audibles can only be discarded
      if (m.isAudible) {
        updated[m.id] = 'discard';
      } else {
        updated[m.id] = action;
      }
    });
    setLocalDispositions(updated);
  };

  const handleContinue = async () => {
    if (!meals) return;

    // Save dispositions first
    await setDispositions.mutateAsync({
      dispositions: Object.entries(dispositions).map(([mealId, disposition]) => ({
        mealId,
        disposition,
      })),
    });

    // Then complete the step
    await completeStep.mutateAsync();
  };

  const allSet = meals?.every((m) => dispositions[m.id]);
  const isProcessing = setDispositions.isPending || completeStep.isPending;

  // Calculate summary
  const summary = {
    completed: Object.values(dispositions).filter((d) => d === 'completed').length,
    rollover: Object.values(dispositions).filter((d) => d === 'rollover').length,
    discard: Object.values(dispositions).filter((d) => d === 'discard').length,
  };

  if (mealsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  // No meals in current batch - show skip option
  if (!meals || meals.length === 0) {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center py-8">
          <div className="p-4 bg-muted rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Check className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">No Meals to Review</h2>
          <p className="text-sm text-muted-foreground mb-6">
            You don't have any existing meals. Let's get some suggestions!
          </p>
        </div>

        {/* Error Display */}
        {completeStep.error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{completeStep.error.message}</span>
          </div>
        )}

        {/* Continue Button - fixed at bottom, above mobile nav */}
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
          <Button
            className="w-full"
            onClick={() => completeStep.mutate()}
            disabled={completeStep.isPending}
          >
            {completeStep.isPending ? 'Processing...' : 'Continue to Suggestions'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-40 md:pb-24">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Review Current Meals</h2>
        <p className="text-sm text-muted-foreground">
          Choose what to do with each meal from your current batch.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickAction('completed')}
          className="flex items-center gap-1"
        >
          <Check className="h-4 w-4" />
          All Made
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickAction('rollover')}
          className="flex items-center gap-1"
        >
          <RotateCcw className="h-4 w-4" />
          Keep All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickAction('discard')}
          className="flex items-center gap-1"
        >
          <Trash2 className="h-4 w-4" />
          Discard All
        </Button>
      </div>

      {/* Meal List */}
      <div className="space-y-3">
        {meals.map((meal) => (
          <MealDispositionCard
            key={meal.id}
            meal={meal}
            disposition={dispositions[meal.id] || null}
            onDispositionChange={(d) => {
              setLocalDispositions((prev) => ({ ...prev, [meal.id]: d }));
            }}
            isAudible={meal.isAudible}
          />
        ))}
      </div>

      {/* Summary */}
      {allSet && (
        <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-4 text-sm">
          <span className="text-green-600 flex items-center gap-1">
            <Check className="h-4 w-4" />
            {summary.completed} made
          </span>
          <span className="text-blue-600 flex items-center gap-1">
            <RotateCcw className="h-4 w-4" />
            {summary.rollover} kept
          </span>
          <span className="text-muted-foreground flex items-center gap-1">
            <Trash2 className="h-4 w-4" />
            {summary.discard} discarded
          </span>
        </div>
      )}

      {/* Error Display */}
      {(setDispositions.error || completeStep.error) && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{setDispositions.error?.message || completeStep.error?.message}</span>
        </div>
      )}

      {/* Continue Button - fixed at bottom, above mobile nav */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <Button
          className="w-full"
          disabled={!allSet || isProcessing}
          onClick={handleContinue}
        >
          {isProcessing ? 'Processing...' : 'Continue to Suggestions'}
        </Button>
      </div>
    </div>
  );
}
