/**
 * Debug store for tracking errors and debug info across the app
 * Errors are scoped by module for easier debugging
 */

import { create } from 'zustand';

/** Available modules in the app */
export type AppModule = 'core' | 'shopping' | 'recipes' | 'home';

/** All modules for iteration */
export const APP_MODULES: AppModule[] = ['core', 'shopping', 'recipes', 'home'];

/** Module display names */
export const MODULE_LABELS: Record<AppModule, string> = {
  core: 'Core',
  shopping: 'Shopping',
  recipes: 'Recipes',
  home: 'Home',
};

export interface DebugError {
  id: string;
  module: AppModule;
  source: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

interface DebugStore {
  errors: DebugError[];
  selectedModule: AppModule | 'all';

  // Actions
  addError: (module: AppModule, source: string, message: string, details?: unknown) => void;
  clearErrors: (module?: AppModule) => void;
  setSelectedModule: (module: AppModule | 'all') => void;

  // Selectors
  getErrorsByModule: (module: AppModule) => DebugError[];
  getErrorCount: (module?: AppModule) => number;
}

export const useDebugStore = create<DebugStore>((set, get) => ({
  errors: [],
  selectedModule: 'all',

  addError: (module, source, message, details) =>
    set((state) => ({
      errors: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          module,
          source,
          message,
          details,
          timestamp: new Date(),
        },
        ...state.errors.slice(0, 99), // Keep last 100 errors
      ],
    })),

  clearErrors: (module) =>
    set((state) => ({
      errors: module
        ? state.errors.filter((e) => e.module !== module)
        : [],
    })),

  setSelectedModule: (module) => set({ selectedModule: module }),

  getErrorsByModule: (module) => get().errors.filter((e) => e.module === module),

  getErrorCount: (module) => {
    const errors = get().errors;
    return module ? errors.filter((e) => e.module === module).length : errors.length;
  },
}));

// Convenience selectors
export const useFilteredErrors = () => {
  const errors = useDebugStore((s) => s.errors);
  const selectedModule = useDebugStore((s) => s.selectedModule);
  return selectedModule === 'all'
    ? errors
    : errors.filter((e) => e.module === selectedModule);
};

export const useModuleErrorCounts = () => {
  const errors = useDebugStore((s) => s.errors);
  return APP_MODULES.reduce(
    (acc, module) => {
      acc[module] = errors.filter((e) => e.module === module).length;
      return acc;
    },
    {} as Record<AppModule, number>
  );
};
