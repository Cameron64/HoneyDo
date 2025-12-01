import { cn } from '@/lib/utils';
import { Check, Target } from 'lucide-react';

interface SuggestionProgressProps {
  accepted: number;
  target: number;
}

export function SuggestionProgress({ accepted, target }: SuggestionProgressProps) {
  const percentage = Math.min((accepted / target) * 100, 100);
  const isComplete = accepted >= target;

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className={cn('h-5 w-5', isComplete ? 'text-green-600' : 'text-primary')} />
          <span className="font-medium">
            {accepted} / {target} meals accepted
          </span>
        </div>
        {isComplete && (
          <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
            <Check className="h-4 w-4" />
            Complete!
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300',
            isComplete ? 'bg-green-500' : 'bg-primary'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {!isComplete && (
        <p className="text-sm text-muted-foreground mt-2">
          Accept {target - accepted} more meal{target - accepted !== 1 ? 's' : ''} to continue
        </p>
      )}
    </div>
  );
}
