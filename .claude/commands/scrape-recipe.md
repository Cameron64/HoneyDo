# Scrape Recipe Details

Fetch recipe details from a URL and populate the recipe history.

## Usage

```
/scrape-recipe [url-or-name] [options]
```

## Arguments

- `url-or-name`: Either a URL to scrape, or a recipe name from history.json to update

## Options

- `--all`: Scrape all recipes in history that have URLs but empty ingredients
- `--preview`: Show scraped data without saving
- `--force`: Overwrite existing ingredients/instructions

## What It Does

1. Fetches the recipe page from the URL
2. Extracts recipe schema (JSON-LD) or parses HTML
3. Populates:
   - Ingredients with amounts, units, and categories
   - Instructions as step array
   - Prep time, cook time, total time
   - Default servings
   - Tags from the recipe

## Example Usage

```bash
# Scrape a new URL
/scrape-recipe https://therealfooddietitians.com/chicken-caprese/

# Update existing recipe by name
/scrape-recipe "Chicken Caprese"

# Preview what would be extracted
/scrape-recipe "Lemon Chicken Piccata" --preview

# Bulk update all recipes with URLs
/scrape-recipe --all
```

## Supported Sites

Works best with sites that use structured recipe data (JSON-LD):
- Real Food Dietitians
- Skinny Taste
- Pioneer Woman
- AllRecipes
- Love and Lemons
- NYT Cooking (may require login)
- Most food blogs using WordPress recipe plugins

## Output Format

```
Scraped: Chicken Caprese

Source: Real Food Dietitians
URL: https://therealfooddietitians.com/chicken-caprese/

Times:
  Prep: 15 min
  Cook: 20 min
  Total: 35 min

Servings: 4

Ingredients (6):
  - 4 chicken breasts (poultry)
  - 2 cups cherry tomatoes (produce)
  - 8 oz fresh mozzarella (dairy)
  - 1/4 cup fresh basil (produce)
  - 2 tbsp balsamic glaze (pantry)
  - 2 tbsp olive oil (pantry)

Instructions (5 steps):
  1. Preheat oven to 400F...
  2. Season chicken with salt and pepper...
  3. ...

Tags: chicken, caprese, italian, weeknight, healthy

[Save] [Edit] [Cancel]
```

## Category Detection

Automatically categorizes ingredients:
- `produce`: vegetables, fruits, herbs
- `meat`: beef, pork, lamb
- `poultry`: chicken, turkey
- `seafood`: fish, shrimp, shellfish
- `dairy`: milk, cheese, yogurt, butter
- `pantry`: oils, spices, canned goods, sauces
- `grains`: pasta, rice, bread, flour
- `other`: anything else

## Error Handling

| Issue | Solution |
|-------|----------|
| Page requires login | Show message, allow manual entry |
| No recipe schema | Try parsing HTML directly |
| Partial data | Show what's found, allow editing |
| Site blocked | Suggest manual entry |

## Bulk Mode

With `--all`, processes recipes sequentially with rate limiting:
- 2 second delay between requests
- Shows progress: "Processing 15/62..."
- Skips recipes that already have ingredients
- Saves after each successful scrape
- Reports summary at end

```
Bulk Scrape Results:
  Processed: 45
  Succeeded: 42
  Failed: 3
    - NYT Cooking (login required)
    - Google Share links (2, unsupported)
  Skipped: 17 (already have data)
```

## Manual Entry Fallback

If scraping fails, offers guided manual entry:
```
Could not scrape URL. Enter manually?

Recipe: Taco Baked Potatoes
Enter ingredients (one per line, format: "amount unit ingredient"):
> 1 lb ground beef
> 4 baking potatoes
> ...

Enter instructions (one per line):
> Preheat oven to 400F and prick potatoes with fork
> ...
```
