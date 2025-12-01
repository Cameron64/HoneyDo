import { useState, useRef, useCallback } from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { parseItemInput, parseMultipleItems } from '../utils/parse-item';
import { cn } from '@/lib/utils';

interface QuickAddBarProps {
  listId: string;
  className?: string;
}

export function QuickAddBar({ listId, className }: QuickAddBarProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const addItem = trpc.shopping.items.add.useMutation({
    onSuccess: () => {
      setInput('');
      inputRef.current?.focus();
      utils.shopping.lists.getById.invalidate({ id: listId });
    },
  });

  const addBulkItems = trpc.shopping.items.addBulk.useMutation({
    onSuccess: () => {
      setInput('');
      inputRef.current?.focus();
      utils.shopping.lists.getById.invalidate({ id: listId });
    },
  });

  const expandItem = trpc.shopping.ai.expand.useMutation({
    onSuccess: (data) => {
      if (data.items.length > 0) {
        addBulkItems.mutate({
          listId,
          items: data.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
          })),
        });
      }
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      // Check for multi-line input (paste)
      if (trimmed.includes('\n')) {
        const items = parseMultipleItems(trimmed);
        if (items.length > 0) {
          addBulkItems.mutate({
            listId,
            items: items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
            })),
          });
        }
        return;
      }

      // Single item
      const parsed = parseItemInput(trimmed);
      addItem.mutate({
        listId,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
      });
    },
    [input, listId, addItem, addBulkItems]
  );

  const handleExpand = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Get existing items for context
    const listData = utils.shopping.lists.getById.getData({ id: listId });
    const existingItems = listData?.items?.map((item) => item.name) ?? [];

    expandItem.mutate({
      itemName: trimmed,
      existingItems,
    });
  }, [input, listId, expandItem, utils]);

  const isLoading = addItem.isPending || addBulkItems.isPending || expandItem.isPending;

  // Show expand button for "vague" items
  const shouldShowExpand =
    input.trim().length > 2 &&
    !input.includes('\n') &&
    /^(taco|breakfast|sandwich|salad|pasta|pizza|dinner|lunch|snack)/i.test(input.trim());

  return (
    <form onSubmit={handleSubmit} className={cn('flex gap-2', className)}>
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add item... (e.g., '2 milk' or 'taco stuff')"
          disabled={isLoading}
          className="pr-10"
        />
        {shouldShowExpand && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={handleExpand}
            disabled={isLoading}
            title="Expand into ingredients"
          >
            {expandItem.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
      <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
        {isLoading && !expandItem.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
    </form>
  );
}
