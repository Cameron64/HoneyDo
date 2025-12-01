import { useAuth, RedirectToSignIn } from '@clerk/clerk-react';
import { FullPageSpinner } from '@/components/common/LoadingSpinner';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

// Dev bypass for autonomous testing (Claude Code can access the app without auth)
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();

  // Skip auth check in dev bypass mode
  if (DEV_BYPASS_AUTH) {
    return <>{children}</>;
  }

  if (!isLoaded) {
    return <FullPageSpinner />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return <>{children}</>;
}
