import { UserButton } from '@/components/auth/UserButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { useAuth } from '@clerk/clerk-react';

// Check if dev bypass auth is enabled
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const IS_DEV = import.meta.env.DEV;

export function Header() {
  const { isSignedIn } = useAuth();

  // In dev bypass mode, treat as signed in for UI purposes
  const showAuthenticatedUI = isSignedIn || DEV_BYPASS_AUTH;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">HoneyDo</span>
          {IS_DEV && (
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-xs font-semibold text-white">
              DEV
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showAuthenticatedUI && <ConnectionStatus />}
          <ThemeToggle />
          {isSignedIn && <UserButton />}
        </div>
      </div>
    </header>
  );
}
