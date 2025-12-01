import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Clock, Users, ChefHat, ChevronDown, ChevronUp, Minus, Plus, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import type { MealSuggestionItem } from '@honeydo/shared';

interface MealSuggestionCardProps {
  suggestionId: string;
  mealIndex: number;
  meal: MealSuggestionItem;
  // Optional handlers for wizard context - if provided, these are called instead of default mutations
  onAccept?: (suggestionId: string, mealIndex: number, servings: number) => void;
  onReject?: (suggestionId: string, mealIndex: number) => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
}

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];

export function MealSuggestionCard({
  suggestionId,
  mealIndex,
  meal,
  onAccept,
  onReject,
  isAccepting: externalIsAccepting,
  isRejecting: externalIsRejecting,
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

  return (
    <Card
      className={cn(
        'transition-all',
        isAccepted && 'bg-green-500/5 border-green-500',
        isRejected && 'opacity-50 bg-muted'
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
                Pass
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

        {/* Expandable Details */}
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between -mx-2">
              <span className="text-muted-foreground text-sm">
                {showDetails ? 'Hide full recipe' : 'View full recipe'}
              </span>
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-4">
            {/* Source with Link */}
            {meal.recipe.source && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    From: <span className="font-medium text-foreground">{meal.recipe.source}</span>
                  </span>
                </div>
                {meal.recipe.sourceUrl && (
                  <a
                    href={meal.recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    Open original
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            <Separator />

            {/* Time Breakdown */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Prep</p>
                <p className="font-semibold">{meal.recipe.prepTimeMinutes} min</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Cook</p>
                <p className="font-semibold">{meal.recipe.cookTimeMinutes} min</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">{meal.recipe.totalTimeMinutes} min</p>
              </div>
            </div>

            <Separator />

            {/* Full Ingredients List */}
            <div>
              <p className="text-sm font-semibold mb-2">
                Ingredients ({meal.recipe.ingredients.length})
              </p>
              <ul className="space-y-1.5 text-sm">
                {meal.recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0 w-20 text-right">
                      {ing.amount ? `${ing.amount}${ing.unit ? ` ${ing.unit}` : ''}` : ''}
                    </span>
                    <span className="flex-1">
                      {ing.name}
                      {ing.preparation && (
                        <span className="text-muted-foreground text-xs ml-1">({ing.preparation})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            {/* Full Instructions */}
            <div>
              <p className="text-sm font-semibold mb-2">
                Instructions ({meal.recipe.instructions.length} steps)
              </p>
              <ol className="space-y-3">
                {meal.recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Tags */}
            {meal.recipe.tags && meal.recipe.tags.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-1">
                  {meal.recipe.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function formatMealDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
