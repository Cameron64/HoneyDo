import { Outlet } from '@tanstack/react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator';

export function AppShell() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col bg-background">
        <Header />

        <div className="flex flex-1 overflow-hidden">
          {isDesktop && <Sidebar />}

          <main className="flex-1 overflow-auto pb-16 md:pb-0">
            <div className="container mx-auto max-w-4xl p-4">
              <Outlet />
            </div>
          </main>
        </div>

        {!isDesktop && <BottomNav />}

        {/* PWA Components */}
        <InstallPrompt />
        <OfflineIndicator />
      </div>
    </ProtectedRoute>
  );
}
