# Feature 1.7: Settings Service

> User preferences that persist and sync.

## Overview

This feature implements the settings system - user preferences for theme, notifications, module configuration, and more. Settings are stored server-side and sync across devices via WebSocket.

## Acceptance Criteria

- [ ] Settings page with organized sections
- [ ] Theme switching (light/dark/system)
- [ ] Settings persist to database
- [ ] Settings sync across devices in real-time
- [ ] Module enable/disable toggles
- [ ] Notification preferences
- [ ] Settings accessible via tRPC

## Technical Details

### Settings Categories

1. **Appearance**
   - Theme: light / dark / system
   - Accent color (future)

2. **Notifications**
   - Enable/disable notifications
   - Push notification toggle
   - Notification sounds (future)

3. **Modules**
   - Per-module enable/disable
   - Module-specific settings (delegated to each module)

4. **Account**
   - Profile info (from Clerk)
   - Sign out

### Data Model

Already defined in Feature 1.3, but for reference:

```typescript
// User preferences stored in users.preferences JSON field
interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  accentColor?: string;
  notifications: {
    enabled: boolean;
    push: boolean;
    sound: boolean;
  };
}

// Module-specific settings in user_modules.config JSON field
interface ModuleConfig {
  // Varies by module
  [key: string]: unknown;
}
```

### API Routes (tRPC)

```typescript
// apps/api/src/modules/settings/router.ts
import { z } from 'zod';
import { router } from '../../trpc';
import { protectedProcedure } from '../../trpc/procedures';

const themeSchema = z.enum(['light', 'dark', 'system']);

const userPreferencesSchema = z.object({
  theme: themeSchema.optional(),
  accentColor: z.string().optional(),
  notifications: z.object({
    enabled: z.boolean(),
    push: z.boolean(),
    sound: z.boolean(),
  }).optional(),
});

export const settingsRouter = router({
  // Get current user's preferences
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    return user?.preferences ?? getDefaultPreferences();
  }),

  // Update preferences
  update: protectedProcedure
    .input(userPreferencesSchema.partial())
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
        columns: { preferences: true },
      });

      const updated = {
        ...getDefaultPreferences(),
        ...current?.preferences,
        ...input,
      };

      await ctx.db.update(users)
        .set({
          preferences: updated,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, ctx.userId));

      // Broadcast to user's other devices
      socketEmitter.toUser(ctx.userId, 'system:settings:updated', {
        preferences: updated,
      });

      return updated;
    }),

  // Get enabled modules for user
  getModules: protectedProcedure.query(async ({ ctx }) => {
    const userMods = await ctx.db.query.userModules.findMany({
      where: eq(userModules.userId, ctx.userId),
      with: { module: true },
    });

    const allModules = await ctx.db.query.modules.findMany({
      where: eq(modules.enabled, true),
    });

    return allModules.map(mod => ({
      ...mod,
      userEnabled: userMods.find(um => um.moduleId === mod.id)?.enabled ?? true,
      config: userMods.find(um => um.moduleId === mod.id)?.config ?? {},
    }));
  }),

  // Toggle module for user
  toggleModule: protectedProcedure
    .input(z.object({
      moduleId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(userModules)
        .values({
          userId: ctx.userId,
          moduleId: input.moduleId,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [userModules.userId, userModules.moduleId],
          set: { enabled: input.enabled },
        });

      return { success: true };
    }),

  // Update module-specific config
  updateModuleConfig: protectedProcedure
    .input(z.object({
      moduleId: z.string(),
      config: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(userModules)
        .values({
          userId: ctx.userId,
          moduleId: input.moduleId,
          config: input.config,
        })
        .onConflictDoUpdate({
          target: [userModules.userId, userModules.moduleId],
          set: { config: input.config },
        });

      return { success: true };
    }),
});

function getDefaultPreferences(): UserPreferences {
  return {
    theme: 'system',
    notifications: {
      enabled: true,
      push: false,
      sound: true,
    },
  };
}
```

### Frontend State Management

```typescript
// apps/web/src/stores/settings.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: 'honeydo-settings',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    root.classList.toggle('dark', systemTheme === 'dark');
    useSettingsStore.setState({ resolvedTheme: systemTheme });
  } else {
    root.classList.toggle('dark', theme === 'dark');
    useSettingsStore.setState({ resolvedTheme: theme });
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  const stored = useSettingsStore.getState().theme;
  applyTheme(stored);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      if (useSettingsStore.getState().theme === 'system') {
        applyTheme('system');
      }
    });
}
```

### Settings Page Component

```tsx
// apps/web/src/pages/Settings.tsx
import { trpc } from '../lib/trpc';
import { useSettingsStore } from '../stores/settings';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { UserButton } from '@clerk/clerk-react';
import { Separator } from '../components/ui/separator';

export function SettingsPage() {
  const { theme, setTheme } = useSettingsStore();
  const { data: preferences, isLoading } = trpc.settings.get.useQuery();
  const { data: modules } = trpc.settings.getModules.useQuery();
  const updatePreferences = trpc.settings.update.useMutation();
  const toggleModule = trpc.settings.toggleModule.useMutation();

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    setTheme(value);
    updatePreferences.mutate({ theme: value });
  };

  const handleNotificationToggle = (enabled: boolean) => {
    updatePreferences.mutate({
      notifications: { ...preferences?.notifications, enabled },
    });
  };

  const handleModuleToggle = (moduleId: string, enabled: boolean) => {
    toggleModule.mutate({ moduleId, enabled });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="theme">Theme</Label>
            <Select value={theme} onValueChange={handleThemeChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notifications">Enable notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive updates about changes
              </p>
            </div>
            <Switch
              id="notifications"
              checked={preferences?.notifications?.enabled ?? true}
              onCheckedChange={handleNotificationToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modules */}
      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {modules?.map((module) => (
            <div key={module.id} className="flex items-center justify-between">
              <div>
                <Label>{module.name}</Label>
                <p className="text-sm text-muted-foreground">
                  {module.description}
                </p>
              </div>
              <Switch
                checked={module.userEnabled}
                onCheckedChange={(enabled) => handleModuleToggle(module.id, enabled)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <UserButton
              appearance={{
                elements: { avatarBox: 'h-16 w-16' }
              }}
            />
            <div>
              <p className="font-medium">Manage your account</p>
              <p className="text-sm text-muted-foreground">
                Update profile, change password, sign out
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Theme Toggle Component

```tsx
// apps/web/src/components/common/ThemeToggle.tsx
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useSettingsStore } from '../../stores/settings';
import { trpc } from '../../lib/trpc';

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();
  const updatePreferences = trpc.settings.update.useMutation();

  const handleChange = (value: 'light' | 'dark' | 'system') => {
    setTheme(value);
    updatePreferences.mutate({ theme: value });
  };

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Icon className="h-5 w-5" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleChange('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Real-time Sync

```typescript
// apps/web/src/hooks/useSettingsSync.ts
import { useSocketEvent } from '../services/socket/hooks';
import { useSettingsStore } from '../stores/settings';
import { trpc } from '../lib/trpc';

export function useSettingsSync() {
  const setTheme = useSettingsStore((s) => s.setTheme);
  const utils = trpc.useUtils();

  // Listen for settings changes from other devices
  useSocketEvent('system:settings:updated', (data) => {
    if (data.preferences?.theme) {
      setTheme(data.preferences.theme);
    }
    // Invalidate query to refetch
    utils.settings.get.invalidate();
  });
}
```

## Implementation Steps

1. **Create Settings Router**
   - get, update procedures
   - getModules, toggleModule procedures
   - updateModuleConfig procedure

2. **Create Zustand Store**
   - Theme state with persistence
   - Theme application logic
   - System theme listener

3. **Build Settings Page**
   - Appearance section
   - Notifications section
   - Modules section
   - Account section (Clerk UserButton)

4. **Create Theme Toggle**
   - Dropdown with three options
   - Persist choice to server

5. **Add Settings Sync**
   - WebSocket listener for changes
   - Invalidate queries on update

6. **Integrate with App**
   - Add route for /settings
   - Add ThemeToggle to header
   - Initialize theme on app load

7. **Test Multi-device Sync**
   - Change theme on one device
   - Verify other device updates

## Definition of Done

- [ ] Settings page accessible at /settings
- [ ] Theme switching works (light/dark/system)
- [ ] System theme detected automatically
- [ ] Settings persist on refresh
- [ ] Settings sync between devices
- [ ] Modules can be enabled/disabled
- [ ] Clerk profile accessible from settings

## Dependencies

- Feature 1.3 (Database) - for storing settings
- Feature 1.4 (API Foundation) - tRPC routes
- Feature 1.5 (Frontend Shell) - UI components
- Feature 1.6 (WebSocket) - real-time sync

## Notes

- Local storage caches theme for instant load
- Server is source of truth, local is optimistic
- Module toggles affect navigation visibility
- Consider per-module settings pages (linked from here)
