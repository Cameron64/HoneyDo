/**
 * Meal Detail Sheet
 *
 * Shows full recipe details for an accepted meal.
 * Uses RecipeDetailSheet internally for consistent recipe display.
 */

import { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { trpc } from '@/lib/trpc';
import type { AcceptedMeal } from '@honeydo/shared';
import { RecipeDetailSheet } from '../common/RecipeDetailSheet';

interface MealDetailSheetProps {
  meal: AcceptedMeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MealDetailSheet({ meal, open, onOpenChange }: MealDetailSheetProps) {
  const utils = trpc.useUtils();
  const historyPushed = useRef(false);
  const closingFromPopState = useRef(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

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

  const handleRemove = () => {
    setShowRemoveDialog(true);
  };

  const confirmRemove = () => {
    removeMeal.mutate(meal.id);
    setShowRemoveDialog(false);
  };

  // Convert meal recipe data to the format RecipeDetailSheet expects
  const recipe = {
    id: meal.id, // Use meal id since recipeData doesn't have its own id
    name: meal.recipeName,
    description: meal.recipeData.description,
    source: meal.recipeData.source,
    sourceUrl: meal.recipeData.sourceUrl,
    cuisine: meal.recipeData.cuisine,
    prepTimeMinutes: meal.recipeData.prepTimeMinutes,
    cookTimeMinutes: meal.recipeData.cookTimeMinutes,
    totalTimeMinutes: meal.recipeData.totalTimeMinutes,
    effort: meal.recipeData.effort,
    defaultServings: meal.recipeData.defaultServings,
    ingredients: meal.recipeData.ingredients,
    instructions: meal.recipeData.instructions,
    tags: meal.recipeData.tags,
    nutrition: meal.recipeData.nutrition,
  };

  const mealContext = {
    date: meal.date,
    mealType: meal.mealType,
    servings: meal.servings,
    shoppingListGenerated: meal.shoppingListGenerated,
  };

  const footer = (
    <Button
      variant="destructive"
      className="w-full"
      onClick={handleRemove}
      disabled={removeMeal.isPending}
    >
      <Trash2 className="h-4 w-4 mr-2" />
      {removeMeal.isPending ? 'Removing...' : 'Remove from Plan'}
    </Button>
  );

  return (
    <>
      <RecipeDetailSheet
        recipe={recipe}
        open={open}
        onOpenChange={onOpenChange}
        mealContext={mealContext}
        footer={footer}
      />

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Meal</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{meal.recipeName}" from your plan? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
