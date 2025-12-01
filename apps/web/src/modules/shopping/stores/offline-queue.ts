import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface QueuedAction {
  id: string;
  type: 'add' | 'update' | 'delete' | 'check' | 'reorder';
  payload: unknown;
  timestamp: number;
}

interface OfflineQueueStore {
  // State
  queue: QueuedAction[];
  isOnline: boolean;
  isSyncing: boolean;

  // Actions
  enqueue: (action: Omit<QueuedAction, 'id' | 'timestamp'>) => void;
  dequeue: (id: string) => void;
  clearQueue: () => void;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
}

const MAX_QUEUE_SIZE = 100;

export const useOfflineQueueStore = create<OfflineQueueStore>()(
  persist(
    (set) => ({
      queue: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,

      enqueue: (action) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newAction: QueuedAction = {
          ...action,
          id,
          timestamp: Date.now(),
        };

        set((state) => ({
          queue: [...state.queue, newAction].slice(-MAX_QUEUE_SIZE),
        }));
      },

      dequeue: (id) => {
        set((state) => ({
          queue: state.queue.filter((a) => a.id !== id),
        }));
      },

      clearQueue: () => {
        set({ queue: [] });
      },

      setOnline: (online) => {
        set({ isOnline: online });
      },

      setSyncing: (syncing) => {
        set({ isSyncing: syncing });
      },
    }),
    {
      name: 'shopping-offline-queue',
      partialize: (state) => ({ queue: state.queue }),
    }
  )
);

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOfflineQueueStore.getState().setOnline(true);
  });

  window.addEventListener('offline', () => {
    useOfflineQueueStore.getState().setOnline(false);
  });
}
