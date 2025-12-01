import { useState } from 'react';
import { Clock, Zap, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { trpc } from '@/lib/trpc';
import type { MealPreferences } from '@honeydo/shared';

interface TimeConstraintsProps {
  preferences: MealPreferences;
}

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];

export function TimeConstraints({ preferences }: TimeConstraintsProps) {
  const [weeknightMaxMinutes, setWeeknightMaxMinutes] = useState(preferences.weeknightMaxMinutes);
  const [weekendMaxMinutes, setWeekendMaxMinutes] = useState(preferences.weekendMaxMinutes);
  const [weeknightMaxEffort, setWeeknightMaxEffort] = useState(preferences.weeknightMaxEffort);
  const [weekendMaxEffort, setWeekendMaxEffort] = useState(preferences.weekendMaxEffort);
  const [defaultServings, setDefaultServings] = useState(preferences.defaultServings);

  const utils = trpc.useUtils();
  const updatePreferences = trpc.recipes.preferences.update.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.get.invalidate();
    },
  });

  const hasChanges =
    weeknightMaxMinutes !== preferences.weeknightMaxMinutes ||
    weekendMaxMinutes !== preferences.weekendMaxMinutes ||
    weeknightMaxEffort !== preferences.weeknightMaxEffort ||
    weekendMaxEffort !== preferences.weekendMaxEffort ||
    defaultServings !== preferences.defaultServings;

  const handleSave = () => {
    updatePreferences.mutate({
      weeknightMaxMinutes,
      weekendMaxMinutes,
      weeknightMaxEffort,
      weekendMaxEffort,
      defaultServings,
    });
  };

  return (
    <div className="space-y-6">
      {/* Weeknight Constraints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Weeknight Limits
          </CardTitle>
          <CardDescription>
            Monday through Thursday when time is limited
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max hands-on time</Label>
              <span className="text-sm font-medium">{weeknightMaxMinutes} min</span>
            </div>
            <Slider
              value={[weeknightMaxMinutes]}
              onValueChange={([v]) => setWeeknightMaxMinutes(v)}
              min={10}
              max={120}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10 min</span>
              <span>2 hours</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Prep/active cooking time. Slow cooker or oven time doesn't count.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Maximum effort level</Label>
              <span className="text-sm font-medium">{EFFORT_LABELS[weeknightMaxEffort - 1]}</span>
            </div>
            <Slider
              value={[weeknightMaxEffort]}
              onValueChange={([v]) => setWeeknightMaxEffort(v)}
              min={1}
              max={5}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Minimal</span>
              <span>Complex</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekend Constraints */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Weekend Limits
          </CardTitle>
          <CardDescription>
            Friday through Sunday when you have more time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max hands-on time</Label>
              <span className="text-sm font-medium">{weekendMaxMinutes} min</span>
            </div>
            <Slider
              value={[weekendMaxMinutes]}
              onValueChange={([v]) => setWeekendMaxMinutes(v)}
              min={10}
              max={180}
              step={5}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10 min</span>
              <span>3 hours</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Prep/active cooking time. Slow cooker or oven time doesn't count.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Maximum effort level</Label>
              <span className="text-sm font-medium">{EFFORT_LABELS[weekendMaxEffort - 1]}</span>
            </div>
            <Slider
              value={[weekendMaxEffort]}
              onValueChange={([v]) => setWeekendMaxEffort(v)}
              min={1}
              max={5}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Minimal</span>
              <span>Complex</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Servings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Servings</CardTitle>
          <CardDescription>
            How many people are you typically cooking for?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Servings per meal</Label>
              <span className="text-sm font-medium">{defaultServings}</span>
            </div>
            <Slider
              value={[defaultServings]}
              onValueChange={([v]) => setDefaultServings(v)}
              min={1}
              max={12}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>12</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4">
          <Button
            onClick={handleSave}
            disabled={updatePreferences.isPending}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {updatePreferences.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
