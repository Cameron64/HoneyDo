import { useEffect, useRef } from 'react';
import { Clock, Users, ChefHat, ExternalLink, Trash2, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import type { AcceptedMeal } from '@honeydo/shared';

interface MealDetailSheetProps {
  meal: AcceptedMeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];

export function MealDetailSheet({ meal, open, onOpenChange }: MealDetailSheetProps) {
  const utils = trpc.useUtils();
  const historyPushed = useRef(false);
  const closingFromPopState = useRef(false);

  // Handle browser back button / swipe-back gesture
  useEffect(() => {
    if (open && !historyPushed.current) {
      // Push a history state when sheet opens
      window.history.pushState({ sheetOpen: true }, '');
      historyPushed.current = true;
    }

    const handlePopState = () => {
      // When user navigates back, close the sheet instead
      if (historyPushed.current) {
        historyPushed.current = false;
        closingFromPopState.current = true;
        onOpenChange(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [open, onOpenChange]);

  // Clean up history state when sheet closes programmatically (not from back button)
  useEffect(() => {
    if (!open && historyPushed.current && !closingFromPopState.current) {
      // Sheet was closed by clicking X or outside - pop the history state
      window.history.back();
      historyPushed.current = false;
    }
    closingFromPopState.current = false;
  }, [open]);

  const removeMeal = trpc.recipes.meals.remove.useMutation({
    onSuccess: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      onOpenChange(false);
    },
  });

  if (!meal) return null;

  const recipe = meal.recipeData;

  const handleRemove = () => {
    if (confirm('Remove this meal from your plan?')) {
      removeMeal.mutate(meal.id);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {meal.mealType}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatDate(meal.date)}
            </span>
          </div>
          <SheetTitle className="text-xl">{meal.recipeName}</SheetTitle>
          {recipe.description && (
            <SheetDescription>{recipe.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Quick Info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-medium">{recipe.totalTimeMinutes} min</p>
              <p className="text-xs text-muted-foreground">Total time</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-medium">{meal.servings}</p>
              <p className="text-xs text-muted-foreground">Servings</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <ChefHat className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm font-medium">{EFFORT_LABELS[recipe.effort - 1]}</p>
              <p className="text-xs text-muted-foreground">Effort</p>
            </div>
          </div>

          {/* Nutrition/Macros */}
          {recipe.nutrition && recipe.nutrition.calories != null && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border border-orange-200/50 dark:border-orange-800/30">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="h-4 w-4 text-orange-500" />
                <h4 className="text-sm font-medium">Nutrition per serving</h4>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {recipe.nutrition.calories}
                  </p>
                  <p className="text-xs text-muted-foreground">cal</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {recipe.nutrition.protein ?? '-'}g
                  </p>
                  <p className="text-xs text-muted-foreground">protein</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {recipe.nutrition.carbohydrates ?? '-'}g
                  </p>
                  <p className="text-xs text-muted-foreground">carbs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-pink-600 dark:text-pink-400">
                    {recipe.nutrition.fat ?? '-'}g
                  </p>
                  <p className="text-xs text-muted-foreground">fat</p>
                </div>
              </div>
            </div>
          )}

          {/* Source */}
          {recipe.source && (
            <div>
              <h4 className="text-sm font-medium mb-2">Source</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{recipe.source}</span>
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    View Recipe
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Time Breakdown */}
          <div>
            <h4 className="text-sm font-medium mb-2">Time Breakdown</h4>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Prep: {recipe.prepTimeMinutes} min</span>
              <span>Cook: {recipe.cookTimeMinutes} min</span>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Ingredients ({recipe.ingredients.length})
            </h4>
            <ul className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-16 shrink-0">
                    {(ing.amount ?? 0) > 0 && `${ing.amount} ${ing.unit ?? ''}`}
                  </span>
                  <span>{ing.name}</span>
                  {ing.preparation && (
                    <span className="text-xs">({ing.preparation})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Instructions */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Instructions ({recipe.instructions.length} steps)
            </h4>
            <ol className="space-y-2 list-decimal list-inside">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Tags */}
          {recipe.tags && recipe.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Shopping Status */}
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm">
              <span className="font-medium">Shopping: </span>
              {meal.shoppingListGenerated ? (
                <span className="text-green-600">Added to list</span>
              ) : (
                <span className="text-orange-600">Pending</span>
              )}
            </p>
          </div>

          <Separator />

          {/* Remove Button */}
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleRemove}
            disabled={removeMeal.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {removeMeal.isPending ? 'Removing...' : 'Remove from Plan'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
