import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { SuggestionProgress } from './SuggestionProgress';
import { MealSuggestionCard } from '../../suggestions/MealSuggestionCard';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useRecipesSync } from '../../../hooks/use-recipes-sync';
import { useActivityStore } from '../../../stores/activity';
import { useSocketEvent } from '@/services/socket/hooks';
import { RefreshCw, Sparkles, AlertCircle, Flower2, Hexagon, ChevronLeft } from 'lucide-react';
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

  // Get Claude activity messages from the global store (managed by useRecipesSync)
  const activityMessage = useActivityStore((s) => s.message);
  const activityType = useActivityStore((s) => s.type);
  const activityProgress = useActivityStore((s) => s.progress);
  const clearActivity = useActivityStore((s) => s.clearActivity);

  // Animate progress with jumpy increments toward 95%
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    // When actual progress updates, jump to it immediately
    if (activityProgress > displayProgress) {
      setDisplayProgress(activityProgress);
    }
  }, [activityProgress, displayProgress]);

  useEffect(() => {
    // Jumpy progress toward 95% - random increments at random intervals
    if (displayProgress > 0 && displayProgress < 95) {
      // Random delay between 400ms and 1200ms for jumpier feel
      const delay = 400 + Math.random() * 800;

      const timeout = setTimeout(() => {
        setDisplayProgress((prev) => {
          // Random jump between 2-6%, slowing down as we approach 95%
          const remaining = 95 - prev;
          const maxJump = Math.min(6, remaining * 0.15);
          const minJump = Math.min(2, remaining * 0.05);
          const jump = minJump + Math.random() * (maxJump - minJump);
          const next = Math.min(95, prev + jump);
          return Math.round(next);
        });
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [displayProgress]);

  // Reset display progress when activity clears
  useEffect(() => {
    if (!activityMessage && activityProgress === 0) {
      setDisplayProgress(0);
    }
  }, [activityMessage, activityProgress]);

  // Track backfill state - when we're fetching more hidden suggestions in the background
  const [isBackfilling, setIsBackfilling] = useState(false);
  const backfillRequestedRef = useRef(false);

  // Listen for WebSocket events to reset backfilling state
  const handleBackfillComplete = useCallback(() => {
    setIsBackfilling(false);
    backfillRequestedRef.current = false;
  }, []);

  useSocketEvent('recipes:suggestions:more-received', handleBackfillComplete);
  useSocketEvent('recipes:suggestions:more-error', handleBackfillComplete);

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
      clearActivity(); // Clear activity message when done
    }
  }, [currentSuggestion?.status, clearActivity]);

  const completeStep = trpc.recipes.wizard.completeStep2.useMutation({
    onSuccess: () => {
      // Invalidate both getSession and start queries to ensure UI updates
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      onStepComplete();
    },
  });

  // Go back to previous step
  const goBack = trpc.recipes.wizard.goBack.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSession.invalidate();
      onStepComplete(); // Triggers refetch in parent
    },
  });

  const handleBack = () => {
    // If user had manual picks configured, go back to step 2b (manual picks)
    // Otherwise go back to step 2a (plan batch)
    const hasManualPicks = (session.manualPickCount ?? 0) > 0;
    goBack.mutate({ target: hasManualPicks ? 'step2b' : 'step2a' });
  };

  // Backfill mutation - fetches more hidden suggestions in the background
  const fetchMoreHidden = trpc.recipes.wizard.fetchMoreHiddenSuggestions.useMutation({
    onSuccess: () => {
      setIsBackfilling(false);
      backfillRequestedRef.current = false;
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
    },
    onError: () => {
      setIsBackfilling(false);
      backfillRequestedRef.current = false;
    },
  });

  // Helper to check if we need to fetch more suggestions
  const checkAndTriggerBackfill = useCallback(() => {
    if (!currentSuggestion || backfillRequestedRef.current || isBackfilling) return;

    // Count remaining pending suggestions (not yet accepted/rejected)
    const allSuggestions = currentSuggestion.suggestions ?? [];
    const remainingPending = allSuggestions.filter(
      (s) => s.accepted === null || s.accepted === undefined
    ).length;

    // If running low (5 or fewer pending), proactively fetch more
    if (remainingPending <= 5) {
      backfillRequestedRef.current = true;
      setIsBackfilling(true);
      fetchMoreHidden.mutate({
        suggestionId: currentSuggestion.id,
        count: 6, // Fetch more to stay ahead
      });
    }
  }, [currentSuggestion, isBackfilling, fetchMoreHidden]);

  // Wizard-specific accept/decline mutations (these handle batch assignment and swap logic)
  const acceptSuggestion = trpc.recipes.wizard.acceptSuggestion.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getCurrentSuggestion.invalidate();
      utils.recipes.wizard.getSuggestionProgress.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      // Check if we need more suggestions after accepting
      setTimeout(checkAndTriggerBackfill, 100);
    },
  });

  const declineSuggestion = trpc.recipes.wizard.declineSuggestion.useMutation({
    onSuccess: (data) => {
      // This mutation swaps in a hidden suggestion, so just refetch
      utils.recipes.wizard.getCurrentSuggestion.invalidate();

      // If hidden suggestions are running low, trigger a background backfill
      if (data.needsMoreSuggestions && currentSuggestion && !backfillRequestedRef.current) {
        backfillRequestedRef.current = true;
        setIsBackfilling(true);
        fetchMoreHidden.mutate({
          suggestionId: currentSuggestion.id,
          count: 6, // Fetch more to stay ahead
        });
      }
    },
  });

  // Handlers that use wizard mutations
  const handleAccept = (suggestionId: string, mealIndex: number, servings: number) => {
    acceptSuggestion.mutate({ suggestionId, mealIndex, servings });
  };

  const handleReject = (suggestionId: string, mealIndex: number) => {
    declineSuggestion.mutate({ suggestionId, mealIndex });
  };

  // Calculate AI target count (from new flow: totalMealCount - manualPickCount - rolloverCount)
  // Fall back to targetMealCount for backwards compatibility
  const manualPickCount = session.manualPickCount ?? 0;
  const rolloverCount = session.rolloverCount ?? 0;
  const aiTargetCount = session.totalMealCount != null
    ? session.totalMealCount - manualPickCount - rolloverCount
    : session.targetMealCount ?? 7;

  // Track if we've auto-requested suggestions on mount
  const hasAutoRequested = useRef(false);

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

  // Auto-request suggestions when arriving at this step without any
  useEffect(() => {
    if (hasAutoRequested.current) return;
    if (currentSuggestion?.status === 'pending' || currentSuggestion?.status === 'received') return;
    if (requestMore.isPending || isRequestingAI) return;

    // If we have a totalMealCount (from new flow) but no AI target set, set it and request
    if (session.totalMealCount != null && session.targetMealCount == null) {
      hasAutoRequested.current = true;
      setTarget.mutate({ count: aiTargetCount }, {
        onSuccess: () => {
          requestMore.mutate({
            dateRangeStart: dateRange.start,
            dateRangeEnd: dateRange.end,
            mealTypes: ['dinner'],
          });
        },
      });
    }
    // If we have targetMealCount but no suggestions yet, request them
    else if (session.targetMealCount != null && !currentSuggestion) {
      hasAutoRequested.current = true;
      requestMore.mutate({
        dateRangeStart: dateRange.start,
        dateRangeEnd: dateRange.end,
        mealTypes: ['dinner'],
      });
    }
  }, [session.totalMealCount, session.targetMealCount, aiTargetCount, currentSuggestion, requestMore, setTarget, dateRange, isRequestingAI]);

  // Get all suggestions and filter to pending ones (not yet accepted/rejected)
  const allSuggestions = currentSuggestion?.suggestions ?? [];

  // Show up to 3 pending suggestions at a time for comparison
  // Filter out accepted (true) and rejected (false) suggestions, keep only pending (null/undefined)
  const MAX_VISIBLE_CARDS = 3;
  const pendingSuggestions = allSuggestions
    .map((s, index) => ({ ...s, originalIndex: index }))
    .filter((s) => s.accepted === null || s.accepted === undefined)
    .slice(0, MAX_VISIBLE_CARDS);

  const acceptedCount = progress?.acceptedCount ?? 0;
  const canContinue = acceptedCount >= aiTargetCount;

  // Determine if we should show the loading spinner
  const showLoadingSpinner = isSuggestionLoading || isRequestingAI || currentSuggestion?.status === 'pending';

  return (
    <div className="p-4 space-y-4 pb-40 md:pb-24">
      {/* Only show progress when we have suggestions to display */}
      {pendingSuggestions.length > 0 && (
        <SuggestionProgress accepted={acceptedCount} target={aiTargetCount} />
      )}

      {/* Loading state */}
      {showLoadingSpinner && (
        <div className="text-center py-12">
          <div className="flex items-center justify-center gap-3">
            {activityType === 'thinking' && <Sparkles className="h-8 w-8 text-primary animate-bounce" />}
            {activityType === 'querying' && <Flower2 className="h-8 w-8 text-primary/80 animate-pulse" />}
            {activityType === 'results' && <Hexagon className="h-8 w-8 text-primary" />}
            {!activityType && <Hexagon className="h-8 w-8 text-primary/60 animate-pulse" />}
          </div>

          {/* Progress bar */}
          {displayProgress > 0 && (
            <div className="mt-4 w-48 mx-auto">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{Math.round(displayProgress)}%</p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {activityMessage ? (
              <div className="bg-primary/10 rounded-lg px-4 py-3 inline-block max-w-xs mx-auto">
                <p className="text-sm font-medium text-foreground">
                  {activityMessage}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Getting the vibes ready...
              </p>
            )}
            {!activityMessage && (
              <p className="text-xs text-primary/70">
                One sec, bestie!
              </p>
            )}
          </div>
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

      {/* Pending suggestions list - show up to 3 cards for comparison */}
      {pendingSuggestions.length > 0 && (
        <div className="space-y-3">
          {pendingSuggestions.map((suggestion) => (
            <MealSuggestionCard
              key={`${currentSuggestion!.id}-${suggestion.originalIndex}`}
              suggestionId={currentSuggestion!.id}
              mealIndex={suggestion.originalIndex}
              meal={suggestion}
              onAccept={handleAccept}
              onReject={handleReject}
              isAccepting={acceptSuggestion.isPending}
              isRejecting={declineSuggestion.isPending}
              isBackfilling={isBackfilling}
            />
          ))}
        </div>
      )}

      {/* Need more suggestions */}
      {pendingSuggestions.length === 0 &&
        !showLoadingSpinner &&
        !canContinue && (
          <div className="text-center py-6">
            {isBackfilling ? (
              // Show loading state when backfilling is in progress
              <>
                <LoadingSpinner />
                <p className="text-sm text-muted-foreground mt-4">
                  Getting more suggestions...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  New options are on the way
                </p>
              </>
            ) : (
              // Show manual request button
              <>
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
              </>
            )}
          </div>
        )}

      {/* Continue Button - fixed at bottom, above mobile nav */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={goBack.isPending || completeStep.isPending}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={!canContinue || completeStep.isPending || goBack.isPending}
            onClick={() => completeStep.mutate()}
          >
            {canContinue
              ? completeStep.isPending
                ? 'Processing...'
                : 'Continue to Shopping'
              : `Accept ${aiTargetCount - acceptedCount} more meal${
                  aiTargetCount - acceptedCount !== 1 ? 's' : ''
                }`}
          </Button>
        </div>
      </div>
    </div>
  );
}
