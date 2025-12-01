import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = ['Review Meals', 'Get Suggestions', 'Shopping List', 'Complete'];

export function WizardProgress({ currentStep, totalSteps }: WizardProgressProps) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex flex-1 items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step < currentStep && 'bg-primary text-primary-foreground',
                  step === currentStep && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2',
                  step > currentStep && 'bg-muted text-muted-foreground'
                )}
              >
                {step < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step
                )}
              </div>
              <span
                className={cn(
                  'text-xs mt-1 hidden sm:block',
                  step <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {STEP_LABELS[step - 1]}
              </span>
            </div>
            {/* Connector line */}
            {step < totalSteps && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  step < currentStep ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>
      {/* Mobile step label */}
      <p className="text-center text-sm text-muted-foreground mt-2 sm:hidden">
        Step {currentStep}: {STEP_LABELS[currentStep - 1]}
      </p>
    </div>
  );
}
