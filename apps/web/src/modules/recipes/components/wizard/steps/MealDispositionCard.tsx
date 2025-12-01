import { Check, RotateCcw, Trash2, Clock, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MealDisposition, MealType, RecipeData } from '@honeydo/shared';

// Minimal meal shape for wizard batch management
interface BatchMeal {
  id: string;
  date: string;
  mealType: MealType;
  recipeName: string;
  recipeData: RecipeData;
  servings: number;
  completed: boolean;
  isAudible: boolean;
}

interface MealDispositionCardProps {
  meal: BatchMeal;
  disposition: MealDisposition | null;
  onDispositionChange: (disposition: MealDisposition) => void;
  isAudible: boolean;
}

const DISPOSITION_OPTIONS: { value: MealDisposition; label: string; icon: typeof Check; description: string }[] = [
  {
    value: 'completed',
    label: 'Made it',
    icon: Check,
    description: 'Archive to history',
  },
  {
    value: 'rollover',
    label: 'Keep',
    icon: RotateCcw,
    description: 'Move to next batch',
  },
  {
    value: 'discard',
    label: 'Discard',
    icon: Trash2,
    description: 'Remove from plan',
  },
];

export function MealDispositionCard({
  meal,
  disposition,
  onDispositionChange,
  isAudible,
}: MealDispositionCardProps) {
  // Audibles can only be discarded
  const availableOptions = isAudible
    ? DISPOSITION_OPTIONS.filter((o) => o.value === 'discard')
    : DISPOSITION_OPTIONS;

  return (
    <Card
      className={cn(
        'transition-all',
        disposition === 'completed' && 'border-green-500 bg-green-500/5',
        disposition === 'rollover' && 'border-blue-500 bg-blue-500/5',
        disposition === 'discard' && 'border-muted bg-muted/50 opacity-75'
      )}
    >
      <CardContent className="p-4">
        {/* Meal Info */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium truncate">{meal.recipeName}</span>
              {meal.completed && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                  Already cooked
                </Badge>
              )}
              {isAudible && (
                <Badge variant="outline" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Audible
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatMealDate(meal.date)}</span>
              <span className="capitalize">{meal.mealType}</span>
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
        </div>

        {/* Disposition Buttons */}
        <div className="flex gap-2">
          {availableOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = disposition === option.value;

            return (
              <button
                key={option.value}
                onClick={() => onDispositionChange(option.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
                  isSelected
                    ? option.value === 'completed'
                      ? 'border-green-500 bg-green-500/10 text-green-700'
                      : option.value === 'rollover'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700'
                      : 'border-muted-foreground bg-muted text-muted-foreground'
                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Audible warning */}
        {isAudible && (
          <p className="text-xs text-muted-foreground mt-2">
            Audible swaps are discarded without adding to recipe history.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatMealDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
