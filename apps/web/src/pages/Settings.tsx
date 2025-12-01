import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useSettingsStore } from '@/stores/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserButton } from '@clerk/clerk-react';
import { RefreshCw, Trash2, Check } from 'lucide-react';
import type { Theme } from '@honeydo/shared';

export function SettingsPage() {
  const { theme, setTheme } = useSettingsStore();
  const { data: preferences } = trpc.settings.get.useQuery();
  const { data: modules } = trpc.settings.getModules.useQuery();
  const updatePreferences = trpc.settings.update.useMutation();
  const toggleModule = trpc.settings.toggleModule.useMutation();

  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    setClearSuccess(false);

    try {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      setClearSuccess(true);

      // Reload after a brief delay to show success
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setIsClearing(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update();
      }
    }
    // Also do a hard reload
    window.location.reload();
  };

  const handleThemeChange = (value: Theme) => {
    setTheme(value);
    updatePreferences.mutate({ theme: value });
  };

  const handleNotificationToggle = (enabled: boolean) => {
    updatePreferences.mutate({
      notifications: {
        enabled,
        push: preferences?.notifications?.push ?? false,
        sound: preferences?.notifications?.sound ?? true,
      },
    });
  };

  const handleModuleToggle = (moduleId: string, enabled: boolean) => {
    toggleModule.mutate({ moduleId, enabled });
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
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
              <p className="text-sm text-muted-foreground">Receive updates about changes</p>
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
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
              <Switch
                checked={module.userEnabled}
                onCheckedChange={(enabled) => handleModuleToggle(module.id, enabled)}
              />
            </div>
          ))}
          {!modules?.length && (
            <p className="text-sm text-muted-foreground">No modules available</p>
          )}
        </CardContent>
      </Card>

      {/* App / PWA */}
      <Card>
        <CardHeader>
          <CardTitle>App</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Check for updates</Label>
              <p className="text-sm text-muted-foreground">
                Refresh to get the latest version
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCheckForUpdates}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Update
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Clear cache</Label>
              <p className="text-sm text-muted-foreground">
                Force download of all app files
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={isClearing || clearSuccess}
            >
              {clearSuccess ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Done
                </>
              ) : isClearing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </>
              )}
            </Button>
          </div>
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
                elements: { avatarBox: 'h-16 w-16' },
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
