import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { IngredientRow } from '../../shopping/IngredientRow';
import type { AggregatedIngredient } from '@honeydo/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
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
import { CheckSquare, Square, AlertCircle, ShoppingCart, Plus, ChevronLeft } from 'lucide-react';
import type { WizardSession } from '@honeydo/shared';

interface ManageShoppingStepProps {
  session: WizardSession;
  onStepComplete: () => void;
}

type ListAction = 'replace' | 'append' | 'new';

export function ManageShoppingStep({ onStepComplete }: ManageShoppingStepProps) {
  const utils = trpc.useUtils();

  const { data: previewData, isLoading: ingredientsLoading } =
    trpc.recipes.wizard.getShoppingPreview.useQuery();
  const { data: lists, isLoading: listsLoading } =
    trpc.recipes.wizard.getExistingLists.useQuery();

  const ingredients = previewData?.ingredients ?? [];

  const completeShopping = trpc.recipes.wizard.completeStep3.useMutation({
    onSuccess: () => {
      // Invalidate both getSession and start queries to ensure UI updates
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      onStepComplete();
    },
  });

  // Go back to previous step (step 2c - AI suggestions)
  const goBack = trpc.recipes.wizard.goBack.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSession.invalidate();
      onStepComplete(); // Triggers refetch in parent
    },
  });

  const handleBack = () => {
    goBack.mutate({ target: 'step2c' });
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listAction, setListAction] = useState<ListAction>('new');
  const [targetListId, setTargetListId] = useState<string | undefined>();
  const [newListName, setNewListName] = useState('');
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // Initialize with all ingredients selected
  useEffect(() => {
    if (ingredients) {
      setSelected(new Set(ingredients.map((i) => i.key)));
    }
  }, [ingredients]);

  // Set default list name based on date
  useEffect(() => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
    setNewListName(
      `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    );
  }, []);

  // Auto-select first list for replace/append
  useEffect(() => {
    if (lists && lists.length > 0 && !targetListId) {
      setTargetListId(lists[0].id);
    }
  }, [lists, targetListId]);

  const toggleIngredient = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
  };

  const selectAll = () => {
    if (ingredients) {
      setSelected(new Set(ingredients.map((i) => i.key)));
    }
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleComplete = async () => {
    if (listAction === 'replace' && targetListId) {
      // Show confirmation for replace
      setShowConfirmReplace(true);
      return;
    }
    await doComplete();
  };

  const doComplete = async () => {
    setShowConfirmReplace(false);
    await completeShopping.mutateAsync({
      selectedIngredients: Array.from(selected),
      listAction,
      listId: listAction !== 'new' ? targetListId : undefined,
      newListName: listAction === 'new' ? newListName : undefined,
    });
  };

  const isLoading = ingredientsLoading || listsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  // No ingredients (e.g., only rollover meals)
  if (!ingredients || ingredients.length === 0) {
    return (
      <div className="p-4 space-y-6 pb-40 md:pb-24">
        <div className="text-center py-8">
          <div className="p-4 bg-muted rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">No Shopping Needed</h2>
          <p className="text-sm text-muted-foreground mb-6">
            All your meals are rollovers, so you've already shopped for them!
          </p>
        </div>
        {/* Fixed bottom buttons */}
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={goBack.isPending || completeShopping.isPending}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => completeShopping.mutate({
                selectedIngredients: [],
                listAction: 'new',
                newListName: 'Empty batch',
              })}
              disabled={completeShopping.isPending || goBack.isPending}
            >
              {completeShopping.isPending ? 'Processing...' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Group ingredients by category
  const groupedIngredients = ingredients.reduce((acc, ing) => {
    const category = ing.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(ing);
    return acc;
  }, {} as Record<string, typeof ingredients>);

  const categoryOrder = [
    'Produce',
    'Meat & Seafood',
    'Dairy',
    'Bakery',
    'Frozen',
    'Pantry',
    'Spices & Seasonings',
    'Condiments',
    'Beverages',
    'Other',
  ];

  const sortedCategories = Object.keys(groupedIngredients).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="p-4 space-y-4 pb-40 md:pb-24">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Shopping List</h2>
        <p className="text-sm text-muted-foreground">
          Review ingredients from your new meals. Rollover meals are excluded (already
          shopped).
        </p>
      </div>

      {/* Select all/none */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={selectAll} className="flex items-center gap-1">
          <CheckSquare className="h-4 w-4" />
          Select all
        </Button>
        <Button variant="outline" size="sm" onClick={selectNone} className="flex items-center gap-1">
          <Square className="h-4 w-4" />
          Select none
        </Button>
        <span className="ml-auto text-sm text-muted-foreground self-center">
          {selected.size} of {ingredients.length} selected
        </span>
      </div>

      {/* Ingredient list by category */}
      <div className="space-y-4">
        {sortedCategories.map((category) => (
          <div key={category}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{category}</h3>
            <div className="space-y-1">
              {groupedIngredients[category].map((ingredient) => (
                <IngredientRow
                  key={ingredient.key}
                  ingredient={ingredient as AggregatedIngredient}
                  selected={selected.has(ingredient.key)}
                  onToggle={() => toggleIngredient(ingredient.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* List action selection */}
      <div className="space-y-3 pt-4 border-t">
        <Label>Add to shopping list</Label>
        <Select value={listAction} onValueChange={(v) => setListAction(v as ListAction)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create new list
              </div>
            </SelectItem>
            {lists && lists.length > 0 && (
              <>
                <SelectItem value="append">Add to existing list</SelectItem>
                <SelectItem value="replace">Replace existing list</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>

        {listAction === 'new' && (
          <div className="space-y-2">
            <Label htmlFor="listName">List name</Label>
            <Input
              id="listName"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Enter list name"
            />
          </div>
        )}

        {(listAction === 'append' || listAction === 'replace') && lists && lists.length > 0 && (
          <Select value={targetListId} onValueChange={setTargetListId}>
            <SelectTrigger>
              <SelectValue placeholder="Select list" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name} ({list.itemCount} items)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error Display */}
      {completeShopping.error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{completeShopping.error.message}</span>
        </div>
      )}

      {/* Continue Button - fixed at bottom, above mobile nav */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={goBack.isPending || completeShopping.isPending}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={
              selected.size === 0 ||
              completeShopping.isPending ||
              goBack.isPending ||
              (listAction === 'new' && !newListName.trim()) ||
              ((listAction === 'append' || listAction === 'replace') && !targetListId)
            }
            onClick={handleComplete}
          >
            {completeShopping.isPending ? (
              'Creating list...'
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Create Shopping List ({selected.size} items)
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Replace Confirmation Dialog */}
      <AlertDialog open={showConfirmReplace} onOpenChange={setShowConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Shopping List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all existing items from the selected list and replace them with
              the new ingredients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doComplete}>Replace List</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
