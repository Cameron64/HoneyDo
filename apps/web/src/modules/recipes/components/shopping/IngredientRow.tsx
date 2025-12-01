import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AggregatedIngredient } from '@honeydo/shared';

export interface IngredientRowProps {
  ingredient: AggregatedIngredient;
  selected: boolean;
  onToggle: () => void;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
}

export function IngredientRow({
  ingredient,
  selected,
  onToggle,
  quantity,
  onQuantityChange,
}: IngredientRowProps) {
  // Use ingredient's totalAmount as default if quantity not provided
  const displayQuantity = quantity ?? ingredient.totalAmount;
  const canEditQuantity = onQuantityChange !== undefined && quantity !== undefined;

  const handleDecrement = () => {
    if (canEditQuantity && quantity > 0.25) {
      const newQty = quantity <= 1 ? quantity - 0.25 : quantity - 1;
      onQuantityChange(Math.max(0.25, newQty));
    }
  };

  const handleIncrement = () => {
    if (canEditQuantity) {
      const newQty = quantity < 1 ? quantity + 0.25 : quantity + 1;
      onQuantityChange(newQty);
    }
  };

  const formatQuantity = (qty: number): string => {
    if (qty === 0.25) return '¼';
    if (qty === 0.5) return '½';
    if (qty === 0.75) return '¾';
    if (Number.isInteger(qty)) return String(qty);
    return qty.toFixed(2);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg transition-colors',
        selected ? 'bg-muted/50' : 'opacity-50'
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        className="shrink-0"
      />

      {/* Name & Meals */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', !selected && 'line-through text-muted-foreground')}>
          {ingredient.name}
        </p>
        <div className="flex flex-wrap gap-1 mt-1">
          {ingredient.fromMeals.map((meal, i) => (
            <Badge key={i} variant="outline" className="text-xs py-0">
              {meal}
            </Badge>
          ))}
        </div>
      </div>

      {/* Quantity Controls - only when editing is enabled */}
      {selected && canEditQuantity && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDecrement}
            disabled={(quantity ?? 0) <= 0.25}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-12 text-center text-sm font-medium">
            {formatQuantity(displayQuantity)}
            {ingredient.unit && (
              <span className="text-muted-foreground ml-1 text-xs">
                {ingredient.unit}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleIncrement}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Show quantity without controls (read-only mode or deselected) */}
      {(selected && !canEditQuantity) && (
        <span className="text-sm font-medium shrink-0">
          {formatQuantity(displayQuantity)} {ingredient.unit}
        </span>
      )}

      {/* Show original quantity when deselected */}
      {!selected && (
        <span className="text-sm text-muted-foreground shrink-0">
          {formatQuantity(ingredient.totalAmount)} {ingredient.unit}
        </span>
      )}

      {/* Additional amounts (when units don't match) */}
      {selected && ingredient.additionalAmounts && ingredient.additionalAmounts.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {ingredient.additionalAmounts.map((a, i) => (
            <span key={i}>+{a.amount} {a.unit}</span>
          ))}
        </div>
      )}
    </div>
  );
}
