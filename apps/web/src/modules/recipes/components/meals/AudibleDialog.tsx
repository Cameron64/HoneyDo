import { useState } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { formatMealDate } from '@/lib/date-utils';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import type { AcceptedMeal } from '@honeydo/shared';

interface AudibleDialogProps {
  meal: AcceptedMeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AUDIBLE_REASONS = [
  { value: 'missing_ingredient', label: 'Missing ingredient(s)' },
  { value: 'time_crunch', label: 'Not enough time today' },
  { value: 'mood_change', label: 'Not in the mood' },
  { value: 'other', label: 'Other reason' },
] as const;

type AudibleReason = (typeof AUDIBLE_REASONS)[number]['value'];

export function AudibleDialog({ meal, open, onOpenChange }: AudibleDialogProps) {
  const [reason, setReason] = useState<AudibleReason>('mood_change');
  const [details, setDetails] = useState('');

  const utils = trpc.useUtils();

  const [submitted, setSubmitted] = useState(false);

  const audibleMutation = trpc.recipes.meals.audible.useMutation({
    onSuccess: () => {
      // Show success message - replacement is processing in the background
      setSubmitted(true);
      // Invalidate queries so the meal list refreshes when replacement arrives
      utils.recipes.meals.getRange.invalidate();
      utils.recipes.meals.getUpcoming.invalidate();
      utils.recipes.meals.getPendingShoppingCount.invalidate();
      utils.recipes.suggestions.getCurrent.invalidate();
    },
  });

  if (!meal) return null;

  const handleSubmit = () => {
    audibleMutation.mutate({
      mealId: meal.id,
      reason,
      details: details.trim() || undefined,
    });
  };

  const handleClose = () => {
    setSubmitted(false);
    setReason('mood_change');
    setDetails('');
    onOpenChange(false);
  };

  // Show success state when submitted
  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Replacement Requested
            </DialogTitle>
          </DialogHeader>

          <div className="py-6 text-center">
            <div className="mb-4">
              <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">
              AI is finding a replacement for <span className="font-medium">{meal.recipeName}</span>.
              This may take a moment.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Your meal plan will update automatically when the replacement is ready.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Swap Meal
          </DialogTitle>
          <DialogDescription>
            Request a replacement for <span className="font-medium">{meal.recipeName}</span> on {formatMealDate(meal.date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current meal info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-sm font-medium">{meal.recipeName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              {meal.recipeData.totalTimeMinutes} min • {meal.recipeData.cuisine}
            </p>
          </div>

          {/* Reason select */}
          <div className="space-y-2">
            <Label htmlFor="reason">Why do you need a swap?</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AudibleReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIBLE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional details */}
          <div className="space-y-2">
            <Label htmlFor="details">
              Additional details <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                reason === 'missing_ingredient'
                  ? "Which ingredient are you missing?"
                  : reason === 'time_crunch'
                  ? "How much time do you have?"
                  : "Any preferences for the replacement?"
              }
              rows={2}
            />
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm">
            <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-blue-700 dark:text-blue-300">
              AI will suggest a replacement meal that fits your preferences and constraints.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={audibleMutation.isPending}
          >
            {audibleMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Finding replacement...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Find Replacement
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

