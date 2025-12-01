import { Link, useLocation } from '@tanstack/react-router';
import { Home, ShoppingCart, Utensils, Home as HomeIcon, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { to: '/recipes', icon: Utensils, label: 'Recipes' },
  { to: '/home-automation', icon: HomeIcon, label: 'Home' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="flex h-16 items-center justify-around">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = currentPath === to || (to !== '/' && currentPath.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 p-2 text-xs',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
