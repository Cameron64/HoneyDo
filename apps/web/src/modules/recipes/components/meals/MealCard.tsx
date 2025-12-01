import { useState } from 'react';
import { Clock, ShoppingCart, Check, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useSwipeGesture } from '@/hooks/use-swipe-gesture';
import type { AcceptedMeal } from '@honeydo/shared';
import { AudibleDialog } from './AudibleDialog';

interface MealCardProps {
  meal: AcceptedMeal;
  onClick: () => void;
}

export function MealCard({ meal, onClick }: MealCardProps) {
  const utils = trpc.useUtils();
  const [audibleDialogOpen, setAudibleDialogOpen] = useState(false);

  const markCompletedMutation = trpc.recipes.meals.markCompleted.useMutation({
    onMutate: async () => {
      // Optimistic update - cancel in-flight queries
      await utils.recipes.meals.getRange.cancel();
      await utils.recipes.meals.getUpcoming.cancel();
    },
    onSuccess: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
    },
  });

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    markCompletedMutation.mutate({
      mealId: meal.id,
      completed: !meal.completed,
    });
  };

  const handleSwipeRight = () => {
    // Toggle completed status
    markCompletedMutation.mutate({
      mealId: meal.id,
      completed: !meal.completed,
    });
  };

  const handleSwipeLeft = () => {
    // Open audible dialog for meal swap
    setAudibleDialogOpen(true);
  };

  const { handlers, swipeState, revealPercent, isThresholdMet } = useSwipeGesture({
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft,
    threshold: 80,
  });

  return (
    <>
      <div className="relative overflow-hidden rounded-lg">
        {/* Background indicators - revealed during swipe */}
        <div className="absolute inset-0 flex">
          {/* Left side - Complete indicator (revealed on swipe right) */}
          <div
            className={cn(
              'flex items-center justify-start pl-4 transition-colors',
              meal.completed
                ? 'bg-orange-500' // Undo complete
                : 'bg-green-500', // Mark complete
            )}
            style={{
              width: '50%',
              opacity: swipeState.direction === 'right' ? revealPercent : 0,
            }}
          >
            <div
              className={cn(
                'flex items-center gap-2 text-white font-medium transition-transform',
                isThresholdMet && swipeState.direction === 'right' && 'scale-110',
              )}
            >
              <Check className="h-5 w-5" />
              <span className="text-sm">
                {meal.completed ? 'Undo' : 'Done'}
              </span>
            </div>
          </div>
          {/* Right side - Audible (swap) indicator (revealed on swipe left) */}
          <div
            className={cn(
              'flex items-center justify-end pr-4 bg-blue-500 ml-auto',
            )}
            style={{
              width: '50%',
              opacity: swipeState.direction === 'left' ? revealPercent : 0,
            }}
          >
            <div
              className={cn(
                'flex items-center gap-2 text-white font-medium transition-transform',
                isThresholdMet && swipeState.direction === 'left' && 'scale-110',
              )}
            >
              <span className="text-sm">Swap</span>
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Main card content */}
        <Card
          className={cn(
            'cursor-pointer hover:bg-muted/50 transition-all relative',
            meal.completed && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900',
            swipeState.isSwiping && 'transition-none',
          )}
          style={{
            transform: `translateX(${swipeState.offsetX}px)`,
            transition: swipeState.isSwiping ? 'none' : 'transform 0.2s ease-out',
          }}
          onClick={onClick}
          {...handlers}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {/* Completed Checkbox */}
              <div
                className="shrink-0"
                onClick={handleCheckboxClick}
              >
                <Checkbox
                  checked={meal.completed}
                  disabled={markCompletedMutation.isPending}
                  className={cn(
                    'h-5 w-5',
                    meal.completed && 'bg-green-500 border-green-500 text-white'
                  )}
                />
              </div>

              {/* Meal Type Badge */}
              <Badge
                variant="secondary"
                className={cn(
                  'capitalize shrink-0',
                  meal.completed && 'bg-green-100 dark:bg-green-900/50'
                )}
              >
                {meal.mealType}
              </Badge>

              {/* Recipe Info */}
              <div className="flex-1 min-w-0">
                <h4
                  className={cn(
                    'font-medium text-sm truncate',
                    meal.completed && 'line-through text-muted-foreground'
                  )}
                >
                  {meal.recipeName}
                </h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {meal.recipeData.totalTimeMinutes} min
                  </span>
                  <span>{meal.servings} servings</span>
                  <span>{meal.recipeData.cuisine}</span>
                </div>
              </div>

              {/* Status Badges */}
              {meal.completed ? (
                <Badge
                  variant="outline"
                  className="shrink-0 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border-green-300"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Cooked
                </Badge>
              ) : !meal.shoppingListGenerated ? (
                <Badge variant="outline" className="shrink-0 text-xs">
                  <ShoppingCart className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audible Dialog */}
      <AudibleDialog
        meal={meal}
        open={audibleDialogOpen}
        onOpenChange={setAudibleDialogOpen}
      />
    </>
  );
}
