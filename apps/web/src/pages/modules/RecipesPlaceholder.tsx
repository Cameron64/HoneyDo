import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Utensils } from 'lucide-react';

export function RecipesPlaceholder() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Recipes</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-orange-100 p-3 text-orange-600 dark:bg-orange-900/20">
              <Utensils className="h-8 w-8" />
            </div>
            <div>
              <CardTitle>Coming Soon</CardTitle>
              <CardDescription>
                The Recipes module is part of Epic 4
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This module will include a recipe book, meal planning, and ingredient-to-shopping-list
            integration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
