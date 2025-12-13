import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Utensils, Settings, Calendar, ShoppingCart, ChevronRight, Clock, RefreshCw, Wand2, BookOpen, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../hooks/use-recipes-sync';
import { MealDetailSheet } from './meals/MealDetailSheet';
import { AudibleDialog } from './meals/AudibleDialog';
import { RecipeImportSheet } from './import/RecipeImportSheet';
import type { AcceptedMeal } from '@honeydo/shared';

export function RecipesPage() {
  // Set up real-time sync
  useRecipesSync();

  // State for meal detail sheet and audible dialog
  const [selectedMeal, setSelectedMeal] = useState<AcceptedMeal | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [audibleMeal, setAudibleMeal] = useState<AcceptedMeal | null>(null);
  const [audibleDialogOpen, setAudibleDialogOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  // Fetch pending shopping count from current batch (not date-based)
  const { data: pendingCount } = trpc.recipes.meals.getCurrentBatchPendingShoppingCount.useQuery();
  // Fetch meals from the current active batch
  const { data: batchData, isLoading: mealsLoading } = trpc.recipes.meals.getCurrentBatch.useQuery();
  const currentBatchMeals = batchData?.meals;
  const currentBatch = batchData?.batch;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Utensils className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Meal Planning</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setImportSheetOpen(true)}
              title="Import Recipe"
            >
              <Link2 className="h-5 w-5" />
            </Button>
            <Link to="/recipes/preferences">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* New Batch Wizard - Primary Action */}
        <Link to="/recipes/wizard" className="block">
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/20">
                    <Wand2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">New Batch</p>
                    <p className="text-xs text-muted-foreground">
                      Plan your week with AI suggestions
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/recipes/plan" className="block">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Meal Plan</p>
                      <p className="text-xs text-muted-foreground">View calendar</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/recipes/shop" className="block">
            <Card className={(pendingCount?.count ?? 0) > 0 ? 'border-orange-500 bg-orange-500/5' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${(pendingCount?.count ?? 0) > 0 ? 'bg-orange-500/10' : 'bg-muted'}`}>
                      <ShoppingCart className={`h-5 w-5 ${(pendingCount?.count ?? 0) > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Shopping</p>
                      {(pendingCount?.count ?? 0) > 0 ? (
                        <Badge variant="outline" className="mt-1 border-orange-500 text-orange-600">{pendingCount?.count} meals</Badge>
                      ) : (
                        <p className="text-xs text-muted-foreground">Generate list</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/recipes/history" className="block">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Batch History</p>
                      <p className="text-xs text-muted-foreground">Past batches</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/recipes/library" className="block">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Recipe Library</p>
                      <p className="text-xs text-muted-foreground">Browse recipes</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Current Batch Meals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Batch</CardTitle>
              <Link to="/recipes/batch">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  View all
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            {currentBatch && (
              <p className="text-sm text-muted-foreground">{currentBatch.name}</p>
            )}
          </CardHeader>
          <CardContent>
            {mealsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : !currentBatchMeals || currentBatchMeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-2">No meals in current batch</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a new batch to plan your week
                </p>
                <Link to="/recipes/wizard">
                  <Button>
                    <Wand2 className="h-4 w-4 mr-2" />
                    New Batch
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {currentBatchMeals.slice(0, 5).map((meal) => (
                  <div
                    key={meal.id}
                    className="group flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedMeal(meal);
                      setDetailSheetOpen(true);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {meal.recipeName}
                        </span>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {meal.mealType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{formatMealDate(meal.date)}</span>
                        {meal.recipeData.totalTimeMinutes > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {meal.recipeData.totalTimeMinutes} min
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!meal.shoppingListGenerated && (
                        <Badge variant="outline" className="text-xs">
                          Pending shop
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAudibleMeal(meal);
                          setAudibleDialogOpen(true);
                        }}
                        title="Swap meal"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {currentBatchMeals.length > 5 && (
                  <Link to="/recipes/batch">
                    <Button variant="ghost" size="sm" className="w-full">
                      View {currentBatchMeals.length - 5} more meals
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Meal Detail Sheet */}
      <MealDetailSheet
        meal={selectedMeal}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />

      {/* Audible Dialog for swapping meals */}
      <AudibleDialog
        meal={audibleMeal}
        open={audibleDialogOpen}
        onOpenChange={setAudibleDialogOpen}
      />

      {/* Recipe Import Sheet */}
      <RecipeImportSheet
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
      />
    </div>
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

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
