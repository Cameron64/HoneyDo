import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Utensils, Home as HomeIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';

const modules = [
  {
    id: 'shopping-list',
    name: 'Shopping List',
    description: 'Shared shopping lists',
    icon: ShoppingCart,
    href: '/shopping',
    color: 'text-green-500',
  },
  {
    id: 'recipes',
    name: 'Recipes',
    description: 'Recipe book and meal planning',
    icon: Utensils,
    href: '/recipes',
    color: 'text-orange-500',
  },
  {
    id: 'home-automation',
    name: 'Home Automation',
    description: 'Control your smart home',
    icon: HomeIcon,
    href: '/home-automation',
    color: 'text-blue-500',
  },
];

export function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome to HoneyDo</h1>
        <p className="text-muted-foreground">Your household management dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.id} to={module.href}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className={`rounded-lg bg-muted p-2 ${module.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{module.name}</CardTitle>
                    <CardDescription>{module.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
