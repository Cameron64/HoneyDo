import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Calendar,
  ChefHat,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Clock,
  CheckSquare,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { useRecipesSync } from '../../hooks/use-recipes-sync';

export function BatchHistoryPage() {
  // Set up real-time sync
  useRecipesSync();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const utils = trpc.useUtils();

  // Fetch batch history
  const { data: batches, isLoading } = trpc.recipes.wizard.getBatchHistory.useQuery();

  // Single delete mutation
  const deleteMutation = trpc.recipes.wizard.deleteBatch.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getBatchHistory.invalidate();
      // Also invalidate shopping list since items may have been removed
      utils.shopping.lists.invalidate();
      utils.shopping.items.invalidate();
      setSelectedIds(new Set());
      setShowDeleteDialog(false);
    },
  });

  // Bulk delete mutation
  const deleteManyMutation = trpc.recipes.wizard.deleteBatches.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getBatchHistory.invalidate();
      // Also invalidate shopping list since items may have been removed
      utils.shopping.lists.invalidate();
      utils.shopping.items.invalidate();
      setSelectedIds(new Set());
      setShowDeleteDialog(false);
    },
  });

  const isDeleting = deleteMutation.isPending || deleteManyMutation.isPending;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (batches) {
      setSelectedIds(new Set(batches.map((b) => b.id)));
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 1) {
      deleteMutation.mutate([...selectedIds][0]);
    } else if (selectedIds.size > 1) {
      deleteManyMutation.mutate([...selectedIds]);
    }
  };

  const selectionMode = selectedIds.size > 0;

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
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Recipe History</h1>
            <p className="text-sm text-muted-foreground">
              {batches?.length ?? 0} past {batches?.length === 1 ? 'batch' : 'batches'}
            </p>
          </div>
        </div>
      </div>

      {/* Selection Toolbar */}
      {selectionMode && (
        <div className="sticky top-[73px] bg-muted/80 backdrop-blur-sm z-10 border-b px-4 py-2 flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            {selectedIds.size} selected
          </Badge>
          <div className="flex-1" />
          {batches && selectedIds.size < batches.length && (
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Select All
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete {selectedIds.size > 1 ? `(${selectedIds.size})` : ''}
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : !batches || batches.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                selected={selectedIds.has(batch.id)}
                onToggleSelect={() => handleToggleSelect(batch.id)}
                onDelete={(id) => {
                  setSelectedIds(new Set([id]));
                  setShowDeleteDialog(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size === 1 ? 'Batch' : `${selectedIds.size} Batches`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size === 1
                ? 'Are you sure you want to delete this batch? This will remove all associated meals. This action cannot be undone.'
                : `Are you sure you want to delete ${selectedIds.size} batches? This will remove all associated meals. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : `Delete ${selectedIds.size === 1 ? '' : `(${selectedIds.size})`}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
      <h2 className="text-lg font-semibold mb-2">No Recipe History</h2>
      <p className="text-muted-foreground mb-4 max-w-sm">
        Your completed meal batches will appear here. Start by creating your first batch.
      </p>
      <Link to="/recipes/wizard">
        <Button>Create First Batch</Button>
      </Link>
    </div>
  );
}

interface BatchCardProps {
  batch: {
    id: string;
    name: string | null;
    dateRangeStart: string;
    dateRangeEnd: string;
    totalMeals: number | null;
    completedMeals: number | null;
    rolledOverMeals: number | null;
    discardedMeals: number | null;
    archivedAt: string | null;
    meals: Array<{
      id: string;
      date: string;
      mealType: string;
      recipeName: string;
      completed: boolean;
      isRollover: boolean;
    }>;
  };
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: (id: string) => void;
}

function BatchCard({ batch, selected, onToggleSelect, onDelete }: BatchCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const dateRange = formatDateRange(batch.dateRangeStart, batch.dateRangeEnd);
  const batchDisplayName = batch.name || dateRange;
  const totalMeals = batch.meals?.length ?? batch.totalMeals ?? 0;
  const completedMeals = batch.completedMeals ?? batch.meals?.filter((m) => m.completed).length ?? 0;
  const completionRate = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

  // Group meals by date
  const mealsByDate = (batch.meals ?? []).reduce(
    (acc, meal) => {
      if (!acc[meal.date]) {
        acc[meal.date] = [];
      }
      acc[meal.date].push(meal);
      return acc;
    },
    {} as Record<string, typeof batch.meals>
  );

  const sortedDates = Object.keys(mealsByDate).sort();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={selected ? 'ring-2 ring-primary' : ''}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4">
            <div className="flex items-center justify-between gap-3">
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={onToggleSelect}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold truncate">
                    {batchDisplayName}
                  </h3>
                  {completionRate === 100 && (
                    <Badge variant="default" className="bg-green-500">
                      Complete
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ChefHat className="h-3.5 w-3.5" />
                    {totalMeals} meals
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {completedMeals} made
                  </span>
                  {(batch.rolledOverMeals ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <RotateCcw className="h-3.5 w-3.5" />
                      {batch.rolledOverMeals} rolled over
                    </span>
                  )}
                  {(batch.discardedMeals ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                      {batch.discardedMeals} skipped
                    </span>
                  )}
                </div>
                {batch.archivedAt && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Archived {formatRelativeDate(batch.archivedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(batch.id);
                  }}
                  title="Delete batch"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="shrink-0">
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="border-t pt-4 space-y-4">
              {sortedDates.map((date) => (
                <div key={date}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    {formatDateLabel(date)}
                  </h4>
                  <div className="space-y-2">
                    {mealsByDate[date].map((meal) => (
                      <MealRow key={meal.id} meal={meal} />
                    ))}
                  </div>
                </div>
              ))}
              {sortedDates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No meal details available
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface MealRowProps {
  meal: {
    id: string;
    mealType: string;
    recipeName: string;
    completed: boolean;
    isRollover: boolean;
  };
}

function MealRow({ meal }: MealRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
      <Badge variant="outline" className="capitalize text-xs">
        {meal.mealType}
      </Badge>
      <span className={`flex-1 text-sm ${meal.completed ? 'line-through text-muted-foreground' : ''}`}>
        {meal.recipeName}
      </span>
      <div className="flex items-center gap-1">
        {meal.completed && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        {meal.isRollover && (
          <Badge variant="secondary" className="text-xs">
            <RotateCcw className="h-3 w-3 mr-1" />
            Rolled
          </Badge>
        )}
      </div>
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startStr} - ${endStr}`;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
