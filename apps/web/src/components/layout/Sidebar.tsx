import { Link, useLocation } from '@tanstack/react-router';
import { Home, ShoppingCart, Utensils, Home as HomeIcon, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping List' },
  { to: '/recipes', icon: Utensils, label: 'Recipes' },
  { to: '/home-automation', icon: HomeIcon, label: 'Home' },
];

export function Sidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <aside className="relative w-64 border-r bg-card">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = currentPath === to || (to !== '/' && currentPath.startsWith(to));

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <Link
          to="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            currentPath === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
