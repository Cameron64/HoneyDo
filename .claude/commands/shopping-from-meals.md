# Shopping List from Meals

Generate a shopping list from accepted meal plans, with ingredient aggregation and scaling.

## Usage

```
/shopping-from-meals [date-range] [options]
```

## Arguments

- `date-range`: Optional. Format: `YYYY-MM-DD to YYYY-MM-DD` or shortcuts
  - `this-week`, `next-week`, `weekend`
  - If not provided, uses all accepted meals without a shopping list generated

## Options

- `--list`: Target shopping list ID or name (default: default list)
- `--preview`: Show ingredients without adding to list
- `--all`: Include all ingredients (don't prompt for deselection)
- `--scale`: Override servings for all meals

## How It Works

1. **Gather Accepted Meals**: Query `accepted_meals` for the date range
2. **Extract Ingredients**: Get all ingredients from each meal's recipe
3. **Scale Quantities**: Adjust amounts based on servings override
4. **Aggregate**: Combine same ingredients (e.g., 2 lemons + 1 lemon = 3 lemons)
5. **Present for Review**: Show list with checkboxes (all selected by default)
6. **Add to Shopping List**: Add selected items to Epic 2 shopping list

## Ingredient Aggregation

When the same ingredient appears in multiple meals:

```
Monday: Lemon Herb Chicken (2 lemons)
Wednesday: Greek Salad (1 lemon)
--> Aggregated: 3 lemons
```

If units differ and can be converted:
```
Monday: 1 lb chicken
Wednesday: 8 oz chicken
--> Aggregated: 1.5 lbs chicken
```

If units can't be converted, shows separately:
```
Monday: 2 cloves garlic
Wednesday: 1 head garlic
--> Shows both entries
```

## Output Format

```
Ingredients from 5 meals (Jan 20-26):

PRODUCE
[x] Lemons (3) - from: Lemon Herb Chicken, Greek Salad
[x] Fresh rosemary (4 sprigs) - from: Lemon Herb Chicken, Roast Potatoes
[x] Cherry tomatoes (2 pints) - from: Greek Salad, Pasta Primavera
[ ] Cilantro (1 bunch) - from: Tacos (you marked as "never")

MEAT
[x] Chicken thighs (3 lbs) - from: Lemon Herb Chicken, Chicken Stir Fry
[x] Ground beef (1 lb) - from: Tacos

DAIRY
[x] Feta cheese (8 oz) - from: Greek Salad
[x] Parmesan (4 oz) - from: Pasta Primavera

Total: 12 items selected
Target list: Weekly Groceries

[Add to List] [Preview Only] [Cancel]
```

## Integration with Shopping List (Epic 2)

Uses the tRPC API:
```typescript
trpc.recipes.shopping.addToList.mutate({
  listId: 'list-123',
  ingredients: selectedIngredients.map(ing => ({
    name: ing.name,
    quantity: ing.totalAmount,
    unit: ing.unit,
    category: ing.category,
    note: `From: ${ing.fromMeals.join(', ')}`,
  })),
});
```

## Deselection Reasons

Items may be pre-deselected:
- Ingredient marked as "never" in preferences (still shown, unchecked)
- You indicated you already have it (future feature)
- Pantry staple detected (future feature)

## Files to Reference

- `docs/epics/4-recipes/features/5-shopping-list-generation/PLAN.md` - Full spec
- `apps/api/src/modules/recipes/routers/shopping.ts` - API routes
- `packages/shared/src/types/recipes.ts` - Type definitions

## Example Workflow

```bash
# Preview what would be added
/shopping-from-meals next-week --preview

# Add to default list
/shopping-from-meals next-week

# Add to specific list
/shopping-from-meals this-week --list "Costco Run"

# Scale all meals to 4 servings
/shopping-from-meals weekend --scale 4
```

## Edge Cases

- **No accepted meals**: Show message, suggest using `/suggest-meals` first
- **All ingredients deselected**: Warn before confirming empty add
- **List doesn't exist**: Offer to create it or select existing
- **Unit conversion fails**: Keep original units, show both entries
