import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Search,
  Clock,
  ChefHat,
  Star,
  Trash2,
  ExternalLink,
  Filter,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { RecipeDetailSheet } from '../common/RecipeDetailSheet';

interface RecipeToDelete {
  id: string;
  name: string;
}

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

export function RecipeLibraryPage() {
  const [search, setSearch] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'lastMade' | 'rating' | 'timesMade'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [recipeToDelete, setRecipeToDelete] = useState<RecipeToDelete | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<HistoryRecipe | null>(null);

  const utils = trpc.useUtils();

  // Fetch recipes
  const { data, isLoading } = trpc.recipes.history.getAll.useQuery({
    search: search || undefined,
    cuisine: cuisineFilter !== 'all' ? cuisineFilter : undefined,
    sortBy,
    sortOrder,
  });

  // Fetch cuisines for filter
  const { data: cuisines } = trpc.recipes.history.getCuisines.useQuery();

  // Delete mutation
  const deleteMutation = trpc.recipes.history.delete.useMutation({
    onSuccess: () => {
      utils.recipes.history.getAll.invalidate();
      utils.recipes.history.getCuisines.invalidate();
      setRecipeToDelete(null);
    },
  });

  const handleDelete = () => {
    if (recipeToDelete) {
      deleteMutation.mutate(recipeToDelete.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b p-4">
        <div className="flex items-center gap-3">
          <Link to="/recipes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Recipe Library</h1>
            <p className="text-sm text-muted-foreground">
              {data?.metadata.totalRecipes ?? 0} recipes
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-4 space-y-3 border-b">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={cuisineFilter} onValueChange={setCuisineFilter}>
            <SelectTrigger className="flex-1">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Cuisine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cuisines</SelectItem>
              {cuisines?.map((cuisine) => (
                <SelectItem key={cuisine} value={cuisine}>
                  {cuisine}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="lastMade">Last Made</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
              <SelectItem value="timesMade">Times Made</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !data?.recipes || data.recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ChefHat className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {search || cuisineFilter !== 'all' ? 'No recipes match your filters' : 'No recipes in library'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.recipes.map((recipe) => (
              <Card
                key={recipe.id}
                className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedRecipe(recipe)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">{recipe.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {recipe.cuisine}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground mt-1">
                        {recipe.source}
                        {recipe.sourceUrl && (
                          <a
                            href={recipe.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center ml-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {recipe.totalTimeMinutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <ChefHat className="h-3 w-3" />
                          Effort {recipe.effort}/5
                        </span>
                        {recipe.nutrition?.calories != null && (
                          <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <Flame className="h-3 w-3" />
                            {recipe.nutrition.calories} cal
                          </span>
                        )}
                        {recipe.rating && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                            {recipe.rating}
                          </span>
                        )}
                        {recipe.timesMade && recipe.timesMade > 0 && (
                          <span>Made {recipe.timesMade}x</span>
                        )}
                      </div>

                      {recipe.lastMade && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last made: {formatDate(recipe.lastMade)}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecipeToDelete({ id: recipe.id, name: recipe.name });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!recipeToDelete} onOpenChange={(open) => !open && setRecipeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{recipeToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recipe Detail Sheet */}
      <RecipeDetailSheet
        recipe={selectedRecipe}
        open={!!selectedRecipe}
        onOpenChange={(open) => !open && setSelectedRecipe(null)}
      />
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
