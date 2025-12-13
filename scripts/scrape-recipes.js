/**
 * Recipe Scraper
 * Fetches complete recipe data from source URLs
 * Uses Python's recipe-scrapers library (400+ site support) with Node.js fallback
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const recipeScraper = require('recipe-data-scraper');
const { parseIngredient: parseIngredientLib } = require('parse-ingredient');

const historyPath = path.join(__dirname, '../data/recipes/history.json');

// Decode HTML entities
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#8211;': '-',  // en-dash
    '&#8212;': '-',  // em-dash
    '&#8217;': "'",  // right single quote
    '&#8216;': "'",  // left single quote
    '&#8220;': '"',  // left double quote
    '&#8221;': '"',  // right double quote
    '&#189;': '1/2',
    '&#188;': '1/4',
    '&#190;': '3/4',
    '&#8531;': '1/3',
    '&#8532;': '2/3',
    '½': '1/2',
    '¼': '1/4',
    '¾': '3/4',
    '⅓': '1/3',
    '⅔': '2/3',
    '⅛': '1/8',
  };

  let result = text;
  for (const [entity, replacement] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), replacement);
  }

  // Also handle numeric entities like &#8211;
  result = result.replace(/&#(\d+);/g, (match, dec) => {
    const code = parseInt(dec);
    if (code === 8211 || code === 8212) return '-';
    if (code === 8216 || code === 8217) return "'";
    if (code === 8220 || code === 8221) return '"';
    return String.fromCharCode(code);
  });

  return result;
}

// Normalize unit names to consistent format
function normalizeUnit(unit) {
  if (!unit) return null;
  const unitMap = {
    'tablespoon': 'tbsp',
    'tablespoons': 'tbsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',
    'pound': 'lb',
    'pounds': 'lb',
    'ounce': 'oz',
    'ounces': 'oz',
    'cup': 'cup',
    'cups': 'cup',
    'can': 'can',
    'cans': 'can',
    'clove': 'clove',
    'cloves': 'clove',
    'large': null,  // Size descriptors, not units
    'medium': null,
    'small': null,
  };
  return unitMap[unit.toLowerCase()] ?? unit.toLowerCase();
}

// Clean up ingredient description/name
function cleanIngredientName(description) {
  if (!description) return '';

  let name = decodeHtmlEntities(description);

  // Remove parenthetical notes like "(15 oz)" or "(optional)"
  name = name.replace(/\([^)]*\)/g, '');

  // Remove prep instructions and serving notes (but keep adjectives like "boneless, skinless")
  name = name.replace(/,?\s*(for serving|for garnish|to taste|to serve)$/i, '');
  name = name.replace(/,\s*(diced|chopped|minced|sliced|grated|shredded|cubed|julienned|crushed|beaten|melted|softened|room temperature|optional|divided|plus more|cut into|peeled|seeded|deveined|trimmed|rinsed|drained).*$/i, '');

  // Remove leading prep words
  name = name.replace(/^(fresh|dried|frozen|canned|organic|raw|cooked)\s+/i, '');

  // Remove trailing punctuation (including commas left from source)
  // Apply twice to handle nested commas like "parsley, lemon wedges,"
  name = name.replace(/[,;:\s]+$/, '').trim();
  name = name.replace(/[,;:\s]+$/, '').trim();

  // Remove "optional for serving:" type prefixes
  name = name.replace(/^(optional\s+)?(for\s+)?(serving|garnish):?\s*/i, '');

  // Clean up whitespace
  name = name.replace(/\s+/g, ' ').trim();

  // Truncate very long names (likely unparsed notes)
  if (name.length > 50) {
    // Try to find a natural break point
    const breakPoint = name.substring(0, 50).lastIndexOf(' ');
    name = breakPoint > 20 ? name.substring(0, breakPoint) : name.substring(0, 50);
  }

  return name;
}

// Parse ingredient string into structured format using parse-ingredient library
function parseIngredient(rawText) {
  const text = decodeHtmlEntities(rawText).replace(/\s+/g, ' ').trim();

  // Use the library for parsing
  const parsed = parseIngredientLib(text);

  if (parsed && parsed.length > 0) {
    const result = parsed[0];
    const name = cleanIngredientName(result.description);
    const unit = normalizeUnit(result.unitOfMeasureID);
    const category = categorizeIngredient(name);

    return {
      name: name || text,
      amount: result.quantity,
      unit,
      category
    };
  }

  // Fallback: return raw text as name
  return {
    name: text,
    amount: null,
    unit: null,
    category: categorizeIngredient(text)
  };
}

// Categorize ingredient
function categorizeIngredient(name) {
  const lower = name.toLowerCase();

  // Meat - check early
  if (/chicken|beef|pork|turkey|sausage|bacon|steak|lamb|ham|meat|boneless|skinless|ground beef|ground turkey|ground pork|thigh|breast|tenderloin/i.test(lower)) {
    return 'meat';
  }
  // Seafood
  if (/fish|salmon|shrimp|tuna|cod|tilapia|crab|lobster|scallop/i.test(lower)) {
    return 'seafood';
  }
  // Dairy
  if (/milk|cheese|butter|cream|yogurt|sour cream|egg/i.test(lower)) {
    return 'dairy';
  }
  // Produce - check before pantry to catch garlic, peppers, etc.
  if (/onion|garlic|potato|carrot|celery|lettuce|spinach|broccoli|zucchini|lemon|lime|orange|apple|avocado|ginger|basil|cilantro|parsley|rosemary|scallion|mushroom|bell pepper|yellow pepper|red pepper|green pepper|jalap|poblano|serrano|green onion|shallot|leek|kale|cabbage|squash|sweet potato|asparagus|corn(?!starch)|pea(?!nut)|bean sprout|tomato(?! paste| sauce)|cucumber|eggplant|cauliflower/i.test(lower)) {
    return 'produce';
  }
  // Pantry (spices, seasonings, oils, canned goods, dried goods)
  if (/salt|pepper|oil|vinegar|sauce|paste|broth|stock|rice|pasta|noodle|flour|sugar|honey|maple|spice|cumin|paprika|oregano|cinnamon|nutmeg|curry|chili|cayenne|seasoning|turmeric|garam|masala|mustard|coriander|cardamom|clove|bay leaf|thyme|dried|canned|bean|lentil|chickpea|tomato paste|tomato sauce|cornstarch|peanut/i.test(lower)) {
    return 'pantry';
  }

  return 'pantry';
}

// Parse ISO 8601 duration (PT30M, PT1H30M, etc.) to minutes
function parseDurationToMinutes(duration) {
  if (!duration) return null;

  // Handle "30 minutes" style
  const simpleMatch = duration.match(/^(\d+)\s*(?:minutes?|mins?)$/i);
  if (simpleMatch) return parseInt(simpleMatch[1]);

  // Handle ISO 8601 duration (PT30M, PT1H30M, PT1H, etc.)
  const isoMatch = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || '0');
    const minutes = parseInt(isoMatch[2] || '0');
    return hours * 60 + minutes;
  }

  return null;
}

// Parse servings string to number
function parseServings(servings) {
  if (!servings) return null;
  if (typeof servings === 'number') return servings;

  // "4 servings" -> 4
  const match = servings.toString().match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Scrape using Python's recipe-scrapers library
function scrapePython(url) {
  try {
    const pythonScript = path.join(__dirname, 'scrape-recipe.py');
    const result = execSync(`python "${pythonScript}" "${url}"`, {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    return JSON.parse(result);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Fetch URL content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };

    const req = protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Extract JSON-LD recipe data from HTML
function extractRecipeFromHtml(html) {
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1]);

      // Handle @graph array
      if (data['@graph']) {
        const recipe = data['@graph'].find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        if (recipe) return recipe;
      }

      // Handle array of objects
      if (Array.isArray(data)) {
        const recipe = data.find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        if (recipe) return recipe;
      }

      // Direct recipe object
      if (data['@type'] === 'Recipe' ||
          (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))) {
        return data;
      }
    } catch (e) {
      // Continue to next match
    }
  }
  return null;
}

// Extract instructions from various JSON-LD formats (handles HowToSection nesting)
function extractInstructions(recipeInstructions) {
  if (!recipeInstructions || !Array.isArray(recipeInstructions)) return [];

  const instructions = [];

  for (const item of recipeInstructions) {
    if (typeof item === 'string') {
      // Simple string instruction
      if (item.trim()) instructions.push(item.trim());
    } else if (item && typeof item === 'object') {
      if (item.text) {
        // HowToStep with text property
        instructions.push(item.text.trim());
      } else if (item.itemListElement && Array.isArray(item.itemListElement)) {
        // HowToSection with nested steps
        for (const step of item.itemListElement) {
          if (typeof step === 'string') {
            if (step.trim()) instructions.push(step.trim());
          } else if (step && step.text) {
            instructions.push(step.text.trim());
          }
        }
      }
    }
  }

  return instructions.filter(Boolean);
}

// Scrape using Node.js recipe-data-scraper (fallback)
async function scrapeNode(url) {
  try {
    const recipeData = await recipeScraper(url);
    if (!recipeData) return { success: false, error: 'No data' };

    let instructions = extractInstructions(recipeData.recipeInstructions);

    // If instructions are empty, try raw JSON-LD parsing as fallback
    // (handles HowToSection nested format that recipe-data-scraper misses)
    if (instructions.length === 0) {
      try {
        console.log('    📄 Trying raw JSON-LD parsing for instructions...');
        const html = await fetchUrl(url);
        const rawRecipe = extractRecipeFromHtml(html);
        if (rawRecipe && rawRecipe.recipeInstructions) {
          instructions = extractInstructions(rawRecipe.recipeInstructions);
          if (instructions.length > 0) {
            console.log(`    ✓ Raw JSON-LD yielded ${instructions.length} instructions`);
          }
        }
      } catch (rawError) {
        console.log(`    ⚠️  Raw JSON-LD fallback failed: ${rawError.message}`);
      }
    }

    return {
      success: true,
      title: recipeData.name,
      ingredients: recipeData.recipeIngredients || recipeData.ingredients || [],
      instructions,
      prepTime: parseDurationToMinutes(recipeData.prepTimeOriginalFormat || recipeData.prepTime),
      cookTime: parseDurationToMinutes(recipeData.cookTimeOriginalFormat || recipeData.cookTime),
      totalTime: parseDurationToMinutes(recipeData.totalTimeOriginalFormat || recipeData.totalTime),
      servings: recipeData.recipeYield,
      description: recipeData.description,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main scraper function - tries Python first, falls back to Node
async function scrapeRecipe(url, recipeName) {
  console.log(`  Fetching: ${recipeName}`);
  console.log(`    URL: ${url}`);

  // Try Python scraper first (better instruction extraction)
  let recipeData = scrapePython(url);

  if (!recipeData.success) {
    console.log(`    ⚠️  Python failed (${recipeData.error}), trying Node...`);
    recipeData = await scrapeNode(url);
  }

  if (!recipeData.success) {
    console.log(`    ❌ Both scrapers failed: ${recipeData.error}`);
    return null;
  }

  const ingredients = recipeData.ingredients || [];
  if (ingredients.length === 0) {
    console.log(`    ❌ No ingredients found`);
    return null;
  }

  const instructions = recipeData.instructions || [];
  console.log(`    ✓ Found ${ingredients.length} ingredients, ${instructions.length} instructions`);

  // Normalize times (Python returns minutes directly, Node may need parsing)
  const prepTimeMinutes = typeof recipeData.prepTime === 'number' ? recipeData.prepTime : parseDurationToMinutes(recipeData.prepTime);
  const cookTimeMinutes = typeof recipeData.cookTime === 'number' ? recipeData.cookTime : parseDurationToMinutes(recipeData.cookTime);
  const totalTimeMinutes = typeof recipeData.totalTime === 'number' ? recipeData.totalTime : parseDurationToMinutes(recipeData.totalTime);

  // Build full metadata
  const metadata = {
    name: recipeData.title,
    description: recipeData.description ? decodeHtmlEntities(recipeData.description) : null,
    image: recipeData.image,
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
    defaultServings: parseServings(recipeData.servings),
    instructions: instructions.filter(Boolean),
    tags: [],
  };

  return {
    ingredients: ingredients.map(ing => parseIngredient(ing)),
    metadata
  };
}

// Main function
async function main() {
  const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

  const recipesWithUrls = data.recipes.filter(r => r.sourceUrl && !r.sourceUrl.includes('archive.is'));

  console.log(`Found ${recipesWithUrls.length} recipes with URLs to scrape\n`);

  let updated = 0;
  let failed = 0;

  // Process a subset for testing (default 5, or specify count as argument)
  const limit = process.argv[2] ? parseInt(process.argv[2]) : 5;
  const recipesToProcess = recipesWithUrls.slice(0, limit);

  for (const recipe of recipesToProcess) {
    const result = await scrapeRecipe(recipe.sourceUrl, recipe.name);

    if (result && result.ingredients.length > 0) {
      // Update the recipe with scraped ingredients
      recipe.ingredients = result.ingredients;

      // Update metadata if we got better data from scraping
      const meta = result.metadata;

      // Times (only update if we got data and existing is missing/zero)
      if (meta.prepTimeMinutes && !recipe.prepTimeMinutes) {
        recipe.prepTimeMinutes = meta.prepTimeMinutes;
      }
      if (meta.cookTimeMinutes && !recipe.cookTimeMinutes) {
        recipe.cookTimeMinutes = meta.cookTimeMinutes;
      }
      if (meta.totalTimeMinutes && !recipe.totalTimeMinutes) {
        recipe.totalTimeMinutes = meta.totalTimeMinutes;
      }

      // Servings
      if (meta.defaultServings && !recipe.defaultServings) {
        recipe.defaultServings = meta.defaultServings;
      }

      // Instructions (replace if empty or shorter)
      if (meta.instructions.length > 0 && (!recipe.instructions || recipe.instructions.length < meta.instructions.length)) {
        recipe.instructions = meta.instructions;
      }

      // Description (only if missing)
      if (meta.description && !recipe.description) {
        recipe.description = meta.description;
      }

      // Tags (merge with existing)
      if (meta.tags.length > 0) {
        const existingTags = recipe.tags || [];
        const newTags = meta.tags.filter(t => !existingTags.includes(t));
        recipe.tags = [...existingTags, ...newTags];
      }

      updated++;
      console.log(`    Updated with ${result.ingredients.length} ingredients, ${meta.instructions.length} instructions\n`);
    } else {
      failed++;
      console.log('');
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save updated recipes
  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nTo scrape all recipes, run: node scripts/scrape-recipes.js ${recipesWithUrls.length}`);
}

main().catch(console.error);
