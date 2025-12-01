import { useState, useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ShoppingCart, Wand2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { IngredientRow } from './IngredientRow';
import type { AggregatedIngredient } from '@honeydo/shared';

// Category grouping for display
const CATEGORY_ORDER = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'frozen',
  'canned',
  'dry goods',
  'spices',
  'other',
];

export function ShoppingGenerationPage() {
  const navigate = useNavigate();

  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [quantityOverrides, setQuantityOverrides] = useState<Record<string, number>>({});

  // Set up real-time sync
  useRecipesSync();

  // Fetch ingredients from current batch (not date-based)
  const { data: ingredientsData, isLoading } = trpc.recipes.shopping.getCurrentBatchIngredients.useQuery();

  // Fetch available shopping lists
  const { data: listsData } = trpc.recipes.shopping.getAvailableLists.useQuery();

  const utils = trpc.useUtils();

  const addToList = trpc.recipes.shopping.addToList.useMutation({
    onSuccess: () => {
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.shopping.lists.getDefault.invalidate();
      // Navigate to shopping list
      navigate({ to: '/shopping' });
    },
  });

  // Initialize selections when data loads
  useMemo(() => {
    if (ingredientsData?.ingredients && selectedIngredients.size === 0) {
      // Select all by default
      setSelectedIngredients(new Set(ingredientsData.ingredients.map((i) => i.key)));
    }
    if (listsData && listsData.length > 0 && !selectedListId) {
      // Select default list or first list
      const defaultList = listsData.find((l) => l.isDefault);
      setSelectedListId(defaultList?.id ?? listsData[0].id);
    }
  }, [ingredientsData, listsData, selectedIngredients.size, selectedListId]);

  // Group ingredients by category
  const ingredientsByCategory = useMemo(() => {
    if (!ingredientsData?.ingredients) return new Map<string, AggregatedIngredient[]>();

    const grouped = new Map<string, AggregatedIngredient[]>();

    for (const ing of ingredientsData.ingredients) {
      const category = ing.category.toLowerCase();
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(ing);
    }

    // Sort by category order
    const sorted = new Map<string, AggregatedIngredient[]>();
    for (const cat of CATEGORY_ORDER) {
      if (grouped.has(cat)) {
        sorted.set(cat, grouped.get(cat)!);
        grouped.delete(cat);
      }
    }
    // Add any remaining categories
    grouped.forEach((items, cat) => {
      sorted.set(cat, items);
    });

    return sorted;
  }, [ingredientsData]);

  const toggleIngredient = (key: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (ingredientsData?.ingredients) {
      setSelectedIngredients(new Set(ingredientsData.ingredients.map((i) => i.key)));
    }
  };

  const selectNone = () => {
    setSelectedIngredients(new Set());
  };

  const handleQuantityChange = (key: string, quantity: number) => {
    setQuantityOverrides((prev) => ({
      ...prev,
      [key]: quantity,
    }));
  };

  const handleAddToList = () => {
    if (!selectedListId || !ingredientsData) return;

    const selectedItems = ingredientsData.ingredients
      .filter((ing) => selectedIngredients.has(ing.key))
      .map((ing) => ({
        name: ing.name,
        quantity: quantityOverrides[ing.key] ?? ing.totalAmount,
        unit: ing.unit ?? undefined,
        category: ing.category,
        note: `From: ${ing.fromMeals.join(', ')}`,
      }));

    addToList.mutate({
      listId: selectedListId,
      ingredients: selectedItems,
      mealIds: ingredientsData.mealIds,
    });
  };

  const selectedCount = selectedIngredients.size;
  const totalCount = ingredientsData?.ingredients?.length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  // No meals need shopping
  if (!ingredientsData || ingredientsData.ingredients.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <ShoppingHeader
          mealCount={0}
          ingredientCount={0}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Ingredients Needed</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Plan some meals first, then come back to generate your shopping list
          </p>
          <Link to="/recipes/wizard">
            <Button>
              <Wand2 className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ShoppingHeader
        mealCount={ingredientsData.mealIds.length}
        ingredientCount={totalCount}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 pb-24">
        {/* Selection Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Select None
            </Button>
          </div>
          <Badge variant="secondary">
            {selectedCount} of {totalCount} selected
          </Badge>
        </div>

        {/* Ingredients by Category */}
        {Array.from(ingredientsByCategory.entries()).map(([category, ingredients]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize flex items-center gap-2">
                {category}
                <Badge variant="secondary" className="font-normal">
                  {ingredients.filter((i) => selectedIngredients.has(i.key)).length}/
                  {ingredients.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {ingredients.map((ing) => (
                <IngredientRow
                  key={ing.key}
                  ingredient={ing}
                  selected={selectedIngredients.has(ing.key)}
                  onToggle={() => toggleIngredient(ing.key)}
                  quantity={quantityOverrides[ing.key] ?? ing.totalAmount}
                  onQuantityChange={(q) => handleQuantityChange(ing.key, q)}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-background border-t p-4 space-y-3">
        {/* List Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground shrink-0">Add to:</span>
          <Select
            value={selectedListId ?? undefined}
            onValueChange={setSelectedListId}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a list" />
            </SelectTrigger>
            <SelectContent>
              {listsData?.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                  {list.isDefault && ' (default)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleAddToList}
          disabled={selectedCount === 0 || !selectedListId || addToList.isPending}
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          {addToList.isPending ? (
            'Adding...'
          ) : (
            <>
              Add {selectedCount} Items to List
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ShoppingHeader({
  mealCount,
  ingredientCount,
}: {
  mealCount: number;
  ingredientCount: number;
}) {
  return (
    <div className="sticky top-0 bg-background z-10 border-b p-4">
      <div className="flex items-center gap-3">
        <Link to="/recipes/plan">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Shopping List</h1>
          <p className="text-sm text-muted-foreground">
            {mealCount} meals, {ingredientCount} ingredients
          </p>
        </div>
      </div>
    </div>
  );
}
