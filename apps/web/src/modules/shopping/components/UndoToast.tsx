import { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useUndoStore } from '../stores/undo';

export function UndoToast() {
  const { actions, popAction } = useUndoStore();
  const latestAction = actions[0];
  const [progress, setProgress] = useState(100);

  const utils = trpc.useUtils();

  const addItem = trpc.shopping.items.add.useMutation({
    onSuccess: () => {
      if (latestAction) {
        utils.shopping.lists.getById.invalidate({ id: latestAction.listId });
        utils.shopping.lists.getDefault.invalidate();
      }
    },
  });

  const checkItem = trpc.shopping.items.check.useMutation({
    onSuccess: () => {
      if (latestAction) {
        utils.shopping.lists.getById.invalidate({ id: latestAction.listId });
        utils.shopping.lists.getDefault.invalidate();
      }
    },
  });

  useEffect(() => {
    if (!latestAction) {
      setProgress(100);
      return;
    }

    const elapsed = Date.now() - latestAction.timestamp;
    const remaining = Math.max(0, 30000 - elapsed);
    const startProgress = (remaining / 30000) * 100;
    setProgress(startProgress);

    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - 100 / 300; // Decrease over 30 seconds (100 steps per 100ms)
        return Math.max(0, newProgress);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [latestAction]);

  const handleUndo = () => {
    if (!latestAction) return;

    const action = popAction(latestAction.id);
    if (!action) return;

    switch (action.type) {
      case 'check':
        if (action.itemId) {
          checkItem.mutate({ id: action.itemId, checked: false });
        }
        break;
      case 'delete':
        if (action.data && typeof action.data === 'object' && 'item' in action.data) {
          const deletedItem = (action.data as { item: any }).item;
          addItem.mutate({
            listId: action.listId,
            name: deletedItem.name,
            quantity: deletedItem.quantity,
            unit: deletedItem.unit,
            category: deletedItem.category,
            note: deletedItem.note,
          });
        }
        break;
      case 'clear':
        // For clear, we'd need to restore multiple items
        // This is more complex and might not be worth implementing
        break;
    }
  };

  const handleDismiss = () => {
    if (latestAction) {
      popAction(latestAction.id);
    }
  };

  if (!latestAction) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-foreground text-background rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 gap-3">
          <span className="text-sm truncate">{latestAction.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              className="text-background hover:text-background hover:bg-background/20"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8 text-background hover:text-background hover:bg-background/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="h-1 bg-background/20">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
