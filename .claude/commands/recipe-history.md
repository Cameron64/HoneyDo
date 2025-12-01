# Recipe History Manager

Manage the recipe history database that powers HoneyDo's meal suggestions.

## Overview

The meal suggestion skill reads from `data/recipes/history.json` to know what recipes you've cooked and can suggest. This command helps you maintain that file.

## What You Can Do

1. **View History Stats** - Show summary of recipes, cuisines, last updates
2. **Add Recipe** - Add a new recipe to history (manual or from URL)
3. **Update Recipe** - Mark as cooked, update rating, modify details
4. **Search Recipes** - Find recipes by name, cuisine, ingredient
5. **Import Recipes** - Bulk import from JSON or other formats
6. **Export History** - Export for backup or sharing
7. **Validate History** - Check file format and fix issues

## Recipe History File

Location: `data/recipes/history.json`

Structure:
```json
{
  "recipes": [
    {
      "name": "Lemon Herb Chicken",
      "source": "NYT Cooking",
      "sourceUrl": "https://cooking.nytimes.com/recipes/...",
      "cuisine": "Mediterranean",
      "prepTimeMinutes": 15,
      "cookTimeMinutes": 45,
      "totalTimeMinutes": 60,
      "effort": 3,
      "defaultServings": 4,
      "servingsUnit": "servings",
      "ingredients": [
        { "name": "chicken thighs", "amount": 2, "unit": "lbs", "category": "meat" }
      ],
      "instructions": ["Step 1...", "Step 2..."],
      "tags": ["weeknight", "one-pan"],
      "rating": 5,
      "timesMade": 8,
      "lastMade": "2024-12-15"
    }
  ],
  "metadata": {
    "lastUpdated": "2025-01-15",
    "totalRecipes": 47
  }
}
```

## Adding Recipes

### From URL (if supported)
```
/recipe-history add https://cooking.nytimes.com/recipes/12345
```
Attempts to scrape recipe data from the URL.

### Manual Entry
```
/recipe-history add manual
```
Walks through adding all required fields.

### Quick Add (minimal)
```
/recipe-history add quick "Pasta Carbonara" --cuisine Italian --time 30
```
Creates minimal entry, fill in details later.

## Marking as Cooked

```
/recipe-history cooked "Lemon Herb Chicken"
```

Updates:
- `lastMade` to today
- `timesMade` incremented by 1
- Optionally update rating

## Searching

```
/recipe-history search chicken
/recipe-history search --cuisine Italian
/recipe-history search --tag weeknight --under 30
/recipe-history search --ingredient "chicken thighs"
```

## Validating

```
/recipe-history validate
```

Checks:
- JSON is valid
- All required fields present
- No duplicate recipe names
- Categories match allowed values
- Effort is 1-5
- Times are positive integers

## Importing

```
/recipe-history import recipes.json
/recipe-history import --merge recipes.json  # Add to existing
/recipe-history import --replace recipes.json  # Replace all
```

## Exporting

```
/recipe-history export
/recipe-history export --format csv
/recipe-history export --cuisine Italian
```

## Required Fields per Recipe

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Recipe name |
| cuisine | string | Yes | Cuisine type |
| totalTimeMinutes | number | Yes | Total cook time |
| effort | number | Yes | 1-5 difficulty scale |
| defaultServings | number | Yes | Standard serving size |
| ingredients | array | Yes | List of ingredients |
| instructions | array | Yes | Step-by-step instructions |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| source | string | Where recipe came from |
| sourceUrl | string | Link to original |
| prepTimeMinutes | number | Prep time separate from cook |
| cookTimeMinutes | number | Active cooking time |
| servingsUnit | string | "servings", "portions", etc. |
| tags | array | Searchable tags |
| rating | number | 1-5 your rating |
| timesMade | number | How many times cooked |
| lastMade | string | ISO date of last cook |

## Ingredient Categories

- `produce` - Fruits, vegetables, herbs
- `meat` - Beef, pork, lamb
- `poultry` - Chicken, turkey
- `seafood` - Fish, shellfish
- `dairy` - Milk, cheese, butter
- `pantry` - Oils, spices, canned goods
- `grains` - Rice, pasta, bread
- `other` - Everything else

## File Location

Make sure the directory exists:
```bash
mkdir -p data/recipes
```

If file doesn't exist, this command will create a valid empty structure.
