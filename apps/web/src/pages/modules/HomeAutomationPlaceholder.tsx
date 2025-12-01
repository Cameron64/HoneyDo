import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Home } from 'lucide-react';

export function HomeAutomationPlaceholder() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Home Automation</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/20">
              <Home className="h-8 w-8" />
            </div>
            <div>
              <CardTitle>Coming Soon</CardTitle>
              <CardDescription>
                The Home Automation module is part of Epic 3
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This module will integrate with Home Assistant to control your smart home devices.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
