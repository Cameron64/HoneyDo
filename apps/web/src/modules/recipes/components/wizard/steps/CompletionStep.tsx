import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useNavigate } from '@tanstack/react-router';
import {
  CheckCircle,
  Calendar,
  ShoppingCart,
  History,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import type { WizardSession } from '@honeydo/shared';

interface CompletionStepProps {
  session: WizardSession;
  onFinish: () => void;
}

export function CompletionStep({ onFinish }: CompletionStepProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: summary, isLoading } = trpc.recipes.wizard.getCompletionSummary.useQuery();

  const finishWizard = trpc.recipes.wizard.finishWizard.useMutation({
    onSuccess: () => {
      // Invalidate all recipe queries
      utils.recipes.meals.invalidate();
      utils.recipes.suggestions.invalidate();
      utils.recipes.wizard.invalidate();
      onFinish();
    },
  });

  const handleFinish = async () => {
    await finishWizard.mutateAsync();
    navigate({ to: '/recipes/plan' });
  };

  const handleGoToShopping = async () => {
    await finishWizard.mutateAsync();
    navigate({ to: '/shopping' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Success Header */}
      <div className="text-center py-6">
        <div className="p-4 bg-green-100 dark:bg-green-500/20 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">All Done!</h2>
        <p className="text-sm text-muted-foreground">
          Your new batch is ready to go.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="space-y-3">
        {/* New Meals */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{summary?.newMeals ?? 0} new meals</p>
              <p className="text-sm text-muted-foreground">Added to your meal plan</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        {/* Rollovers */}
        {(summary?.rollovers ?? 0) > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-full">
                <RotateCcw className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{summary?.rollovers} rolled over</p>
                <p className="text-sm text-muted-foreground">
                  Kept from previous batch
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Shopping List */}
        {(summary?.shoppingItems ?? 0) > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-full">
                <ShoppingCart className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{summary?.shoppingItems} shopping items</p>
                <p className="text-sm text-muted-foreground">
                  Added to {summary?.listName || 'shopping list'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Card>
        )}

        {/* Archived to History */}
        {(summary?.archivedToHistory ?? 0) > 0 && (
          <Card className="p-4 bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                <History className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-muted-foreground">
                  {summary?.archivedToHistory} recipes archived
                </p>
                <p className="text-sm text-muted-foreground">
                  Added to your recipe history
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-4">
        <Button
          className="w-full"
          onClick={handleFinish}
          disabled={finishWizard.isPending}
        >
          <Calendar className="h-4 w-4 mr-2" />
          View Meal Plan
        </Button>

        {(summary?.shoppingItems ?? 0) > 0 && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoToShopping}
            disabled={finishWizard.isPending}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Go to Shopping List
          </Button>
        )}

        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => {
            finishWizard.mutate();
            navigate({ to: '/recipes' });
          }}
          disabled={finishWizard.isPending}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
