import { create } from 'zustand';

export type ActivityType = 'thinking' | 'querying' | 'results';

interface ActivityState {
  message: string | null;
  type: ActivityType;
  progress: number;
  setActivity: (message: string, type: ActivityType, progress: number) => void;
  clearActivity: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  message: null,
  type: 'thinking',
  progress: 0,
  setActivity: (message, type, progress) => set({ message, type, progress }),
  clearActivity: () => set({ message: null, type: 'thinking', progress: 0 }),
}));
