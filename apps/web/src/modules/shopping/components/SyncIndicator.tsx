import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useOfflineQueueStore } from '../stores/offline-queue';
import { cn } from '@/lib/utils';

export function SyncIndicator() {
  const { isOnline, isSyncing, queue } = useOfflineQueueStore();

  if (isOnline && !isSyncing && queue.length === 0) {
    return null; // Don't show when everything is normal
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs',
        !isOnline && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        isOnline && isSyncing && 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        isOnline && !isSyncing && queue.length > 0 && 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      )}
    >
      {!isOnline && (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
          {queue.length > 0 && <span>({queue.length} pending)</span>}
        </>
      )}
      {isOnline && isSyncing && (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing...</span>
        </>
      )}
      {isOnline && !isSyncing && queue.length > 0 && (
        <>
          <AlertCircle className="h-3 w-3" />
          <span>{queue.length} changes pending</span>
        </>
      )}
    </div>
  );
}
