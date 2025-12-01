# Feature 1.8: PWA Configuration

> Install it. Use it anywhere.

## Overview

This feature configures the app as a Progressive Web App. Users can install it on their phone or desktop, and it will work like a native app with an icon, splash screen, and offline shell. Full offline functionality comes later, but the basic PWA shell should work immediately.

## Acceptance Criteria

- [ ] App is installable on mobile and desktop
- [ ] Custom app icon and splash screen
- [ ] Standalone display mode (no browser chrome)
- [ ] Service worker caches shell for offline
- [ ] Offline indicator when disconnected
- [ ] Install prompt shown to users
- [ ] Manifest configured correctly

## Technical Details

### PWA Requirements

1. **Manifest** - JSON file describing the app
2. **Service Worker** - Script for caching and offline
3. **HTTPS** - Required for PWA (Tailscale provides this)
4. **Icons** - Multiple sizes for different devices

### Using vite-plugin-pwa

```bash
pnpm add vite-plugin-pwa --filter @honeydo/web
```

### Vite Configuration

```typescript
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'HoneyDo',
        short_name: 'HoneyDo',
        description: 'Household management for couples',
        theme_color: '#f59e0b',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
          },
          {
            src: '/icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
          },
          {
            src: '/icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: '/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
          },
          {
            src: '/icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache strategies
        runtimeCaching: [
          {
            // Cache API requests
            urlPattern: /^https:\/\/api\..*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Cache images
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache fonts
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        // Precache app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true, // Enable in dev for testing
      },
    }),
  ],
});
```

### Icon Files

Create icons in `apps/web/public/icons/`:

```
public/
├── favicon.ico
├── apple-touch-icon.png       # 180x180
├── mask-icon.svg              # Safari pinned tab
└── icons/
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    └── icon-512x512.png
```

**Icon Design**:
- Use honey/amber color (#f59e0b)
- Simple, recognizable design (honeycomb? bee? house?)
- Works at small sizes
- Maskable version has safe zone padding

### HTML Head Tags

```html
<!-- apps/web/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#f59e0b" />
    <meta name="description" content="Household management for couples" />

    <!-- iOS specific -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="HoneyDo" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/svg+xml" href="/mask-icon.svg" />

    <title>HoneyDo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Service Worker Registration

vite-plugin-pwa handles registration automatically. For custom handling:

```typescript
// apps/web/src/lib/pwa.ts
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  const updateSW = registerSW({
    onNeedRefresh() {
      // Show update prompt to user
      if (confirm('New version available. Reload?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
    onRegistered(registration) {
      console.log('Service worker registered:', registration);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}
```

### Install Prompt Component

```tsx
// apps/web/src/components/pwa/InstallPrompt.tsx
import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    if (localStorage.getItem('pwa-install-dismissed')) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if already installed, dismissed, or no prompt
  if (!installPrompt || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-4 md:left-auto md:right-4 md:w-80">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
        <Download className="h-8 w-8 text-primary" />
        <div className="flex-1">
          <p className="font-medium">Install HoneyDo</p>
          <p className="text-sm text-muted-foreground">
            Add to your home screen for quick access
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleInstall}>
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Offline Indicator

```tsx
// apps/web/src/components/pwa/OfflineIndicator.tsx
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center md:bottom-4">
      <div className="flex items-center gap-2 rounded-full bg-yellow-500 px-4 py-2 text-sm text-yellow-950 shadow-lg">
        <WifiOff className="h-4 w-4" />
        <span>You're offline</span>
      </div>
    </div>
  );
}
```

### Update Available Component

```tsx
// apps/web/src/components/pwa/UpdatePrompt.tsx
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui/button';
import { RefreshCw } from 'lucide-react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-4 md:left-auto md:right-4 md:w-80">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
        <RefreshCw className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <p className="font-medium">Update available</p>
          <p className="text-sm text-muted-foreground">
            A new version is ready
          </p>
        </div>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Update
        </Button>
      </div>
    </div>
  );
}
```

### Types for PWA

```typescript
// apps/web/src/types/pwa.d.ts
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:pwa-register' {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: Error) => void;
  };

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}

declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
```

### Integration with App

```tsx
// apps/web/src/App.tsx
import { InstallPrompt } from './components/pwa/InstallPrompt';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { UpdatePrompt } from './components/pwa/UpdatePrompt';

function App() {
  return (
    <>
      <AppShell />
      <InstallPrompt />
      <OfflineIndicator />
      <UpdatePrompt />
    </>
  );
}
```

## Implementation Steps

1. **Install vite-plugin-pwa**
   - Add to web app dependencies
   - Configure in vite.config.ts

2. **Create Icons**
   - Design app icon (or use placeholder)
   - Generate all required sizes
   - Add maskable version

3. **Configure Manifest**
   - Name, description, colors
   - Icons array
   - Display mode, orientation

4. **Update HTML Head**
   - Meta tags for PWA
   - iOS-specific tags
   - Theme color

5. **Configure Workbox**
   - Precache app shell
   - Runtime caching strategies
   - API cache (NetworkFirst)

6. **Create PWA Components**
   - InstallPrompt
   - OfflineIndicator
   - UpdatePrompt

7. **Test Installation**
   - Chrome DevTools > Application > Manifest
   - Test install on mobile
   - Verify standalone mode

8. **Test Offline**
   - DevTools > Network > Offline
   - Verify shell loads
   - Verify indicator shows

## Testing PWA

### Chrome DevTools
1. Open DevTools > Application tab
2. Check Manifest section for errors
3. Check Service Workers section
4. Use Lighthouse PWA audit

### Mobile Testing
1. Open app in mobile browser
2. Look for install prompt (Android)
3. Use "Add to Home Screen" (iOS)
4. Launch from home screen
5. Verify standalone mode

## Definition of Done

- [ ] Lighthouse PWA score > 90
- [ ] App installable on Android Chrome
- [ ] App installable on iOS Safari
- [ ] Standalone mode works (no browser chrome)
- [ ] Icons display correctly
- [ ] Offline indicator shows when disconnected
- [ ] Update prompt shows for new versions
- [ ] Service worker caches shell assets

## Dependencies

- Feature 1.1 (Project Setup) - Vite configuration
- Feature 1.5 (Frontend Shell) - App shell to cache

## Notes

- iOS has limitations (no push notifications, limited storage)
- Service worker updates can be tricky - test thoroughly
- Consider splash screen for iOS
- Maskable icons need safe zone padding (40% padding recommended)
