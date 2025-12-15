import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@honeydo/shared';

// Feature flags - centralized toggles for experimental or incomplete features
interface FeatureFlags {
  /** Enable meal swap/audible functionality (request AI replacement for meals) */
  enableMealSwap: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableMealSwap: false,
};

interface SettingsState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  featureFlags: FeatureFlags;
  setTheme: (theme: Theme) => void;
  setFeatureFlag: <K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const resolved = theme === 'system' ? getSystemTheme() : theme;

  root.classList.toggle('dark', resolved === 'dark');

  useSettingsStore.setState({ resolvedTheme: resolved });
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: 'light',
      featureFlags: DEFAULT_FEATURE_FLAGS,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setFeatureFlag: (flag, value) => {
        set((state) => ({
          featureFlags: { ...state.featureFlags, [flag]: value },
        }));
      },
    }),
    {
      name: 'honeydo-settings',
      partialize: (state) => ({ theme: state.theme, featureFlags: state.featureFlags }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

// Initialize on load
if (typeof window !== 'undefined') {
  // Apply initial theme
  const stored = useSettingsStore.getState().theme;
  applyTheme(stored);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useSettingsStore.getState().theme === 'system') {
      applyTheme('system');
    }
  });
}
