import { UserButton } from '@/components/auth/UserButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { useAuth } from '@clerk/clerk-react';

export function Header() {
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">HoneyDo</span>
        </div>

        <div className="flex items-center gap-2">
          {isSignedIn && <ConnectionStatus />}
          <ThemeToggle />
          {isSignedIn && <UserButton />}
        </div>
      </div>
    </header>
  );
}
