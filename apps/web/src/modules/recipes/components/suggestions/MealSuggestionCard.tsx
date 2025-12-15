import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Clock, Users, ChefHat, Minus, Plus, Calendar, Loader2, RefreshCw, Flame, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMealDate } from '@/lib/date-utils';
import { trpc } from '@/lib/trpc';
import type { MealSuggestionItem } from '@honeydo/shared';
import { RecipeDetailSheet } from '../common/RecipeDetailSheet';

interface MealSuggestionCardProps {
  suggestionId: string;
  mealIndex: number;
  meal: MealSuggestionItem;
  // Optional handlers for wizard context - if provided, these are called instead of default mutations
  onAccept?: (suggestionId: string, mealIndex: number, servings: number) => void;
  onReject?: (suggestionId: string, mealIndex: number) => void;
  onFetchMore?: (suggestionId: string, mealIndex: number) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
  // Show loading state when backfilling more suggestions
  isBackfilling?: boolean;
  isFetchingMore?: boolean;
}

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];

export function MealSuggestionCard({
  suggestionId,
  mealIndex,
  meal,
  onAccept,
  onReject,
  onFetchMore,
  isAccepting: externalIsAccepting,
  isRejecting: externalIsRejecting,
  isBackfilling = false,
  isFetchingMore: externalIsFetchingMore,
}: MealSuggestionCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [servings, setServings] = useState(meal.servingsOverride ?? meal.recipe.defaultServings);

  const utils = trpc.useUtils();

  // Default mutations for non-wizard context
  const acceptMeal = trpc.recipes.suggestions.acceptMeal.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
    },
  });

  const rejectMeal = trpc.recipes.suggestions.rejectMeal.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
    },
  });

  // Use external loading states if provided (wizard context), otherwise use mutation states
  const isAcceptingMeal = externalIsAccepting ?? acceptMeal.isPending;
  const isRejectingMeal = externalIsRejecting ?? rejectMeal.isPending;

  const setServingsMutation = trpc.recipes.suggestions.setServings.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
    },
  });

  // Fetch more alternatives mutation
  const fetchMoreMutation = trpc.recipes.suggestions.fetchMore.useMutation();

  // Use external loading state or mutation state
  const isFetchingMore = externalIsFetchingMore ?? fetchMoreMutation.isPending;

  const isPending = meal.accepted === null;
  const isAccepted = meal.accepted === true;
  const isRejected = meal.accepted === false;

  const handleAccept = () => {
    if (onAccept) {
      // Wizard context - use provided handler
      onAccept(suggestionId, mealIndex, servings);
    } else {
      // Default context - use mutation directly
      acceptMeal.mutate({
        suggestionId,
        mealIndex,
        servings,
      });
    }
  };

  const handleReject = () => {
    if (onReject) {
      // Wizard context - use provided handler
      onReject(suggestionId, mealIndex);
    } else {
      // Default context - use mutation directly
      rejectMeal.mutate({
        suggestionId,
        mealIndex,
      });
    }
  };

  const handleFetchMore = () => {
    if (onFetchMore) {
      // Wizard context - use provided handler
      onFetchMore(suggestionId, mealIndex);
    } else {
      // Default context - use mutation directly
      fetchMoreMutation.mutate({
        suggestionId,
        mealIndex,
        count: 1, // Just get one alternative
      });
    }
  };

  const handleServingsChange = (delta: number) => {
    const newServings = Math.max(1, Math.min(20, servings + delta));
    if (newServings !== servings) {
      setServings(newServings);
      setServingsMutation.mutate({
        suggestionId,
        mealIndex,
        servings: newServings,
      });
    }
  };

  // Convert meal recipe to RecipeDetailSheet format
  const recipeForSheet = {
    id: `suggestion-${suggestionId}-${mealIndex}`,
    name: meal.recipe.name,
    description: meal.recipe.description,
    source: meal.recipe.source,
    sourceUrl: meal.recipe.sourceUrl,
    cuisine: meal.recipe.cuisine,
    prepTimeMinutes: meal.recipe.prepTimeMinutes,
    cookTimeMinutes: meal.recipe.cookTimeMinutes,
    totalTimeMinutes: meal.recipe.totalTimeMinutes,
    effort: meal.recipe.effort,
    defaultServings: servings,
    ingredients: meal.recipe.ingredients,
    instructions: meal.recipe.instructions,
    tags: meal.recipe.tags,
    nutrition: meal.recipe.nutrition,
  };

  return (
    <>
      <Card
        className={cn(
          'transition-all',
          isAccepted && 'bg-green-500/5 border-green-500',
          isRejected && 'bg-muted/50 border-muted-foreground/20'
        )}
      >
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">
                  {formatMealDate(meal.date)}
                </span>
                <Badge variant="secondary" className="text-xs capitalize">
                  {meal.mealType}
                </Badge>
                {isAccepted && (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    Accepted
                  </Badge>
                )}
                {isRejected && (
                  <Badge variant="secondary" className="text-xs">
                    Rejected
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-lg leading-tight">
                {meal.recipe.name}
              </h3>
            </div>

            {/* Accept/Reject Buttons */}
            {isPending && (
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  className="h-10 px-3"
                  onClick={handleReject}
                  disabled={isRejectingMeal}
                >
                  {isRejectingMeal && isBackfilling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Pass
                    </>
                  ) : (
                    'Pass'
                  )}
                </Button>
                <Button
                  className="h-10 px-3 bg-green-600 hover:bg-green-700"
                  onClick={handleAccept}
                  disabled={isAcceptingMeal}
                >
                  Save
                </Button>
              </div>
            )}

            {/* View in Plan link for accepted meals */}
            {isAccepted && (
              <Link to="/recipes/plan">
                <Button variant="outline" size="sm" className="shrink-0">
                  <Calendar className="h-4 w-4 mr-1" />
                  View in Plan
                </Button>
              </Link>
            )}

            {/* Get Another button for rejected meals */}
            {isRejected && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleFetchMore}
                disabled={isFetchingMore}
              >
                {isFetchingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Finding...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Get Another
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Quick Info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {meal.recipe.totalTimeMinutes} min
            </span>
            <span className="flex items-center gap-1">
              <ChefHat className="h-4 w-4" />
              {EFFORT_LABELS[meal.recipe.effort - 1]}
            </span>
            {meal.recipe.nutrition?.calories != null && (
              <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <Flame className="h-4 w-4" />
                {meal.recipe.nutrition.calories} cal
              </span>
            )}
            <Badge variant="outline" className="text-xs">
              {meal.recipe.cuisine}
            </Badge>
          </div>

          {/* Description */}
          {meal.recipe.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {meal.recipe.description}
            </p>
          )}

          {/* Servings Control */}
          {isPending && (
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="h-4 w-4" />
                Servings:
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleServingsChange(-1)}
                  disabled={servings <= 1 || setServingsMutation.isPending}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-medium">{servings}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleServingsChange(1)}
                  disabled={servings >= 20 || setServingsMutation.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* View Full Recipe Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-muted-foreground"
            onClick={() => setShowDetails(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View full recipe
          </Button>
        </CardContent>
      </Card>

      {/* Recipe Detail Sheet */}
      <RecipeDetailSheet
        recipe={recipeForSheet}
        open={showDetails}
        onOpenChange={setShowDetails}
      />
    </>
  );
}

