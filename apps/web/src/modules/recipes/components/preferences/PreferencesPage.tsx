import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Clock, AlertCircle, Heart, FileText, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { trpc } from '@/lib/trpc';
import { useRecipesSync } from '../../hooks/use-recipes-sync';
import { TimeConstraints } from './TimeConstraints';
import { DietaryRestrictions } from './DietaryRestrictions';
import { IngredientPreferences } from './IngredientPreferences';
import { FreeformNotes } from './FreeformNotes';
import { ScheduleSettings } from './ScheduleSettings';

export function PreferencesPage() {
  const [activeTab, setActiveTab] = useState('time');

  // Set up real-time sync
  useRecipesSync();

  // Fetch preferences
  const { data: preferences, isLoading, error } = trpc.recipes.preferences.get.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive mb-2">Error loading preferences</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b p-4">
        <div className="flex items-center gap-3">
          <Link to="/recipes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Preferences</h1>
            <p className="text-sm text-muted-foreground">Customize your meal suggestions</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="sticky top-0 bg-background z-10 border-b">
            <TabsList className="w-full justify-start rounded-none border-0 h-auto p-0 bg-transparent">
              <TabsTrigger
                value="time"
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Time</span>
              </TabsTrigger>
              <TabsTrigger
                value="dietary"
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <AlertCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Dietary</span>
              </TabsTrigger>
              <TabsTrigger
                value="ingredients"
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Heart className="h-4 w-4" />
                <span className="hidden sm:inline">Ingredients</span>
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Notes</span>
              </TabsTrigger>
              <TabsTrigger
                value="schedule"
                className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4">
            <TabsContent value="time" className="m-0">
              <TimeConstraints preferences={preferences!} />
            </TabsContent>
            <TabsContent value="dietary" className="m-0">
              <DietaryRestrictions preferences={preferences!} />
            </TabsContent>
            <TabsContent value="ingredients" className="m-0">
              <IngredientPreferences />
            </TabsContent>
            <TabsContent value="notes" className="m-0">
              <FreeformNotes />
            </TabsContent>
            <TabsContent value="schedule" className="m-0">
              <ScheduleSettings />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
