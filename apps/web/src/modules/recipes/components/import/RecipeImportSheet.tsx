import { useState } from 'react';
import {
  Link2,
  Loader2,
  Clock,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { trpc } from '@/lib/trpc';
import type {
  ScrapedRecipe,
  SaveScrapedRecipeInput,
  ScrapedIngredient,
  MealType,
} from '@honeydo/shared';

interface RecipeImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional callback when recipe is successfully saved. Receives the new recipe ID. */
  onSuccess?: (recipeId: string) => void;
}

type Step = 'url' | 'edit' | 'success';

const EFFORT_LABELS = ['Minimal', 'Easy', 'Moderate', 'Involved', 'Complex'];
const DIET_OPTIONS = [
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
];
const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function RecipeImportSheet({ open, onOpenChange, onSuccess }: RecipeImportSheetProps) {
  const [step, setStep] = useState<Step>('url');
  const [scrapedData, setScrapedData] = useState<ScrapedRecipe | null>(null);
  const [savedRecipeName, setSavedRecipeName] = useState<string>('');

  // Scrape mutation
  const scrapeMutation = trpc.recipes.scrape.fromUrl.useMutation({
    onSuccess: (data) => {
      setScrapedData(data);
      setStep('edit');
    },
  });

  // Cuisines query for dropdown
  const { data: cuisines } = trpc.recipes.scrape.getCuisines.useQuery(undefined, {
    enabled: open,
  });

  // Save mutation
  const saveMutation = trpc.recipes.scrape.saveToLibrary.useMutation({
    onSuccess: (data) => {
      setSavedRecipeName(data.recipe.name);
      setStep('success');
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(data.recipe.id);
      }
    },
  });

  const handleClose = () => {
    // Reset state when closing
    setStep('url');
    setScrapedData(null);
    setSavedRecipeName('');
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === 'edit') {
      setStep('url');
      setScrapedData(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {step === 'edit' && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <SheetTitle>
                {step === 'url' && 'Import Recipe'}
                {step === 'edit' && 'Review & Edit'}
                {step === 'success' && 'Recipe Saved!'}
              </SheetTitle>
              <SheetDescription>
                {step === 'url' && 'Paste a recipe URL to import it to your library'}
                {step === 'edit' && 'Review the scraped data and make any adjustments'}
                {step === 'success' && 'Your recipe has been added to the library'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6">
          {step === 'url' && (
            <UrlStep
              onSubmit={(url) => scrapeMutation.mutate({ url })}
              isLoading={scrapeMutation.isPending}
              error={scrapeMutation.error?.message}
            />
          )}

          {step === 'edit' && scrapedData && (
            <EditStep
              scrapedData={scrapedData}
              cuisines={cuisines ?? []}
              onSave={(data) => saveMutation.mutate(data)}
              isLoading={saveMutation.isPending}
              error={saveMutation.error?.message}
            />
          )}

          {step === 'success' && (
            <SuccessStep recipeName={savedRecipeName} onClose={handleClose} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Step 1: URL Input
interface UrlStepProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  error?: string;
}

function UrlStep({ onSubmit, isLoading, error }: UrlStepProps) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError('');

    // Basic URL validation
    try {
      new URL(url);
      onSubmit(url);
    } catch {
      setUrlError('Please enter a valid URL');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="url">Recipe URL</Label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="url"
            placeholder="https://example.com/recipe/..."
            className="pl-9"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
          />
        </div>
        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || !url.trim()}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Scraping recipe...
          </>
        ) : (
          <>
            <ChevronRight className="h-4 w-4 mr-2" />
            Import Recipe
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Supports 400+ recipe websites including NYT Cooking, Serious Eats, Bon Appetit, and more
      </p>
    </form>
  );
}

// Step 2: Edit Form
interface EditStepProps {
  scrapedData: ScrapedRecipe;
  cuisines: string[];
  onSave: (data: SaveScrapedRecipeInput) => void;
  isLoading: boolean;
  error?: string;
}

function EditStep({ scrapedData, cuisines, onSave, isLoading, error }: EditStepProps) {
  // Form state - use strings for number inputs to allow empty field while typing
  const [name, setName] = useState(scrapedData.name);
  const [cuisine, setCuisine] = useState('');
  const [diet, setDiet] = useState<'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore' | null>(null);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(String(scrapedData.prepTimeMinutes ?? ''));
  const [cookTimeMinutes, setCookTimeMinutes] = useState(String(scrapedData.cookTimeMinutes ?? ''));
  const [totalTimeMinutes, setTotalTimeMinutes] = useState(String(scrapedData.totalTimeMinutes ?? ''));
  const [effort, setEffort] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [defaultServings, setDefaultServings] = useState(String(scrapedData.defaultServings ?? 4));
  const [mealTypes, setMealTypes] = useState<MealType[]>(['dinner']);
  const [ingredients, setIngredients] = useState<ScrapedIngredient[]>(scrapedData.ingredients);
  const [newIngredient, setNewIngredient] = useState('');

  // Validation
  const [errors, setErrors] = useState<{ name?: string; cuisine?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const newErrors: { name?: string; cuisine?: string } = {};
    if (!name.trim()) newErrors.name = 'Recipe name is required';
    if (!cuisine) newErrors.cuisine = 'Cuisine is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const data: SaveScrapedRecipeInput = {
      name: name.trim(),
      source: scrapedData.source,
      sourceUrl: scrapedData.sourceUrl,
      cuisine,
      diet,
      prepTimeMinutes: parseInt(prepTimeMinutes) || 0,
      cookTimeMinutes: parseInt(cookTimeMinutes) || 0,
      totalTimeMinutes: parseInt(totalTimeMinutes) || 0,
      effort,
      defaultServings: parseInt(defaultServings) || 1,
      servingsUnit: 'servings',
      mealTypes,
      ingredients,
      instructions: scrapedData.instructions,
      tags: [],
    };

    onSave(data);
  };

  const addIngredient = () => {
    if (!newIngredient.trim()) return;
    const newIng: ScrapedIngredient = {
      name: newIngredient.trim(),
      amount: null,
      unit: null,
      category: 'pantry',
    };
    setIngredients([...ingredients, newIng]);
    setNewIngredient('');
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, updates: Partial<ScrapedIngredient>) => {
    setIngredients(ingredients.map((ing, i) => (i === index ? { ...ing, ...updates } : ing)));
  };

  const toggleMealType = (type: MealType) => {
    setMealTypes((prev) => {
      const isSelected = prev.includes(type);
      if (isSelected) {
        const updated = prev.filter((t) => t !== type);
        return updated.length > 0 ? updated : ['dinner'];
      }
      return [...prev, type];
    });
  };

  // Dedupe cuisines for dropdown
  const allCuisines = [...new Set([...cuisines, 'American', 'Italian', 'Mexican', 'Asian', 'Mediterranean', 'Indian', 'Other'])];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Recipe Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cuisine">Cuisine *</Label>
            <Select
              value={cuisine}
              onValueChange={(v) => {
                setCuisine(v);
                setErrors((prev) => ({ ...prev, cuisine: undefined }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cuisine" />
              </SelectTrigger>
              <SelectContent>
                {allCuisines.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.cuisine && <p className="text-sm text-destructive">{errors.cuisine}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="diet">Diet</Label>
            <Select
              value={diet ?? ''}
              onValueChange={(v) => setDiet(v as typeof diet)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {DIET_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Time & Effort */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Time & Effort</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted space-y-2">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground" />
            <Label htmlFor="prepTime" className="text-xs">
              Prep (min)
            </Label>
            <Input
              id="prepTime"
              type="number"
              min={0}
              className="h-8 text-center"
              value={prepTimeMinutes}
              onChange={(e) => setPrepTimeMinutes(e.target.value)}
            />
          </div>
          <div className="text-center p-3 rounded-lg bg-muted space-y-2">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground" />
            <Label htmlFor="cookTime" className="text-xs">
              Cook (min)
            </Label>
            <Input
              id="cookTime"
              type="number"
              min={0}
              className="h-8 text-center"
              value={cookTimeMinutes}
              onChange={(e) => setCookTimeMinutes(e.target.value)}
            />
          </div>
          <div className="text-center p-3 rounded-lg bg-muted space-y-2">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground" />
            <Label htmlFor="totalTime" className="text-xs">
              Total (min)
            </Label>
            <Input
              id="totalTime"
              type="number"
              min={0}
              className="h-8 text-center"
              value={totalTimeMinutes}
              onChange={(e) => setTotalTimeMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="effort">Effort Level</Label>
            <Select value={String(effort)} onValueChange={(v) => setEffort(parseInt(v) as typeof effort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFORT_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {i + 1} - {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="servings">Servings</Label>
            <Input
              id="servings"
              type="number"
              min={1}
              value={defaultServings}
              onChange={(e) => setDefaultServings(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Ingredients ({ingredients.length})</h4>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-muted">
              <div className="flex-1 flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">
                  {ing.amount !== null && `${ing.amount} ${ing.unit ?? ''}`}
                </span>
                <Input
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, { name: e.target.value })}
                  className="h-7 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeIngredient(i)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add ingredient..."
            value={newIngredient}
            onChange={(e) => setNewIngredient(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIngredient())}
            className="h-8 text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Instructions Preview */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Instructions ({scrapedData.instructions.length} steps)</h4>
        <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground space-y-1">
          {scrapedData.instructions.slice(0, 3).map((step, i) => (
            <p key={i} className="truncate">
              {i + 1}. {step}
            </p>
          ))}
          {scrapedData.instructions.length > 3 && (
            <p className="text-xs">... and {scrapedData.instructions.length - 3} more steps</p>
          )}
        </div>
      </div>

      {/* Meal Types */}
      <div className="space-y-2">
        <Label>Meal Types</Label>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPE_OPTIONS.map((type) => {
            const isSelected = mealTypes.includes(type.value);
            return (
              <Badge
                key={type.value}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleMealType(type.value)}
              >
                {type.label}
              </Badge>
            );
          })}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Check className="h-4 w-4 mr-2" />
            Save to Library
          </>
        )}
      </Button>
    </form>
  );
}

// Step 3: Success
interface SuccessStepProps {
  recipeName: string;
  onClose: () => void;
}

function SuccessStep({ recipeName, onClose }: SuccessStepProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
      <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
        <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h3 className="text-lg font-medium">Recipe Added!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          "{recipeName}" has been added to your recipe library.
        </p>
      </div>
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          Import Another
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
