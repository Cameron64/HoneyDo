/**
 * Step 2b: Manual Picks
 *
 * User selects recipes from their library or imports new ones via URL.
 * Shows current picks and allows adding/removing until target is reached.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { LibraryPickerSheet } from '../LibraryPickerSheet';
import { RecipeImportSheet } from '../../import/RecipeImportSheet';
import { errorService } from '@/services/error-service';
import {
  BookOpen,
  Link2,
  Trash2,
  Clock,
  ChefHat,
  Sparkles,
  Check,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';

interface ManualPicksStepProps {
  onStepComplete: () => void;
}

export function ManualPicksStep({ onStepComplete }: ManualPicksStepProps) {
  const utils = trpc.useUtils();
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // Get current manual picks
  const { data: picksData, isLoading } = trpc.recipes.wizard.getManualPicks.useQuery();

  // Mutations
  const addPick = trpc.recipes.wizard.addManualPick.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getManualPicks.invalidate();
    },
  });

  const removePick = trpc.recipes.wizard.removeManualPick.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.getManualPicks.invalidate();
    },
  });

  const completePicks = trpc.recipes.wizard.completeManualPicks.useMutation({
    onSuccess: () => {
      console.log('[ManualPicksStep] completeManualPicks success');
      setUiError(null);
      utils.recipes.wizard.getSession.invalidate();
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSuggestionProgress.invalidate();
      onStepComplete();
    },
    onError: (error) => {
      console.error('[ManualPicksStep] completeManualPicks error:', error);
      const errorMessage = error.message || 'Failed to complete manual picks';
      setUiError(errorMessage);
      errorService.log('recipes', 'wizard/manual-picks', errorMessage, {
        code: error.data?.code,
        shape: error.shape,
      });
    },
  });

  const handleAddFromLibrary = (recipeId: string, servings: number) => {
    addPick.mutate({ recipeId, servings });
    setShowLibraryPicker(false);
  };

  const handleRemovePick = (recipeId: string) => {
    removePick.mutate({ recipeId });
  };

  const handleImportSuccess = (recipeId: string) => {
    // Auto-add imported recipe to picks
    addPick.mutate({ recipeId, servings: 4 });
    setShowImportSheet(false);
  };

  const goBack = trpc.recipes.wizard.goBack.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.start.invalidate();
      utils.recipes.wizard.getSession.invalidate();
      onStepComplete(); // Triggers refetch in parent
    },
  });

  const handleContinue = () => {
    console.log('[ManualPicksStep] handleContinue called, picks:', picks.length, 'target:', target, 'isComplete:', isComplete);
    completePicks.mutate();
  };

  const handleBack = () => {
    goBack.mutate({ target: 'step2a' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  const picks = picksData?.picks ?? [];
  const target = picksData?.target ?? 0;
  const aiCount = picksData?.aiCount ?? 0;
  const isComplete = picks.length >= target;

  return (
    <div className="p-4 pb-40 md:pb-24">
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Pick Your Recipes</h2>
          <p className="text-sm text-muted-foreground">
            Choose {target} recipe{target !== 1 ? 's' : ''} from your library or import new ones.
          </p>
        </div>

        {/* Error display */}
        {uiError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-xs text-destructive/80 break-words">{uiError}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive"
              onClick={() => setUiError(null)}
            >
              ×
            </Button>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">
              {picks.length} of {target} selected
            </span>
          </div>
          {isComplete && (
            <Badge variant="default" className="bg-green-500">
              <Check className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>

        {/* Add buttons */}
        {!isComplete && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => setShowLibraryPicker(true)}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-xs">From Library</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => setShowImportSheet(true)}
            >
              <Link2 className="h-5 w-5" />
              <span className="text-xs">Import URL</span>
            </Button>
          </div>
        )}

        {/* Selected picks */}
        {picks.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Selected Recipes</h3>
            <div className="space-y-2">
              {picks.map((pick) => (
                <Card key={pick.recipeId} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{pick.recipeName}</h4>
                        {pick.recipe && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {pick.recipe.cuisine && (
                              <span>{pick.recipe.cuisine}</span>
                            )}
                            {pick.recipe.totalTimeMinutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {pick.recipe.totalTimeMinutes}min
                              </span>
                            )}
                            {pick.recipe.effort && (
                              <span className="flex items-center gap-1">
                                <ChefHat className="h-3 w-3" />
                                {pick.recipe.effort}/5
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {pick.servings} servings
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemovePick(pick.recipeId)}
                        disabled={removePick.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {picks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No recipes selected yet</p>
            <p className="text-xs mt-1">
              Pick from your library or import a new recipe
            </p>
          </div>
        )}

        {/* Info about AI picks */}
        {aiCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              After your picks, AI will suggest {aiCount} more meal{aiCount !== 1 ? 's' : ''}.
            </span>
          </div>
        )}
      </div>

      {/* Fixed bottom buttons */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4 safe-area-pb z-40">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={goBack.isPending || completePicks.isPending}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleContinue}
            disabled={!isComplete || completePicks.isPending || goBack.isPending}
          >
            {completePicks.isPending ? (
              'Processing...'
            ) : isComplete ? (
              aiCount > 0 ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Continue to AI Suggestions
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Continue to Shopping
                </>
              )
            ) : (
              `Select ${target - picks.length} more recipe${target - picks.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </div>

      {/* Library Picker Sheet */}
      <LibraryPickerSheet
        open={showLibraryPicker}
        onOpenChange={setShowLibraryPicker}
        onSelect={handleAddFromLibrary}
        excludeRecipeIds={picks.map((p) => p.recipeId)}
      />

      {/* Import Sheet */}
      <RecipeImportSheet
        open={showImportSheet}
        onOpenChange={setShowImportSheet}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
