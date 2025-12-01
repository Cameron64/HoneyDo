import { useState } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc';
import type { MealType } from '@honeydo/shared';

interface RequestSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function RequestSuggestionsDialog({ open, onOpenChange }: RequestSuggestionsDialogProps) {
  // Default to tomorrow through next week
  const getDefaultDates = () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [mealTypes, setMealTypes] = useState<MealType[]>(['dinner']);

  const utils = trpc.useUtils();

  const requestSuggestions = trpc.recipes.suggestions.request.useMutation({
    onSuccess: () => {
      utils.recipes.suggestions.getCurrent.invalidate();
      onOpenChange(false);
    },
  });

  const toggleMealType = (type: MealType) => {
    setMealTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const handleSubmit = () => {
    if (!startDate || !endDate || mealTypes.length === 0) return;

    requestSuggestions.mutate({
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      mealTypes,
    });
  };

  const isValid = startDate && endDate && mealTypes.length > 0 && startDate <= endDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Request Suggestions
          </DialogTitle>
          <DialogDescription>
            Get AI-powered meal suggestions based on your preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date Range */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Range
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
              </div>
            </div>
          </div>

          {/* Meal Types */}
          <div className="space-y-3">
            <Label>Meal Types</Label>
            <div className="grid grid-cols-2 gap-3">
              {MEAL_TYPES.map((type) => (
                <label
                  key={type.value}
                  className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={mealTypes.includes(type.value)}
                    onCheckedChange={() => toggleMealType(type.value)}
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || requestSuggestions.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {requestSuggestions.isPending ? 'Requesting...' : 'Get Suggestions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
