/**
 * EmptyState
 *
 * A reusable empty state component for when data is missing or filtered out.
 * Provides consistent styling and optional action button.
 *
 * Usage:
 * ```tsx
 * <EmptyState
 *   icon={Calendar}
 *   title="No Meals Planned"
 *   description="Plan your week with AI suggestions"
 *   action={{ label: 'New Batch', onClick: () => navigate('/recipes/wizard') }}
 * />
 * ```
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: 'default' | 'outline' | 'secondary';
}

interface EmptyStateProps {
  /** Icon to display (optional) */
  icon?: LucideIcon;
  /** Title text */
  title: string;
  /** Description text (optional) */
  description?: string;
  /** Action button (optional) */
  action?: EmptyStateAction;
  /** Additional actions (optional) */
  secondaryAction?: EmptyStateAction;
  /** Custom children to render below description */
  children?: ReactNode;
  /** Container className */
  className?: string;
  /** Icon size class (default: 'h-12 w-12') */
  iconSize?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
  iconSize = 'h-12 w-12',
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      {Icon && <Icon className={cn(iconSize, 'text-muted-foreground mb-4')} />}
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {description && (
        <p className="text-muted-foreground mb-4 max-w-sm">{description}</p>
      )}
      {children}
      {(action || secondaryAction) && (
        <div className="flex gap-2 mt-2">
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? 'outline'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.icon && (
                <secondaryAction.icon className="h-4 w-4 mr-2" />
              )}
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button
              variant={action.variant ?? 'default'}
              onClick={action.onClick}
            >
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
