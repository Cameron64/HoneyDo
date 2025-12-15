/**
 * Recipe Detail Sheet
 *
 * Shows full recipe details including nutrition, ingredients, and instructions.
 * Used in library browsing, wizard recipe selection, and meal detail views.
 * This is the canonical recipe view used throughout the app.
 */

import { Clock, Users, ChefHat, ExternalLink, Flame, UtensilsCrossed } from 'lucide-react';
import { formatDateFull } from '@/lib/date-utils';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecipeNutrition {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
}

interface RecipeIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  preparation?: string | null;
}

interface Recipe {
  id: string;
  name: string;
  description?: string | null;
  source: string;
  sourceUrl?: string | null;
  cuisine: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  ingredients: RecipeIngredient[];
  instructions?: string[];
  tags?: string[];
  nutrition?: RecipeNutrition | null;
  rating?: number | null;
  timesMade?: number;
  lastMade?: string | null;
}

/** Optional meal context when viewing a recipe as part of a meal plan */
interface MealContext {
  date: string;
  mealType: string;
  servings: number;
  shoppingListGenerated?: boolean;
}

interface RecipeDetailSheetProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional footer content (e.g., action buttons) */
  footer?: React.ReactNode;
  /** Optional meal context when viewing from meal plan */
  mealContext?: MealContext;
}

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];

export function RecipeDetailSheet({
  recipe,
  open,
  onOpenChange,
  footer,
  mealContext,
}: RecipeDetailSheetProps) {
  if (!recipe) return null;

  // Use meal servings if provided, otherwise default
  const servings = mealContext?.servings ?? recipe.defaultServings;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-2 flex-wrap">
            {mealContext && (
              <>
                <Badge variant="secondary" className="capitalize">
                  {mealContext.mealType}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatDateFull(mealContext.date)}
                </span>
                <span className="text-muted-foreground">•</span>
              </>
            )}
            <Badge variant="outline">{recipe.cuisine}</Badge>
            {recipe.tags?.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <SheetTitle className="text-xl">{recipe.name}</SheetTitle>
          {recipe.description && (
            <SheetDescription>{recipe.description}</SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-6">
            {/* Quick Info */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{recipe.totalTimeMinutes} min</p>
                <p className="text-xs text-muted-foreground">Total time</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{servings}</p>
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
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4" />
                Ingredients ({recipe.ingredients.length})
              </h4>
              <ul className="space-y-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right">
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
            {recipe.instructions && recipe.instructions.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Instructions ({recipe.instructions.length} steps)
                  </h4>
                  <ol className="space-y-3">
                    {recipe.instructions.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-muted-foreground leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            {/* History Info */}
            {(recipe.rating || recipe.timesMade || recipe.lastMade) && (
              <>
                <Separator />
                <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                  {recipe.rating && (
                    <p>
                      <span className="font-medium">Rating:</span>{' '}
                      {'★'.repeat(recipe.rating)}{'☆'.repeat(5 - recipe.rating)}
                    </p>
                  )}
                  {recipe.timesMade && recipe.timesMade > 0 && (
                    <p>
                      <span className="font-medium">Made:</span> {recipe.timesMade} times
                    </p>
                  )}
                  {recipe.lastMade && (
                    <p>
                      <span className="font-medium">Last made:</span>{' '}
                      {new Date(recipe.lastMade).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </>
            )}

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

            {/* Shopping Status (only shown in meal context) */}
            {mealContext && mealContext.shoppingListGenerated !== undefined && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm">
                  <span className="font-medium">Shopping: </span>
                  {mealContext.shoppingListGenerated ? (
                    <span className="text-green-600">Added to list</span>
                  ) : (
                    <span className="text-orange-600">Pending</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer for action buttons */}
        {footer && (
          <div className="border-t px-6 py-4">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
