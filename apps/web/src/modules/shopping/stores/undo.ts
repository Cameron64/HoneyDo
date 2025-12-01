import { create } from 'zustand';

interface UndoAction {
  id: string;
  type: 'check' | 'uncheck' | 'delete' | 'clear';
  itemId?: string;
  itemIds?: string[];
  listId: string;
  timestamp: number;
  label: string;
  data?: unknown;
}

interface UndoStore {
  // State
  actions: UndoAction[];

  // Actions
  pushAction: (action: Omit<UndoAction, 'id' | 'timestamp'>) => string;
  popAction: (id: string) => UndoAction | undefined;
  clearExpired: () => void;
  getLatest: () => UndoAction | undefined;
}

const UNDO_TIMEOUT = 30000; // 30 seconds
const MAX_ACTIONS = 10;

export const useUndoStore = create<UndoStore>((set, get) => ({
  actions: [],

  pushAction: (action) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newAction: UndoAction = {
      ...action,
      id,
      timestamp: Date.now(),
    };

    set((state) => ({
      actions: [newAction, ...state.actions].slice(0, MAX_ACTIONS),
    }));

    // Auto-expire after timeout
    setTimeout(() => {
      set((state) => ({
        actions: state.actions.filter((a) => a.id !== id),
      }));
    }, UNDO_TIMEOUT);

    return id;
  },

  popAction: (id) => {
    const action = get().actions.find((a) => a.id === id);
    if (action) {
      set((state) => ({
        actions: state.actions.filter((a) => a.id !== id),
      }));
    }
    return action;
  },

  clearExpired: () => {
    const now = Date.now();
    set((state) => ({
      actions: state.actions.filter((a) => now - a.timestamp < UNDO_TIMEOUT),
    }));
  },

  getLatest: () => {
    const actions = get().actions;
    return actions.length > 0 ? actions[0] : undefined;
  },
}));
