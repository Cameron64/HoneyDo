import { useState } from 'react';
import { X, Plus, Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import type { MealPreferences, DietaryRestriction, DietaryRestrictionScope } from '@honeydo/shared';

interface DietaryRestrictionsProps {
  preferences: MealPreferences;
}

// Common restrictions with suggested defaults
const COMMON_RESTRICTIONS: { name: string; defaultScope: DietaryRestrictionScope }[] = [
  // Allergies - always avoid
  { name: 'Fish-Free (Parvalbumin)', defaultScope: 'always' },
  { name: 'Sesame-Free', defaultScope: 'always' },
  { name: 'Shellfish-Free', defaultScope: 'always' },
  { name: 'Nut-Free', defaultScope: 'always' },
  { name: 'Gluten-Free', defaultScope: 'always' },
  { name: 'Dairy-Free', defaultScope: 'always' },
  { name: 'Egg-Free', defaultScope: 'always' },
  { name: 'Soy-Free', defaultScope: 'always' },
  // Lifestyle - can be weekly or always
  { name: 'Vegetarian', defaultScope: 'weekly' },
  { name: 'Vegan', defaultScope: 'weekly' },
  { name: 'Pescatarian', defaultScope: 'weekly' },
  { name: 'Keto', defaultScope: 'weekly' },
  { name: 'Low-Carb', defaultScope: 'weekly' },
  { name: 'Low-Sodium', defaultScope: 'always' },
  { name: 'Halal', defaultScope: 'always' },
  { name: 'Kosher', defaultScope: 'always' },
];

function formatRestrictionDisplay(r: DietaryRestriction): string {
  if (r.scope === 'always') {
    return r.name;
  }
  return `${r.name} (${r.mealsPerWeek}/week)`;
}

export function DietaryRestrictions({ preferences }: DietaryRestrictionsProps) {
  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>(
    preferences.dietaryRestrictions ?? []
  );
  const [customInput, setCustomInput] = useState('');
  const [editingRestriction, setEditingRestriction] = useState<DietaryRestriction | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingRestriction, setPendingRestriction] = useState<{
    name: string;
    scope: DietaryRestrictionScope;
    mealsPerWeek: number;
  } | null>(null);

  const utils = trpc.useUtils();
  const updatePreferences = trpc.recipes.preferences.update.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.get.invalidate();
    },
  });

  const originalRestrictions = preferences.dietaryRestrictions ?? [];
  const hasChanges =
    restrictions.length !== originalRestrictions.length ||
    JSON.stringify(restrictions) !== JSON.stringify(originalRestrictions);

  const isRestrictionActive = (name: string) => {
    return restrictions.some((r) => r.name === name);
  };

  const removeRestriction = (name: string) => {
    setRestrictions((prev) => prev.filter((r) => r.name !== name));
  };

  const addRestriction = (restriction: DietaryRestriction) => {
    setRestrictions((prev) => {
      // Remove any existing with same name
      const filtered = prev.filter((r) => r.name !== restriction.name);
      return [...filtered, restriction];
    });
  };

  const handleCommonRestrictionClick = (name: string, defaultScope: DietaryRestrictionScope) => {
    if (isRestrictionActive(name)) {
      // Already active, find it and open edit dialog
      const existing = restrictions.find((r) => r.name === name);
      if (existing) {
        setEditingRestriction(existing);
      }
    } else {
      // Not active, open add dialog with defaults
      setPendingRestriction({
        name,
        scope: defaultScope,
        mealsPerWeek: 3,
      });
      setAddDialogOpen(true);
    }
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !isRestrictionActive(trimmed)) {
      setPendingRestriction({
        name: trimmed,
        scope: 'always',
        mealsPerWeek: 3,
      });
      setAddDialogOpen(true);
      setCustomInput('');
    }
  };

  const confirmAddRestriction = () => {
    if (pendingRestriction) {
      const restriction: DietaryRestriction = {
        name: pendingRestriction.name,
        scope: pendingRestriction.scope,
        ...(pendingRestriction.scope === 'weekly' && {
          mealsPerWeek: pendingRestriction.mealsPerWeek,
        }),
      };
      addRestriction(restriction);
      setPendingRestriction(null);
      setAddDialogOpen(false);
    }
  };

  const confirmEditRestriction = () => {
    if (editingRestriction) {
      addRestriction(editingRestriction);
      setEditingRestriction(null);
    }
  };

  const handleSave = () => {
    updatePreferences.mutate({
      dietaryRestrictions: restrictions,
    });
  };

  return (
    <div className="space-y-6">
      {/* Active Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Restrictions</CardTitle>
          <CardDescription>
            Recipes will respect these dietary preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {restrictions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No restrictions selected. Tap options below to add.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {restrictions.map((restriction) => (
                <Badge
                  key={restriction.name}
                  variant={restriction.scope === 'always' ? 'destructive' : 'default'}
                  className="pl-3 pr-1 py-1 flex items-center gap-1"
                >
                  <span>{formatRestrictionDisplay(restriction)}</span>
                  <button
                    onClick={() => setEditingRestriction(restriction)}
                    className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeRestriction(restriction.name)}
                    className="hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Badge variant="destructive" className="h-4 px-1 text-[10px]">Always</Badge>
              = every meal
            </span>
            <span className="inline-flex items-center gap-1 ml-3">
              <Badge variant="default" className="h-4 px-1 text-[10px]">Weekly</Badge>
              = X meals per week
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Common Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common Options</CardTitle>
          <CardDescription>
            Tap to add, tap again to edit settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {COMMON_RESTRICTIONS.map(({ name, defaultScope }) => {
              const isActive = isRestrictionActive(name);
              return (
                <Badge
                  key={name}
                  variant={isActive ? (restrictions.find(r => r.name === name)?.scope === 'always' ? 'destructive' : 'default') : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => handleCommonRestrictionClick(name, defaultScope)}
                >
                  {name}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Restriction */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Custom</CardTitle>
          <CardDescription>
            Add a specific dietary requirement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g., No nightshades"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
            />
            <Button
              onClick={handleAddCustom}
              disabled={!customInput.trim() || isRestrictionActive(customInput.trim())}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
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

      {/* Add Restriction Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Restriction: {pendingRestriction?.name}</DialogTitle>
            <DialogDescription>
              Choose how this restriction should apply to your meal plan
            </DialogDescription>
          </DialogHeader>
          {pendingRestriction && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>How should this apply?</Label>
                <Select
                  value={pendingRestriction.scope}
                  onValueChange={(value: DietaryRestrictionScope) =>
                    setPendingRestriction({ ...pendingRestriction, scope: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Always - Every meal must follow this</SelectItem>
                    <SelectItem value="weekly">Weekly - Include X meals per week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pendingRestriction.scope === 'weekly' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Meals per week</Label>
                    <span className="text-sm font-medium">{pendingRestriction.mealsPerWeek}</span>
                  </div>
                  <Slider
                    value={[pendingRestriction.mealsPerWeek]}
                    onValueChange={([v]) =>
                      setPendingRestriction({ ...pendingRestriction, mealsPerWeek: v })
                    }
                    min={1}
                    max={14}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>14</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAddRestriction}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Restriction Dialog */}
      <Dialog open={!!editingRestriction} onOpenChange={(open) => !open && setEditingRestriction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit: {editingRestriction?.name}</DialogTitle>
            <DialogDescription>
              Update how this restriction applies to your meal plan
            </DialogDescription>
          </DialogHeader>
          {editingRestriction && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>How should this apply?</Label>
                <Select
                  value={editingRestriction.scope}
                  onValueChange={(value: DietaryRestrictionScope) =>
                    setEditingRestriction({ ...editingRestriction, scope: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Always - Every meal must follow this</SelectItem>
                    <SelectItem value="weekly">Weekly - Include X meals per week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingRestriction.scope === 'weekly' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Meals per week</Label>
                    <span className="text-sm font-medium">{editingRestriction.mealsPerWeek ?? 3}</span>
                  </div>
                  <Slider
                    value={[editingRestriction.mealsPerWeek ?? 3]}
                    onValueChange={([v]) =>
                      setEditingRestriction({ ...editingRestriction, mealsPerWeek: v })
                    }
                    min={1}
                    max={14}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>14</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (editingRestriction) {
                  removeRestriction(editingRestriction.name);
                  setEditingRestriction(null);
                }
              }}
            >
              Remove
            </Button>
            <Button onClick={confirmEditRestriction}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
