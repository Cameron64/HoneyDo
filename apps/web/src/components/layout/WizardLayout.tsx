import { Outlet } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

/**
 * A full-screen layout for wizards that need fixed positioning to work correctly.
 * Unlike AppShell, this doesn't have overflow-auto on the main content area,
 * allowing fixed positioned elements to work properly.
 */
export function WizardLayout() {
  return (
    <ProtectedRoute>
      <div className="h-screen bg-background">
        <Outlet />
      </div>
    </ProtectedRoute>
  );
}
