import { useState } from 'react';
import { Heart, HeartCrack, Ban, Search, Plus, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import type { IngredientPreferenceLevel } from '@honeydo/shared';

const PREFERENCE_LEVELS: {
  value: IngredientPreferenceLevel;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { value: 'love', label: 'Love', icon: Heart, color: 'text-green-600' },
  { value: 'like', label: 'Like', icon: Heart, color: 'text-green-500' },
  { value: 'dislike', label: 'Dislike', icon: HeartCrack, color: 'text-orange-500' },
  { value: 'never', label: 'Never', icon: Ban, color: 'text-red-500' },
];

export function IngredientPreferences() {
  const [searchQuery, setSearchQuery] = useState('');
  const [newIngredient, setNewIngredient] = useState('');
  const [newPreference, setNewPreference] = useState<IngredientPreferenceLevel>('love');

  const { data: ingredients, isLoading } = trpc.recipes.preferences.getIngredients.useQuery();
  const utils = trpc.useUtils();

  const setIngredient = trpc.recipes.preferences.setIngredient.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getIngredients.invalidate();
      setNewIngredient('');
    },
  });

  const removeIngredient = trpc.recipes.preferences.removeIngredient.useMutation({
    onSuccess: () => {
      utils.recipes.preferences.getIngredients.invalidate();
    },
  });

  const handleAddIngredient = () => {
    const trimmed = newIngredient.trim();
    if (!trimmed) return;

    setIngredient.mutate({
      ingredient: trimmed,
      preference: newPreference,
    });
  };

  // Group ingredients by preference level
  const groupedIngredients = (ingredients ?? []).reduce(
    (acc, ing) => {
      if (!acc[ing.preference]) {
        acc[ing.preference] = [];
      }
      acc[ing.preference]!.push(ing);
      return acc;
    },
    {} as Record<IngredientPreferenceLevel, NonNullable<typeof ingredients>>
  );

  // Filter by search
  const filteredIngredients = searchQuery
    ? (ingredients ?? []).filter((ing) =>
        ing.ingredient.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add New */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Ingredient Preference</CardTitle>
          <CardDescription>
            Tell us what you love or want to avoid
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newIngredient}
              onChange={(e) => setNewIngredient(e.target.value)}
              placeholder="e.g., Avocado, Cilantro, Mushrooms"
              onKeyDown={(e) => e.key === 'Enter' && handleAddIngredient()}
            />
            <Select
              value={newPreference}
              onValueChange={(v) => setNewPreference(v as IngredientPreferenceLevel)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREFERENCE_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div className="flex items-center gap-2">
                      <level.icon className={`h-4 w-4 ${level.color}`} />
                      {level.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddIngredient}
              disabled={!newIngredient.trim() || setIngredient.isPending}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      {(ingredients ?? []).length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ingredients..."
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Search Results or Grouped View */}
      {filteredIngredients ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search Results</CardTitle>
            <CardDescription>
              {filteredIngredients.length} matching ingredients
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredIngredients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No matching ingredients found
              </p>
            ) : (
              <div className="space-y-2">
                {filteredIngredients.map((ing) => {
                  const level = PREFERENCE_LEVELS.find((l) => l.value === ing.preference);
                  return (
                    <div
                      key={ing.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {level && <level.icon className={`h-4 w-4 ${level.color}`} />}
                        <span>{ing.ingredient}</span>
                        <Badge variant="secondary" className="text-xs">
                          {level?.label}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeIngredient.mutate(ing.id)}
                        disabled={removeIngredient.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Grouped by preference level */}
          {PREFERENCE_LEVELS.map((level) => {
            const items = groupedIngredients[level.value] ?? [];
            if (items.length === 0) return null;

            return (
              <Card key={level.value}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <level.icon className={`h-4 w-4 ${level.color}`} />
                    {level.label}
                    <Badge variant="secondary" className="ml-auto">
                      {items.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {items.map((ing) => (
                      <Badge
                        key={ing.id}
                        variant="outline"
                        className="pl-3 pr-2 py-1 flex items-center gap-1"
                      >
                        {ing.ingredient}
                        <button
                          onClick={() => removeIngredient.mutate(ing.id)}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          disabled={removeIngredient.isPending}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {(ingredients ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Heart className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No ingredient preferences</p>
              <p className="text-sm text-muted-foreground">
                Add ingredients you love or want to avoid
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
