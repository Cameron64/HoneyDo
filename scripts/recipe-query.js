#!/usr/bin/env node

/**
 * Recipe Query CLI
 * Query the recipe database with various filters
 *
 * Usage: node scripts/recipe-query.js [options]
 *
 * See recipe-query.md for full documentation
 */

const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '../data/recipes/history.json');

// Parse command line arguments
function parseArgs(args) {
  const options = {
    // Filters
    cuisine: null,        // comma-separated list (OR)
    diet: null,           // minimum diet level
    protein: null,        // comma-separated list (OR) - has any of these
    noProtein: null,      // comma-separated list - exclude these
    allergenFree: null,   // comma-separated list - must not contain
    meal: null,           // comma-separated list (OR)
    season: null,         // single season (includes year-round)
    macro: null,          // macro profile
    maxPrep: null,        // max prep time
    maxCook: null,        // max cook time
    maxEffort: null,      // max effort (1-5)
    tags: null,           // comma-separated (AND) - must have all
    anyTags: null,        // comma-separated (OR) - must have any

    // Time-based
    notMadeSince: null,   // days
    neverMade: false,
    madeBefore: false,

    // Output
    limit: 10,
    random: false,
    exclude: null,        // comma-separated IDs
    fields: 'id,name,cuisine,diet,proteinSources,prepTimeMinutes,effort,seasonality,tags',

    // Meta
    stats: false,
    listCuisines: false,
    listProteins: false,
    listTags: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      // Filters
      case '--cuisine':
        options.cuisine = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--diet':
        options.diet = nextArg?.toLowerCase();
        i++;
        break;
      case '--protein':
        options.protein = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--no-protein':
        options.noProtein = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--allergen-free':
        options.allergenFree = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--meal':
        options.meal = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--season':
        options.season = nextArg?.toLowerCase();
        i++;
        break;
      case '--macro':
        options.macro = nextArg?.toLowerCase();
        i++;
        break;
      case '--max-prep':
        options.maxPrep = parseInt(nextArg, 10);
        i++;
        break;
      case '--max-cook':
        options.maxCook = parseInt(nextArg, 10);
        i++;
        break;
      case '--max-effort':
        options.maxEffort = parseInt(nextArg, 10);
        i++;
        break;
      case '--tags':
        options.tags = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--any-tags':
        options.anyTags = nextArg?.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;

      // Time-based
      case '--not-made-since':
        options.notMadeSince = parseInt(nextArg, 10);
        i++;
        break;
      case '--never-made':
        options.neverMade = true;
        break;
      case '--made-before':
        options.madeBefore = true;
        break;

      // Output
      case '--limit':
        options.limit = parseInt(nextArg, 10);
        i++;
        break;
      case '--random':
        options.random = true;
        break;
      case '--exclude':
        options.exclude = nextArg?.split(',').map(s => s.trim());
        i++;
        break;
      case '--fields':
        options.fields = nextArg;
        i++;
        break;

      // Meta
      case '--stats':
        options.stats = true;
        break;
      case '--list-cuisines':
        options.listCuisines = true;
        break;
      case '--list-proteins':
        options.listProteins = true;
        break;
      case '--list-tags':
        options.listTags = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Recipe Query CLI - Query the recipe database

FILTERS:
  --cuisine <list>          Filter by cuisine (comma-separated, OR logic)
  --diet <level>            Minimum diet: vegan, vegetarian, pescatarian, omnivore
  --protein <list>          Has any of these proteins (comma-separated)
  --no-protein <list>       Exclude recipes with these proteins
  --allergen-free <list>    Must not contain these allergens
  --meal <list>             Filter by meal type: breakfast,lunch,dinner,snack
  --season <season>         Fits this season (spring,summer,fall,winter)
  --macro <profile>         Macro profile: protein-heavy,carb-heavy,balanced,light
  --max-prep <minutes>      Maximum prep time
  --max-cook <minutes>      Maximum cook time
  --max-effort <1-5>        Maximum effort level
  --tags <list>             Must have ALL these tags (comma-separated)
  --any-tags <list>         Must have ANY of these tags (comma-separated)

TIME-BASED:
  --not-made-since <days>   Not made in last N days
  --never-made              Only never-made recipes
  --made-before             Only previously-made recipes

OUTPUT:
  --limit <n>               Max results (default: 10)
  --random                  Shuffle results for variety
  --exclude <ids>           Exclude specific recipe IDs
  --fields <list>           Fields to include in output

META:
  --stats                   Show database statistics
  --list-cuisines           List all cuisines with counts
  --list-proteins           List all protein sources with counts
  --list-tags               List all tags with counts
  --help                    Show this help

EXAMPLES:
  node scripts/recipe-query.js --stats
  node scripts/recipe-query.js --not-made-since 14 --limit 20 --random
  node scripts/recipe-query.js --diet vegetarian --max-effort 2 --max-prep 30
  node scripts/recipe-query.js --cuisine Mexican,Italian --season winter
  node scripts/recipe-query.js --protein chicken --allergen-free dairy,gluten
`);
}

// Diet hierarchy for filtering
const DIET_LEVELS = {
  vegan: 0,
  vegetarian: 1,
  pescatarian: 2,
  omnivore: 3,
};

function loadRecipes() {
  const content = fs.readFileSync(HISTORY_PATH, 'utf-8');
  return JSON.parse(content).recipes;
}

function filterRecipes(recipes, options) {
  return recipes.filter(recipe => {
    // Cuisine filter (OR logic)
    if (options.cuisine && !options.cuisine.includes(recipe.cuisine.toLowerCase())) {
      return false;
    }

    // Diet filter (minimum level)
    if (options.diet) {
      const requiredLevel = DIET_LEVELS[options.diet];
      const recipeLevel = DIET_LEVELS[recipe.diet];
      if (recipeLevel > requiredLevel) {
        return false;
      }
    }

    // Protein filter (OR - has any of these)
    if (options.protein) {
      const hasAny = options.protein.some(p =>
        recipe.proteinSources.map(s => s.toLowerCase()).includes(p)
      );
      if (!hasAny && recipe.proteinSources.length > 0) {
        // If recipe has proteins, must match. If no proteins, could be veggie option
        return false;
      }
    }

    // No-protein filter (exclude these)
    if (options.noProtein) {
      const hasExcluded = options.noProtein.some(p =>
        recipe.proteinSources.map(s => s.toLowerCase()).includes(p)
      );
      if (hasExcluded) {
        return false;
      }
    }

    // Allergen-free filter
    if (options.allergenFree) {
      const hasAllergen = options.allergenFree.some(a =>
        recipe.allergens.map(x => x.toLowerCase()).includes(a)
      );
      if (hasAllergen) {
        return false;
      }
    }

    // Meal type filter (OR)
    if (options.meal) {
      const hasAny = options.meal.some(m =>
        recipe.mealTypes.map(x => x.toLowerCase()).includes(m)
      );
      if (!hasAny) {
        return false;
      }
    }

    // Season filter (includes year-round recipes)
    if (options.season) {
      if (recipe.seasonality !== null && !recipe.seasonality.includes(options.season)) {
        return false;
      }
    }

    // Macro profile filter
    if (options.macro && recipe.macroProfile !== options.macro) {
      return false;
    }

    // Max prep time
    if (options.maxPrep && recipe.prepTimeMinutes > options.maxPrep) {
      return false;
    }

    // Max cook time
    if (options.maxCook && recipe.cookTimeMinutes > options.maxCook) {
      return false;
    }

    // Max effort
    if (options.maxEffort && recipe.effort > options.maxEffort) {
      return false;
    }

    // Tags filter (AND - must have all)
    if (options.tags) {
      const recipeTags = recipe.tags.map(t => t.toLowerCase());
      const hasAll = options.tags.every(t => recipeTags.includes(t));
      if (!hasAll) {
        return false;
      }
    }

    // Any-tags filter (OR - must have any)
    if (options.anyTags) {
      const recipeTags = recipe.tags.map(t => t.toLowerCase());
      const hasAny = options.anyTags.some(t => recipeTags.includes(t));
      if (!hasAny) {
        return false;
      }
    }

    // Not made since N days
    if (options.notMadeSince) {
      if (recipe.lastMade) {
        const lastMadeDate = new Date(recipe.lastMade);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - options.notMadeSince);
        if (lastMadeDate > cutoffDate) {
          return false;
        }
      }
    }

    // Never made filter
    if (options.neverMade && recipe.timesMade > 0) {
      return false;
    }

    // Made before filter
    if (options.madeBefore && recipe.timesMade === 0) {
      return false;
    }

    // Exclude specific IDs
    if (options.exclude && options.exclude.includes(recipe.id)) {
      return false;
    }

    return true;
  });
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatOutput(recipes, options) {
  const fields = options.fields.split(',').map(f => f.trim());

  return recipes.map(recipe => {
    const output = {};
    for (const field of fields) {
      if (field in recipe) {
        output[field] = recipe[field];
      }
    }
    return output;
  });
}

function showStats(recipes) {
  const stats = {
    total: recipes.length,
    byCuisine: {},
    byDiet: {},
    byProtein: {},
    byAllergen: {},
    bySeason: { 'year-round': 0 },
    byMacro: {},
    notMadeIn14Days: 0,
    neverMade: 0,
    avgPrepTime: 0,
    avgEffort: 0,
  };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);

  let totalPrep = 0;
  let totalEffort = 0;

  for (const recipe of recipes) {
    // Cuisine
    stats.byCuisine[recipe.cuisine] = (stats.byCuisine[recipe.cuisine] || 0) + 1;

    // Diet
    stats.byDiet[recipe.diet] = (stats.byDiet[recipe.diet] || 0) + 1;

    // Proteins
    for (const p of recipe.proteinSources) {
      stats.byProtein[p] = (stats.byProtein[p] || 0) + 1;
    }

    // Allergens
    for (const a of recipe.allergens) {
      stats.byAllergen[a] = (stats.byAllergen[a] || 0) + 1;
    }

    // Season
    if (recipe.seasonality === null) {
      stats.bySeason['year-round']++;
    } else {
      for (const s of recipe.seasonality) {
        stats.bySeason[s] = (stats.bySeason[s] || 0) + 1;
      }
    }

    // Macro
    stats.byMacro[recipe.macroProfile] = (stats.byMacro[recipe.macroProfile] || 0) + 1;

    // Time-based
    if (!recipe.lastMade || new Date(recipe.lastMade) < cutoffDate) {
      stats.notMadeIn14Days++;
    }
    if (recipe.timesMade === 0) {
      stats.neverMade++;
    }

    totalPrep += recipe.prepTimeMinutes;
    totalEffort += recipe.effort;
  }

  stats.avgPrepTime = Math.round(totalPrep / recipes.length);
  stats.avgEffort = (totalEffort / recipes.length).toFixed(1);

  return stats;
}

function showList(recipes, field) {
  const counts = {};

  for (const recipe of recipes) {
    const values = Array.isArray(recipe[field]) ? recipe[field] : [recipe[field]];
    for (const v of values) {
      if (v) {
        counts[v] = (counts[v] || 0) + 1;
      }
    }
  }

  // Sort by count descending
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(sorted);
}

function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const recipes = loadRecipes();

  // Meta commands
  if (options.stats) {
    console.log(JSON.stringify(showStats(recipes), null, 2));
    return;
  }

  if (options.listCuisines) {
    console.log(JSON.stringify(showList(recipes, 'cuisine'), null, 2));
    return;
  }

  if (options.listProteins) {
    console.log(JSON.stringify(showList(recipes, 'proteinSources'), null, 2));
    return;
  }

  if (options.listTags) {
    console.log(JSON.stringify(showList(recipes, 'tags'), null, 2));
    return;
  }

  // Filter recipes
  let results = filterRecipes(recipes, options);

  // Random shuffle
  if (options.random) {
    results = shuffleArray(results);
  }

  // Apply limit
  results = results.slice(0, options.limit);

  // Format output
  const output = formatOutput(results, options);
  console.log(JSON.stringify(output, null, 2));
}

main();
