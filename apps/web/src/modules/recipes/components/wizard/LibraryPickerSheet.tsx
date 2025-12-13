/**
 * Library Picker Sheet
 *
 * A bottom sheet that displays the recipe library for selection.
 * User can search and pick a recipe to add to their batch.
 */

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Search,
  Clock,
  ChefHat,
  ChevronUp,
  ChevronDown,
  Check,
  BookOpen,
  Flame,
  Info,
} from 'lucide-react';
import { RecipeDetailSheet } from '../common/RecipeDetailSheet';

// Recipe type from history API
interface HistoryRecipe {
  id: string;
  name: string;
  source: string;
  sourceUrl?: string | null;
  cuisine: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit?: string;
  ingredients: Array<{
    name: string;
    amount: number | null;
    unit: string | null;
    category: string;
  }>;
  instructions?: string[];
  description?: string | null;
  rating?: number | null;
  timesMade?: number;
  lastMade?: string | null;
  tags?: string[];
  nutrition?: {
    calories: number | null;
    protein: number | null;
    carbohydrates: number | null;
    fat: number | null;
    fiber?: number | null;
    sugar?: number | null;
    sodium?: number | null;
  } | null;
}

interface LibraryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (recipeId: string, servings: number) => void;
  /** Recipe IDs to exclude from the list (already selected) */
  excludeRecipeIds?: string[];
}

export function LibraryPickerSheet({
  open,
  onOpenChange,
  onSelect,
  excludeRecipeIds = [],
}: LibraryPickerSheetProps) {
  const [search, setSearch] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [servings, setServings] = useState(4);
  const [viewingRecipe, setViewingRecipe] = useState<HistoryRecipe | null>(null);

  // Get all recipes from library
  const { data: historyData, isLoading } = trpc.recipes.history.getAll.useQuery(undefined, {
    enabled: open,
  });
  const recipes = historyData?.recipes;

  // Filter recipes based on search and exclusions
  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    const excludeSet = new Set(excludeRecipeIds);
    return recipes.filter((recipe) => {
      // Exclude already selected
      if (excludeSet.has(recipe.id)) return false;
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          recipe.name.toLowerCase().includes(searchLower) ||
          recipe.cuisine?.toLowerCase().includes(searchLower) ||
          recipe.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      }
      return true;
    });
  }, [recipes, search, excludeRecipeIds]);

  const selectedRecipe = useMemo(() => {
    return filteredRecipes.find((r) => r.id === selectedRecipeId);
  }, [filteredRecipes, selectedRecipeId]);

  const handleSelect = () => {
    if (selectedRecipeId) {
      onSelect(selectedRecipeId, servings);
      // Reset state
      setSelectedRecipeId(null);
      setServings(4);
      setSearch('');
    }
  };

  const handleClose = () => {
    setSelectedRecipeId(null);
    setServings(4);
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Pick from Library
          </SheetTitle>
          <SheetDescription>
            Select a recipe to add to your batch
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0 mt-4">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Recipe List */}
          <div className="flex-1 overflow-y-auto space-y-2 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {search ? 'No recipes match your search' : 'No recipes in library'}
                </p>
              </div>
            ) : (
              filteredRecipes.map((recipe) => (
                <Card
                  key={recipe.id}
                  className={`cursor-pointer transition-all ${
                    selectedRecipeId === recipe.id
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium truncate">{recipe.name}</h4>
                          {selectedRecipeId === recipe.id && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {recipe.cuisine && <Badge variant="outline" className="text-xs">{recipe.cuisine}</Badge>}
                          {recipe.totalTimeMinutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {recipe.totalTimeMinutes}min
                            </span>
                          )}
                          {recipe.effort && (
                            <span className="flex items-center gap-1">
                              <ChefHat className="h-3 w-3" />
                              {recipe.effort}/5
                            </span>
                          )}
                          {recipe.nutrition?.calories != null && (
                            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                              <Flame className="h-3 w-3" />
                              {recipe.nutrition.calories} cal
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRecipe(recipe);
                        }}
                        title="View details"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Selection Footer */}
          {selectedRecipe && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium truncate">{selectedRecipe.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Default: {selectedRecipe.defaultServings ?? 4} servings
                  </p>
                </div>
              </div>

              {/* Servings Selector */}
              <div className="flex items-center justify-between">
                <Label>Servings</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setServings((prev) => Math.max(1, prev - 1))}
                    disabled={servings <= 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-medium">{servings}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setServings((prev) => Math.min(20, prev + 1))}
                    disabled={servings >= 20}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button className="w-full" onClick={handleSelect}>
                <Check className="h-4 w-4 mr-2" />
                Add to Batch
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

      {/* Recipe Detail Sheet */}
      <RecipeDetailSheet
        recipe={viewingRecipe}
        open={!!viewingRecipe}
        onOpenChange={(open) => !open && setViewingRecipe(null)}
        footer={
          viewingRecipe && (
            <Button
              className="w-full"
              onClick={() => {
                setSelectedRecipeId(viewingRecipe.id);
                setViewingRecipe(null);
              }}
            >
              <Check className="h-4 w-4 mr-2" />
              Select This Recipe
            </Button>
          )
        }
      />
    </Sheet>
  );
}
