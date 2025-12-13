import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, ShoppingCart, Filter, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { MealCard } from './MealCard';
import { MealDetailSheet } from './MealDetailSheet';
import type { AcceptedMeal } from '@honeydo/shared';

type FilterMode = 'all' | 'pending' | 'completed';
type ViewMode = 'date' | 'meal-type';

export function BatchManagementPage() {
  const [selectedMeal, setSelectedMeal] = useState<AcceptedMeal | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('date');

  // Set up real-time sync
  useRecipesSync();

  // Fetch current batch data
  const { data: batchData, isLoading } = trpc.recipes.meals.getCurrentBatch.useQuery();
  const meals = batchData?.meals ?? [];
  const batch = batchData?.batch;

  // Calculate stats
  const stats = useMemo(() => {
    const total = meals.length;
    const completed = meals.filter((m) => m.completed).length;
    const pending = total - completed;
    const pendingShop = meals.filter((m) => !m.shoppingListGenerated).length;
    return { total, completed, pending, pendingShop };
  }, [meals]);

  // Filter and group meals
  const filteredMeals = useMemo(() => {
    let filtered = meals;

    // Apply status filter
    if (filterMode === 'pending') {
      filtered = filtered.filter((m) => !m.completed);
    } else if (filterMode === 'completed') {
      filtered = filtered.filter((m) => m.completed);
    }

    return filtered;
  }, [meals, filterMode]);

  // Group meals by date or meal type
  const groupedMeals = useMemo(() => {
    const grouped = new Map<string, AcceptedMeal[]>();

    if (viewMode === 'date') {
      // Group by date
      for (const meal of filteredMeals) {
        const existing = grouped.get(meal.date) ?? [];
        grouped.set(meal.date, [...existing, meal]);
      }
      // Sort meals within each day by meal type
      const mealTypeOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
      grouped.forEach((dayMeals, date) => {
        grouped.set(
          date,
          dayMeals.sort(
            (a, b) =>
              (mealTypeOrder[a.mealType] ?? 4) - (mealTypeOrder[b.mealType] ?? 4)
          )
        );
      });
    } else {
      // Group by meal type
      const typeOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
      for (const type of typeOrder) {
        grouped.set(type, []);
      }
      for (const meal of filteredMeals) {
        const existing = grouped.get(meal.mealType) ?? [];
        grouped.set(meal.mealType, [...existing, meal]);
      }
      // Sort meals within each type by date
      grouped.forEach((typeMeals, type) => {
        grouped.set(
          type,
          typeMeals.sort((a, b) => a.date.localeCompare(b.date))
        );
      });
    }

    return grouped;
  }, [filteredMeals, viewMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Link to="/recipes">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">Current Batch</h1>
                {batch && (
                  <p className="text-sm text-muted-foreground">{batch.name}</p>
                )}
              </div>
            </div>
            <Link to="/recipes/shop">
              <Button size="sm" variant={stats.pendingShop > 0 ? 'default' : 'outline'}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Shop
                {stats.pendingShop > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {stats.pendingShop}
                  </Badge>
                )}
              </Button>
            </Link>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-4 text-sm mb-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{stats.total} meals</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500" />
              <span>{stats.completed} done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-orange-500" />
              <span>{stats.pending} remaining</span>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between">
            {/* Filter Buttons */}
            <div className="flex gap-2">
              <Button
                variant={filterMode === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('all')}
              >
                All
              </Button>
              <Button
                variant={filterMode === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('pending')}
              >
                Pending
              </Button>
              <Button
                variant={filterMode === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterMode('completed')}
              >
                Done
              </Button>
            </div>

            {/* View Mode Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode(viewMode === 'date' ? 'meal-type' : 'date')}
              title={viewMode === 'date' ? 'Group by meal type' : 'Group by date'}
            >
              <Filter className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : meals.length === 0 ? (
          <EmptyState />
        ) : filteredMeals.length === 0 ? (
          <NoResultsState filterMode={filterMode} onReset={() => setFilterMode('all')} />
        ) : (
          Array.from(groupedMeals.entries()).map(([key, groupMeals]) => {
            if (groupMeals.length === 0) return null;
            return (
              <GroupSection
                key={key}
                groupKey={key}
                meals={groupMeals}
                viewMode={viewMode}
                onMealClick={setSelectedMeal}
              />
            );
          })
        )}
      </div>

      {/* Meal Detail Sheet */}
      <MealDetailSheet
        meal={selectedMeal}
        open={!!selectedMeal}
        onOpenChange={(open) => !open && setSelectedMeal(null)}
      />
    </div>
  );
}

interface GroupSectionProps {
  groupKey: string;
  meals: AcceptedMeal[];
  viewMode: ViewMode;
  onMealClick: (meal: AcceptedMeal) => void;
}

function GroupSection({ groupKey, meals, viewMode, onMealClick }: GroupSectionProps) {
  const label = viewMode === 'date' ? formatDateLabel(groupKey) : formatMealTypeLabel(groupKey);
  const sublabel = viewMode === 'date' ? formatDateFull(groupKey) : `${meals.length} meal${meals.length !== 1 ? 's' : ''}`;
  const isToday = viewMode === 'date' && label === 'Today';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`font-semibold ${isToday ? 'text-primary' : ''}`}>
          {label}
        </h3>
        <span className="text-sm text-muted-foreground">{sublabel}</span>
      </div>
      <div className="space-y-2">
        {meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onClick={() => onMealClick(meal)} />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold mb-2">No Meals in Batch</h2>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Start a new batch to plan your meals
      </p>
      <Link to="/recipes/wizard">
        <Button>New Batch</Button>
      </Link>
    </div>
  );
}

interface NoResultsStateProps {
  filterMode: FilterMode;
  onReset: () => void;
}

function NoResultsState({ filterMode, onReset }: NoResultsStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Filter className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold mb-2">No Meals Found</h2>
      <p className="text-muted-foreground mb-4">
        {filterMode === 'pending' && 'All meals have been completed!'}
        {filterMode === 'completed' && 'No meals have been completed yet.'}
      </p>
      <Button variant="outline" onClick={onReset}>
        Show All Meals
      </Button>
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
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

  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMealTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
