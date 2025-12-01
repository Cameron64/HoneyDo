import { useState, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, ShoppingCart, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { MealCard } from './MealCard';
import { MealDetailSheet } from './MealDetailSheet';
import type { AcceptedMeal } from '@honeydo/shared';

type DateRangePreset = 'this-week' | 'next-week';

export function MealPlanPage() {
  const [selectedMeal, setSelectedMeal] = useState<AcceptedMeal | null>(null);
  const [activePreset, setActivePreset] = useState<DateRangePreset>('this-week');
  const [weekOffset, setWeekOffset] = useState(0);

  // Set up real-time sync
  useRecipesSync();

  // Calculate date range based on preset and offset
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get start of current week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    // Apply preset
    if (activePreset === 'next-week') {
      startOfWeek.setDate(startOfWeek.getDate() + 7);
    }

    // Apply offset
    startOfWeek.setDate(startOfWeek.getDate() + weekOffset * 7);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return {
      start: startOfWeek.toISOString().split('T')[0],
      end: endOfWeek.toISOString().split('T')[0],
    };
  }, [activePreset, weekOffset]);

  // Fetch meals for the date range
  const { data: mealsData, isLoading } = trpc.recipes.meals.getRange.useQuery({
    start: dateRange.start,
    end: dateRange.end,
  });

  const { data: pendingCount } = trpc.recipes.meals.getPendingShoppingCount.useQuery({
    start: dateRange.start,
    end: dateRange.end,
  });

  // Group meals by date
  const mealsByDate = useMemo(() => {
    const meals = mealsData?.meals ?? [];
    if (meals.length === 0 && !mealsData) return new Map<string, AcceptedMeal[]>();

    const grouped = new Map<string, AcceptedMeal[]>();

    // Initialize all days in the range
    const start = new Date(dateRange.start + 'T00:00:00');
    const end = new Date(dateRange.end + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      grouped.set(dateStr, []);
    }

    // Add meals to their dates
    for (const meal of meals) {
      const existing = grouped.get(meal.date) ?? [];
      grouped.set(meal.date, [...existing, meal]);
    }

    // Sort meals within each day by meal type
    const mealTypeOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    grouped.forEach((meals, date) => {
      grouped.set(
        date,
        meals.sort(
          (a, b) =>
            (mealTypeOrder[a.mealType] ?? 4) - (mealTypeOrder[b.mealType] ?? 4)
        )
      );
    });

    return grouped;
  }, [mealsData, dateRange]);

  const handlePresetChange = (preset: DateRangePreset) => {
    setActivePreset(preset);
    setWeekOffset(0);
  };

  const handlePrevWeek = () => {
    setWeekOffset((prev) => prev - 1);
  };

  const handleNextWeek = () => {
    setWeekOffset((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link to="/recipes">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">Meal Plan</h1>
                <p className="text-sm text-muted-foreground">
                  {formatDateRangeDisplay(dateRange.start, dateRange.end)}
                </p>
              </div>
            </div>
            <Link to="/recipes/shop">
              <Button size="sm" variant={(pendingCount?.count ?? 0) > 0 ? 'default' : 'outline'}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Shop
                {(pendingCount?.count ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingCount?.count}
                  </Badge>
                )}
              </Button>
            </Link>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={activePreset === 'this-week' && weekOffset === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetChange('this-week')}
              >
                This Week
              </Button>
              <Button
                variant={activePreset === 'next-week' && weekOffset === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetChange('next-week')}
              >
                Next Week
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handlePrevWeek}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNextWeek}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          Array.from(mealsByDate.entries()).map(([date, meals]) => (
            <DaySection
              key={date}
              date={date}
              meals={meals}
              onMealClick={setSelectedMeal}
            />
          ))
        )}

        {/* Empty State */}
        {!isLoading && (!mealsData?.meals || mealsData.meals.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Meals Planned</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Plan your week with AI suggestions
            </p>
            <Link to="/recipes/wizard">
              <Button>
                <Wand2 className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </Link>
          </div>
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

interface DaySectionProps {
  date: string;
  meals: AcceptedMeal[];
  onMealClick: (meal: AcceptedMeal) => void;
}

function DaySection({ date, meals, onMealClick }: DaySectionProps) {
  const dateLabel = formatDateLabel(date);
  const isToday = dateLabel === 'Today';
  const isEmpty = meals.length === 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`font-semibold ${isToday ? 'text-primary' : ''}`}>
          {dateLabel}
        </h3>
        <span className="text-sm text-muted-foreground">
          {formatDateFull(date)}
        </span>
      </div>
      {isEmpty ? (
        <div className="p-4 rounded-lg border border-dashed text-center">
          <p className="text-sm text-muted-foreground">No meals planned</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onClick={() => onMealClick(meal)}
            />
          ))}
        </div>
      )}
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

function formatDateRangeDisplay(start: string, end: string): string {
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
