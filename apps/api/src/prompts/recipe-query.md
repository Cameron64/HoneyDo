# Recipe Query CLI

You have access to `recipe-query`, a command-line tool for querying the recipe database. Use this tool to find suitable recipes based on various criteria.

## Basic Usage

```bash
node scripts/recipe-query.js [options]
```

## Available Options

### Filters

| Option | Description | Example |
|--------|-------------|---------|
| `--cuisine <list>` | Filter by cuisine (comma-separated, OR logic) | `--cuisine Mexican,Italian` |
| `--diet <level>` | Minimum diet level: vegan, vegetarian, pescatarian, omnivore | `--diet vegetarian` |
| `--protein <list>` | Has any of these proteins | `--protein chicken,turkey` |
| `--no-protein <list>` | Exclude recipes with these proteins | `--no-protein beef,pork` |
| `--allergen-free <list>` | Must not contain these allergens | `--allergen-free dairy,gluten` |
| `--meal <list>` | Meal type (OR logic) | `--meal dinner,lunch` |
| `--season <season>` | Fits this season (also includes year-round) | `--season winter` |
| `--macro <profile>` | Macro profile | `--macro protein-heavy` |
| `--max-prep <min>` | Maximum prep time in minutes | `--max-prep 20` |
| `--max-cook <min>` | Maximum cook time in minutes | `--max-cook 30` |
| `--max-effort <1-5>` | Maximum effort level | `--max-effort 2` |
| `--tags <list>` | Must have ALL these tags | `--tags weeknight,chicken` |
| `--any-tags <list>` | Must have ANY of these tags | `--any-tags comfort-food,soup` |

### Time-Based Filters

| Option | Description | Example |
|--------|-------------|---------|
| `--not-made-since <days>` | Not made in last N days | `--not-made-since 14` |
| `--never-made` | Only recipes never made before | `--never-made` |
| `--made-before` | Only recipes that have been made | `--made-before` |

### Output Control

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Maximum results | 10 |
| `--random` | Shuffle results for variety | false |
| `--exclude <ids>` | Exclude specific recipe IDs | - |

### Database Info

| Option | Description |
|--------|-------------|
| `--stats` | Show database overview |
| `--list-cuisines` | List all cuisines with counts |
| `--list-proteins` | List all protein sources with counts |
| `--list-tags` | List all tags with counts |

## Values Reference

### Cuisines
Indian, Asian, Cuban, Mediterranean, Italian, Mexican, American, Thai, Korean, French, Middle Eastern, Asian Fusion

### Diet Levels (hierarchical)
- `vegan` - No animal products
- `vegetarian` - No meat/fish, may have dairy/eggs
- `pescatarian` - May have fish/seafood
- `omnivore` - Includes meat

**Note:** Filtering by `--diet vegetarian` includes vegan recipes too.

### Proteins
chicken, beef, pork, turkey, fish, shrimp, shellfish, tofu, lentils, beans, eggs

### Allergens
dairy, gluten, nuts, soy, eggs, shellfish, fish, sesame

### Macro Profiles
protein-heavy, carb-heavy, balanced, light

### Seasons
spring, summer, fall, winter (null = year-round)

### Effort Scale
1 = Minimal (assemble only)
2 = Easy (one pot, minimal prep)
3 = Moderate (some prep, single technique)
4 = Involved (multiple components)
5 = Complex (advanced techniques)

## Output Format

Results are returned as JSON array:

```json
[
  {
    "id": "r_abc123",
    "name": "Potato Curry",
    "cuisine": "Indian",
    "diet": "vegetarian",
    "proteinSources": ["beans"],
    "prepTimeMinutes": 15,
    "effort": 2,
    "seasonality": null,
    "tags": ["vegetarian", "curry", "weeknight"]
  }
]
```

## Example Workflow

### 1. Start with stats to understand what's available:
```bash
node scripts/recipe-query.js --stats
```

### 2. Get a broad pool avoiding recent meals:
```bash
node scripts/recipe-query.js --not-made-since 14 --limit 25 --random
```

### 3. Query for specific slots:

**Quick weeknight vegetarian:**
```bash
node scripts/recipe-query.js --diet vegetarian --max-prep 20 --max-effort 2 --limit 5
```

**Hearty winter comfort food:**
```bash
node scripts/recipe-query.js --season winter --any-tags comfort-food,hearty,soup --limit 5
```

**Mexican or Italian, dairy-free:**
```bash
node scripts/recipe-query.js --cuisine Mexican,Italian --allergen-free dairy --limit 5
```

**High protein with chicken:**
```bash
node scripts/recipe-query.js --protein chicken --macro protein-heavy --limit 5
```

### 4. Exclude already-selected recipes:
```bash
node scripts/recipe-query.js --not-made-since 14 --exclude r_abc123,r_def456 --limit 5
```

## Tips

1. **Use `--random`** when getting broad results to ensure variety across multiple requests
2. **Use `--exclude`** to prevent selecting the same recipe twice in one planning session
3. **Combine filters** for specific needs (e.g., `--diet vegetarian --max-effort 2 --max-prep 20`)
4. **Check `--stats` first** to understand the distribution of recipes
5. **Season filter includes year-round** - filtering `--season winter` also includes recipes with no specific seasonality
