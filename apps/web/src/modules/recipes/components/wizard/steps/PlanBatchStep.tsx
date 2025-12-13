/**
 * Step 2a: Plan Batch
 *
 * User sets:
 * - Total meal count for the batch (must be >= rolloverCount)
 * - How many meals to pick manually vs AI (via slider)
 *
 * Rollover meals from Step 1 count toward the total automatically.
 * After this step, if manualPickCount > 0, user goes to ManualPicksStep.
 * Otherwise, they skip to GetSuggestionsStep.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ChevronUp, ChevronDown, ChefHat, Sparkles, BookOpen, RotateCcw } from 'lucide-react';
import type { WizardSession } from '@honeydo/shared';

interface PlanBatchStepProps {
  session: WizardSession;
  onStepComplete: () => void;
}

export function PlanBatchStep({ session, onStepComplete }: PlanBatchStepProps) {
  const utils = trpc.useUtils();

  // Rollover count is the floor for total meals
  const rolloverCount = session.rolloverCount ?? 0;

  // Default total to 4 or rolloverCount (whichever is higher)
  const defaultTotal = Math.max(session.totalMealCount ?? 4, rolloverCount);
  const [totalMeals, setTotalMeals] = useState(defaultTotal);
  const [manualPicks, setManualPicks] = useState(session.manualPickCount ?? 0);

  const setMealCounts = trpc.recipes.wizard.setMealCounts.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      onStepComplete();
    },
  });

  const handleContinue = () => {
    setMealCounts.mutate({
      total: totalMeals,
      manualPicks,
    });
  };

  // NEW meals needed = total - rollovers
  const newMealsNeeded = totalMeals - rolloverCount;
  // AI count = new meals - manual picks
  const aiCount = Math.max(0, newMealsNeeded - manualPicks);
  // Maximum manual picks is limited to new meals needed
  const maxManualPicks = newMealsNeeded;

  // Ensure manual picks doesn't exceed max when total changes
  const handleTotalChange = (newTotal: number) => {
    const clampedTotal = Math.max(rolloverCount, Math.min(21, newTotal));
    setTotalMeals(clampedTotal);
    const newMax = clampedTotal - rolloverCount;
    if (manualPicks > newMax) {
      setManualPicks(newMax);
    }
  };

  // Handle slider change
  const handleSliderChange = (value: number[]) => {
    setManualPicks(value[0]);
  };

  return (
    <div className="p-4 pb-40 md:pb-24">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Plan Your Batch</h2>
          <p className="text-sm text-muted-foreground">
            Choose how many meals for this batch and how you want to select them.
          </p>
        </div>

        {/* Rollover notice */}
        {rolloverCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <RotateCcw className="h-4 w-4 text-blue-500" />
            <span className="text-sm">
              <strong>{rolloverCount}</strong> meal{rolloverCount !== 1 ? 's' : ''} rolled over from your previous batch
            </span>
            <Badge variant="secondary" className="ml-auto">
              Already in batch
            </Badge>
          </div>
        )}

        {/* Total Meals */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Total Meals This Batch</Label>
          {rolloverCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Your {rolloverCount} rollover{rolloverCount !== 1 ? 's' : ''} count toward this total. Add more meals or keep just the rollovers.
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleTotalChange(totalMeals - 1)}
              disabled={totalMeals <= rolloverCount || totalMeals <= 1}
              aria-label="Decrease total"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={Math.max(1, rolloverCount)}
              max={21}
              value={totalMeals}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  handleTotalChange(val);
                }
              }}
              className="text-2xl text-center w-20 font-medium"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleTotalChange(totalMeals + 1)}
              disabled={totalMeals >= 21}
              aria-label="Increase total"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Slider for Manual vs AI (only show if there are new meals to add) */}
        {newMealsNeeded > 0 && (
          <div className="space-y-4">
            <Label className="text-base font-medium">How to Pick {newMealsNeeded} New Meal{newMealsNeeded !== 1 ? 's' : ''}</Label>

            {/* Labels above slider */}
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5 text-primary">
                <Sparkles className="h-4 w-4" />
                <span>AI</span>
              </div>
              <div className="flex items-center gap-1.5 text-green-600">
                <span>Library</span>
                <BookOpen className="h-4 w-4" />
              </div>
            </div>

            {/* Slider */}
            <Slider
              value={[manualPicks]}
              onValueChange={handleSliderChange}
              min={0}
              max={maxManualPicks}
              step={1}
              className="py-2"
            />

            {/* Counts below slider */}
            <div className="flex justify-between text-sm font-medium">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl tabular-nums">{aiCount}</span>
                <span className="text-muted-foreground text-xs">AI suggestions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">from library</span>
                <span className="text-2xl tabular-nums">{manualPicks}</span>
              </div>
            </div>
          </div>
        )}

        {/* Summary - Clear breakdown of the math */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">Batch Breakdown</h3>

          {/* Visual breakdown showing how total is calculated */}
          <div className="space-y-2">
            {rolloverCount > 0 && (
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-blue-500" />
                  <span>Rolled over meals</span>
                </div>
                <span className="font-medium">{rolloverCount}</span>
              </div>
            )}
            {manualPicks > 0 && (
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-green-500" />
                  <span>Library picks</span>
                </div>
                <span className="font-medium">{manualPicks}</span>
              </div>
            )}
            {aiCount > 0 && (
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>AI suggestions</span>
                </div>
                <span className="font-medium">{aiCount}</span>
              </div>
            )}

            {/* Total row - emphasized */}
            <div className="flex items-center justify-between text-sm pt-1">
              <div className="flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-foreground" />
                <span className="font-medium">Total meals</span>
              </div>
              <span className="font-bold text-base">{totalMeals}</span>
            </div>
          </div>

          {/* Explanation when rollovers exist */}
          {rolloverCount > 0 && newMealsNeeded > 0 && (
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              {rolloverCount} rollover{rolloverCount !== 1 ? 's' : ''} + {newMealsNeeded} new = {totalMeals} total
            </p>
          )}
        </div>
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <Button
          className="w-full"
          onClick={handleContinue}
          disabled={setMealCounts.isPending}
        >
          {setMealCounts.isPending ? (
            'Saving...'
          ) : newMealsNeeded === 0 ? (
            // All meals are rollovers
            <>
              <RotateCcw className="h-4 w-4 mr-2" />
              Continue with Rollovers Only
            </>
          ) : manualPicks > 0 ? (
            <>
              <BookOpen className="h-4 w-4 mr-2" />
              Pick {manualPicks} from Library
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Get {aiCount} AI Suggestions
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
