import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';
import { WizardProgress } from './WizardProgress';
import { ManageBatchStep } from './steps/ManageBatchStep';
import { PlanBatchStep } from './steps/PlanBatchStep';
import { ManualPicksStep } from './steps/ManualPicksStep';
import { GetSuggestionsStep } from './steps/GetSuggestionsStep';
import { ManageShoppingStep } from './steps/ManageShoppingStep';
import { CompletionStep } from './steps/CompletionStep';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
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
import { X, AlertCircle } from 'lucide-react';

export function NewBatchWizard() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Set up real-time sync for recipe updates (activity messages, suggestions, etc.)
  useRecipesSync();

  const [showAbandonDialog, setShowAbandonDialog] = useState(false);

  // Start or resume wizard session
  const { data: wizardData, isLoading, error, refetch } = trpc.recipes.wizard.start.useQuery();
  const session = wizardData?.session;

  const abandonMutation = trpc.recipes.wizard.abandon.useMutation({
    onSuccess: () => {
      utils.recipes.wizard.invalidate();
      navigate({ to: '/recipes' });
    },
  });

  const handleStepComplete = () => {
    // Refetch session to get updated step
    refetch();
  };

  const handleFinish = () => {
    // Navigate handled in CompletionStep
  };

  const handleAbandon = () => {
    abandonMutation.mutate();
    setShowAbandonDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header onCancel={() => setShowAbandonDialog(true)} />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Header onCancel={() => navigate({ to: '/recipes' })} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">Failed to Start Wizard</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {error.message}
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col h-full">
        <Header onCancel={() => navigate({ to: '/recipes' })} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No session found</p>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (session.currentStep) {
      case 1:
        return <ManageBatchStep session={session} onStepComplete={handleStepComplete} />;
      case 2:
        // Step 2 has sub-steps:
        // 2a: Plan batch (set total and manual pick counts)
        // 2b: Manual picks (select from library)
        // 2c: AI suggestions
        return renderStep2();
      case 3:
        return <ManageShoppingStep session={session} onStepComplete={handleStepComplete} />;
      case 4:
        return <CompletionStep session={session} onFinish={handleFinish} />;
      default:
        return null;
    }
  };

  // Step 2 sub-step routing
  const renderStep2 = () => {
    // 2a: If no total meal count set yet, show PlanBatchStep
    if (session.totalMealCount == null) {
      return <PlanBatchStep session={session} onStepComplete={handleStepComplete} />;
    }

    // 2b: If manual picks are required, check if they've been completed
    const manualPickCount = session.manualPickCount ?? 0;
    const rolloverCount = session.rolloverCount ?? 0;
    const acceptedMealIds = (session.acceptedMealIds ?? []) as string[];

    // Manual picks are "committed" when completeManualPicks has been called,
    // which populates acceptedMealIds with the created meal IDs
    const manualPicksCommitted = manualPickCount > 0
      ? acceptedMealIds.length >= manualPickCount
      : true; // If no manual picks required, consider it committed

    // Show ManualPicksStep if manual picks are required but not yet committed
    if (manualPickCount > 0 && !manualPicksCommitted) {
      return <ManualPicksStep onStepComplete={handleStepComplete} />;
    }

    // 2c: Manual picks complete (or 0 manual picks), proceed to AI suggestions
    // AI count = total - manual picks - rollovers
    const aiCount = session.totalMealCount - manualPickCount - rolloverCount;
    if (aiCount <= 0) {
      // All manual/rollover, this shouldn't happen as completeManualPicks should advance to step 3
      // But handle it just in case
      return <ManageShoppingStep session={session} onStepComplete={handleStepComplete} />;
    }

    return <GetSuggestionsStep session={session} onStepComplete={handleStepComplete} />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="sticky top-0 bg-background z-10 border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">New Batch</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAbandonDialog(true)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-4 pb-4">
          <WizardProgress currentStep={session.currentStep} totalSteps={4} />
        </div>
      </header>

      {/* Content - remove overflow-auto so fixed children work correctly */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">{renderStep()}</main>

      {/* Abandon Confirmation Dialog */}
      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Wizard?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be lost if you cancel now. You can start again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Wizard</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAbandon}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Header({ onCancel }: { onCancel: () => void }) {
  return (
    <header className="sticky top-0 bg-background z-10 border-b">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">New Batch</h1>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
