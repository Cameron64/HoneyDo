import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Sparkles, RefreshCw, CheckCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { MealSuggestionCard } from './MealSuggestionCard';
import { RequestSuggestionsDialog } from './RequestSuggestionsDialog';
import type { MealSuggestions } from '@honeydo/shared';

export function SuggestionsPage() {
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  // Set up real-time sync
  useRecipesSync();

  // Fetch current suggestions
  // Poll every 5 seconds when status is pending to catch updates
  const { data: suggestions, isLoading, error, refetch } = trpc.recipes.suggestions.getCurrent.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll while pending
      return data?.status === 'pending' ? 5000 : false;
    },
  });

  const utils = trpc.useUtils();

  const acceptAll = trpc.recipes.suggestions.acceptAll.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <SuggestionsHeader onRequestNew={() => setShowRequestDialog(true)} />
        <div className="flex flex-col items-center justify-center h-64 text-center p-4">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-destructive mb-2">Error loading suggestions</p>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
        <RequestSuggestionsDialog
          open={showRequestDialog}
          onOpenChange={setShowRequestDialog}
        />
      </div>
    );
  }

  // No suggestions yet
  if (!suggestions) {
    return (
      <div className="flex flex-col h-full">
        <SuggestionsHeader onRequestNew={() => setShowRequestDialog(true)} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Suggestions Yet</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Get personalized meal suggestions based on your preferences
          </p>
          <Button size="lg" onClick={() => setShowRequestDialog(true)}>
            <Sparkles className="h-5 w-5 mr-2" />
            Get Suggestions
          </Button>
        </div>
        <RequestSuggestionsDialog
          open={showRequestDialog}
          onOpenChange={setShowRequestDialog}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <SuggestionsHeader
        onRequestNew={() => setShowRequestDialog(true)}
        suggestions={suggestions}
      />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Status Banner */}
        <SuggestionStatusBanner suggestions={suggestions} />

        {/* Suggestions List */}
        {suggestions.status === 'received' && suggestions.suggestions && (
          <>
            {/* Summary & Actions */}
            <SuggestionsSummary
              suggestions={suggestions}
              onAcceptAll={() => acceptAll.mutate(suggestions.id)}
              isAcceptingAll={acceptAll.isPending}
            />

            {/* Meal Cards */}
            <div className="space-y-4">
              {suggestions.suggestions.map((meal, index) => (
                <MealSuggestionCard
                  key={`${meal.date}-${meal.mealType}`}
                  suggestionId={suggestions.id}
                  mealIndex={index}
                  meal={meal}
                />
              ))}
            </div>

            {/* Reasoning */}
            {suggestions.reasoning && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AI Reasoning</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {suggestions.reasoning}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <RequestSuggestionsDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
      />
    </div>
  );
}

function SuggestionsHeader({
  onRequestNew,
  suggestions,
}: {
  onRequestNew: () => void;
  suggestions?: MealSuggestions;
}) {
  return (
    <div className="sticky top-0 bg-background z-10 border-b p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/recipes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Suggestions</h1>
            {suggestions && (
              <p className="text-sm text-muted-foreground">
                {formatDateRange(suggestions.dateRangeStart, suggestions.dateRangeEnd)}
              </p>
            )}
          </div>
        </div>
        <Button onClick={onRequestNew} size="sm">
          <Sparkles className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>
    </div>
  );
}

function SuggestionStatusBanner({ suggestions }: { suggestions: MealSuggestions }) {
  if (suggestions.status === 'pending') {
    return (
      <Card className="border-blue-500 bg-blue-500/5">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <div>
              <p className="font-medium">Generating suggestions...</p>
              <p className="text-sm text-muted-foreground">
                This may take a minute or two
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (suggestions.error) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Generation failed</p>
              <p className="text-sm text-muted-foreground">{suggestions.error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function SuggestionsSummary({
  suggestions,
  onAcceptAll,
  isAcceptingAll,
}: {
  suggestions: MealSuggestions;
  onAcceptAll: () => void;
  isAcceptingAll: boolean;
}) {
  const meals = suggestions.suggestions ?? [];
  const pending = meals.filter((m) => m.accepted === null).length;
  const accepted = meals.filter((m) => m.accepted === true).length;
  const rejected = meals.filter((m) => m.accepted === false).length;

  // All reviewed
  if (pending === 0 && meals.length > 0) {
    return (
      <Card className="bg-green-500/5 border-green-500">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCheck className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium">All meals reviewed!</p>
                <p className="text-sm text-muted-foreground">
                  {accepted} accepted, {rejected} rejected
                </p>
              </div>
            </div>
            <Link to="/recipes/shop">
              <Button size="sm">
                Generate Shopping List
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{pending} pending</Badge>
        {accepted > 0 && (
          <Badge variant="default" className="bg-green-600">
            {accepted} accepted
          </Badge>
        )}
        {rejected > 0 && (
          <Badge variant="secondary" className="opacity-60">
            {rejected} rejected
          </Badge>
        )}
      </div>
      {pending > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAcceptAll}
          disabled={isAcceptingAll}
        >
          <CheckCheck className="h-4 w-4 mr-2" />
          Accept All ({pending})
        </Button>
      )}
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${startStr} - ${endStr}`;
}
