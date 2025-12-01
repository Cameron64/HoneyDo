import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { SuggestionProgress } from './SuggestionProgress';
import { MealSuggestionCard } from '../../suggestions/MealSuggestionCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useRecipesSync } from '../../../hooks/use-recipes-sync';
import { RefreshCw, Sparkles, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import type { WizardSession } from '@honeydo/shared';

interface GetSuggestionsStepProps {
  session: WizardSession;
  onStepComplete: () => void;
}

export function GetSuggestionsStep({ session, onStepComplete }: GetSuggestionsStepProps) {
  const utils = trpc.useUtils();

  // Set up real-time sync for suggestion updates
  useRecipesSync();

  const { data: progress } = trpc.recipes.wizard.getSuggestionProgress.useQuery();

  // Local state to track that we've initiated a request and are waiting for AI
  const [isRequestingAI, setIsRequestingAI] = useState(false);

  // Use wizard-specific query to get the current session's suggestion (not the global most recent)
  const { data: currentSuggestion, isLoading: isSuggestionLoading } = trpc.recipes.wizard.getCurrentSuggestion.useQuery();

  // Poll when we're waiting for AI results:
  // - isRequestingAI = we just made a request, waiting for any response
  // - status === 'pending' = AI is processing, waiting for completion
  const shouldPoll = isRequestingAI || currentSuggestion?.status === 'pending';

  // Set up polling effect - refetch every 3 seconds while waiting
  useEffect(() => {
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
    }, 3000);

    return () => clearInterval(interval);
  }, [shouldPoll, utils]);

  const setTarget = trpc.recipes.wizard.setTargetCount.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getSuggestionProgress.invalidate();
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
    },
  });

  const requestMore = trpc.recipes.wizard.requestMoreSuggestions.useMutation({
    onSuccess: () => {
      // Mark that we've started an AI request
      setIsRequestingAI(true);
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
    },
  });

  // Clear the local requesting state when we have a completed response (received or expired/error)
  // Keep it true while pending so the polling continues
  useEffect(() => {
    if (currentSuggestion?.status === 'received' || currentSuggestion?.status === 'expired') {
      setIsRequestingAI(false);
    }
  }, [currentSuggestion?.status]);

  const completeStep = trpc.recipes.wizard.completeStep2.useMutation({
    onSuccess: () => {
      // Invalidate both getSession and start queries to ensure UI updates
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      onStepComplete();
    },
  });

  // Wizard-specific accept/decline mutations (these handle batch assignment and swap logic)
  const acceptSuggestion = trpc.recipes.wizard.acceptSuggestion.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
      utils.recipes.wizard.getSuggestionProgress.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
    },
  });

  const declineSuggestion = trpc.recipes.wizard.declineSuggestion.useMutation({
    onSuccess: () => {
      // This mutation swaps in a hidden suggestion, so just refetch
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
    },
  });

  // Handlers that use wizard mutations
  const handleAccept = (suggestionId: string, mealIndex: number, servings: number) => {
    acceptSuggestion.mutate({ suggestionId, mealIndex, servings });
  };

  const handleReject = (suggestionId: string, mealIndex: number) => {
    declineSuggestion.mutate({ suggestionId, mealIndex });
  };

  const [targetCount, setTargetCount] = useState(session.targetMealCount ?? 4);
  const hasSetTarget = session.targetMealCount != null;

  // Show loading state if we're fetching initial suggestion data after setting target
  const isInitialLoading = hasSetTarget && isSuggestionLoading;

  // Calculate date range for next week
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() + 1); // Start tomorrow
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // 7 days total
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }, []);

  const handleSetTarget = async () => {
    await setTarget.mutateAsync({ count: targetCount });
    // Automatically request first batch of suggestions
    await requestMore.mutateAsync({
      dateRangeStart: dateRange.start,
      dateRangeEnd: dateRange.end,
      mealTypes: ['dinner'],
    });
  };

  // Get visible suggestions - only show up to visibleCount, rest are hidden backups
  const visibleCount = currentSuggestion?.visibleCount ?? currentSuggestion?.suggestions?.length ?? 0;
  const allSuggestions = currentSuggestion?.suggestions ?? [];

  // Filter to visible suggestions (first N that are not accepted/rejected)
  // When a suggestion is rejected, visibleCount should be increased by the backend
  // to reveal the next hidden suggestion
  const pendingSuggestions = allSuggestions
    .slice(0, visibleCount)
    .filter((s) => s.accepted === null || s.accepted === undefined);

  const acceptedCount = progress?.acceptedCount ?? 0;
  const canContinue = acceptedCount >= targetCount;

  // Target count input screen
  if (!hasSetTarget) {
    return (
      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-medium">How Many Meals?</h2>
          <p className="text-sm text-muted-foreground">
            Choose how many meals you want for your new batch.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target">Number of meals</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTargetCount((prev) => Math.max(1, prev - 1))}
                disabled={targetCount <= 1}
                aria-label="Decrease"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Input
                id="target"
                type="number"
                min={1}
                max={21}
                value={targetCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= 21) {
                    setTargetCount(val);
                  } else if (e.target.value === '') {
                    setTargetCount(1);
                  }
                }}
                className="text-lg text-center w-20"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTargetCount((prev) => Math.min(21, prev + 1))}
                disabled={targetCount >= 21}
                aria-label="Increase"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              How many dinners do you need?
            </p>
          </div>

          {/* Quick presets */}
          <div className="flex gap-2">
            {[5, 7, 10, 14].map((n) => (
              <Button
                key={n}
                variant={targetCount === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetCount(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleSetTarget}
          disabled={setTarget.isPending || requestMore.isPending}
        >
          {setTarget.isPending || requestMore.isPending ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
              Getting suggestions...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Get Suggestions
            </>
          )}
        </Button>
      </div>
    );
  }

  // Determine if we should show the loading spinner
  const showLoadingSpinner = isInitialLoading || isRequestingAI || currentSuggestion?.status === 'pending';

  return (
    <div className="p-4 space-y-4 pb-40 md:pb-24">
      <SuggestionProgress accepted={acceptedCount} target={targetCount} />

      {/* Loading state */}
      {showLoadingSpinner && (
        <div className="text-center py-8">
          <LoadingSpinner />
          <p className="text-sm text-muted-foreground mt-4">
            Getting AI suggestions...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This may take a minute
          </p>
        </div>
      )}

      {/* Error state - show when status is 'expired' (error) or 'received' with error */}
      {(currentSuggestion?.status === 'expired' || (currentSuggestion?.status === 'received' && currentSuggestion.error)) && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Failed to get suggestions</p>
            <p className="text-sm mt-1">{currentSuggestion?.error || 'An error occurred while generating suggestions. Please try again.'}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => requestMore.mutate({
                dateRangeStart: dateRange.start,
                dateRangeEnd: dateRange.end,
                mealTypes: ['dinner'],
              })}
              disabled={requestMore.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Pending suggestions list */}
      {pendingSuggestions.length > 0 && (
        <div className="space-y-3">
          {pendingSuggestions.map((suggestion) => {
            // Find the actual index in the full suggestions array
            const actualIndex = currentSuggestion!.suggestions!.findIndex(
              (s) => s === suggestion
            );
            return (
              <MealSuggestionCard
                key={`${currentSuggestion!.id}-${actualIndex}`}
                suggestionId={currentSuggestion!.id}
                mealIndex={actualIndex}
                meal={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
                isAccepting={acceptSuggestion.isPending}
                isRejecting={declineSuggestion.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Need more suggestions */}
      {pendingSuggestions.length === 0 &&
        !showLoadingSpinner &&
        !canContinue && (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              Need more options? Request additional suggestions.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                requestMore.mutate({
                  dateRangeStart: dateRange.start,
                  dateRangeEnd: dateRange.end,
                  mealTypes: ['dinner'],
                })
              }
              disabled={requestMore.isPending}
            >
              {requestMore.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                  Getting more...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get More Suggestions
                </>
              )}
            </Button>
          </div>
        )}

      {/* Continue Button - fixed at bottom, above mobile nav */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <Button
          className="w-full"
          disabled={!canContinue || completeStep.isPending}
          onClick={() => completeStep.mutate()}
        >
          {canContinue
            ? completeStep.isPending
              ? 'Processing...'
              : 'Continue to Shopping'
            : `Accept ${targetCount - acceptedCount} more meal${
                targetCount - acceptedCount !== 1 ? 's' : ''
              }`}
        </Button>
      </div>
    </div>
  );
}
