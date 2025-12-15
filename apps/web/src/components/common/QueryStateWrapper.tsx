/**
 * QueryStateWrapper
 *
 * A wrapper component that handles common tRPC query states:
 * - Loading: Shows centered loading spinner
 * - Error: Shows error message with icon
 * - Empty: Optional empty state when data is null/undefined
 * - Success: Renders children with typed data
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error } = trpc.recipes.meals.getRange.useQuery(...);
 *
 * return (
 *   <QueryStateWrapper
 *     isLoading={isLoading}
 *     error={error}
 *     data={data}
 *     emptyState={<EmptyState icon={Calendar} title="No meals" />}
 *   >
 *     {(meals) => <MealList meals={meals} />}
 *   </QueryStateWrapper>
 * );
 * ```
 */

import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from './LoadingSpinner';
import { cn } from '@/lib/utils';

interface QueryStateWrapperProps<T> {
  /** Loading state from query */
  isLoading: boolean;
  /** Error from query */
  error?: { message: string } | null;
  /** Data from query */
  data: T | undefined | null;
  /** Render function called with non-null data */
  children: (data: T) => ReactNode;
  /** Optional custom loading component */
  loadingComponent?: ReactNode;
  /** Optional empty state shown when data is null/undefined */
  emptyState?: ReactNode;
  /** Optional error retry callback */
  onRetry?: () => void;
  /** Container className for loading/error states */
  className?: string;
  /** Height class for the container (default: 'h-64') */
  height?: string;
}

export function QueryStateWrapper<T>({
  isLoading,
  error,
  data,
  children,
  loadingComponent,
  emptyState,
  onRetry,
  className,
  height = 'h-64',
}: QueryStateWrapperProps<T>) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center', height, className)}>
        {loadingComponent ?? <LoadingSpinner />}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center p-4', height, className)}>
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading data</p>
        <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // Empty state (data is null/undefined)
  if (data === null || data === undefined) {
    if (emptyState) {
      return <>{emptyState}</>;
    }
    // If no empty state provided, render nothing
    return null;
  }

  // Success - render children with data
  return <>{children(data)}</>;
}
