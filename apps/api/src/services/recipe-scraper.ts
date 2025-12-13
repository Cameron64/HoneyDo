/**
 * Recipe Scraper Service
 *
 * Fetches recipe data from URLs using Python's recipe-scrapers library
 * with Node.js fallback. Adapted from scripts/scrape-recipes.js for use
 * as an API service.
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ScrapedRecipe, ScrapedIngredient } from '@honeydo/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Python scraper script
const PYTHON_SCRIPT = join(__dirname, '..', '..', '..', '..', 'scripts', 'scrape-recipe.py');

// ============================================
// Helper Functions
// ============================================

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#8211;': '-',
    '&#8212;': '-',
    '&#8217;': "'",
    '&#8216;': "'",
    '&#8220;': '"',
    '&#8221;': '"',
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

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, dec) => {
    const code = parseInt(dec);
    if (code === 8211 || code === 8212) return '-';
    if (code === 8216 || code === 8217) return "'";
    if (code === 8220 || code === 8221) return '"';
    return String.fromCharCode(code);
  });

  return result;
}

/**
 * Normalize unit names to consistent format
 */
function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const unitMap: Record<string, string | null> = {
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
    'large': null,
    'medium': null,
    'small': null,
  };
  return unitMap[unit.toLowerCase()] ?? unit.toLowerCase();
}

/**
 * Clean up ingredient description/name
 */
function cleanIngredientName(description: string): string {
  if (!description) return '';

  let name = decodeHtmlEntities(description);

  // Remove parenthetical notes
  name = name.replace(/\([^)]*\)/g, '');

  // Remove prep instructions and serving notes
  name = name.replace(/,?\s*(for serving|for garnish|to taste|to serve)$/i, '');
  name = name.replace(/,\s*(diced|chopped|minced|sliced|grated|shredded|cubed|julienned|crushed|beaten|melted|softened|room temperature|optional|divided|plus more|cut into|peeled|seeded|deveined|trimmed|rinsed|drained).*$/i, '');

  // Remove leading prep words
  name = name.replace(/^(fresh|dried|frozen|canned|organic|raw|cooked)\s+/i, '');

  // Remove trailing punctuation
  name = name.replace(/[,;:\s]+$/, '').trim();
  name = name.replace(/[,;:\s]+$/, '').trim();

  // Remove "optional for serving:" type prefixes
  name = name.replace(/^(optional\s+)?(for\s+)?(serving|garnish):?\s*/i, '');

  // Clean up whitespace
  name = name.replace(/\s+/g, ' ').trim();

  // Truncate very long names
  if (name.length > 50) {
    const breakPoint = name.substring(0, 50).lastIndexOf(' ');
    name = breakPoint > 20 ? name.substring(0, breakPoint) : name.substring(0, 50);
  }

  return name;
}

/**
 * Categorize ingredient by name
 */
function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();

  if (/chicken|beef|pork|turkey|sausage|bacon|steak|lamb|ham|meat|boneless|skinless|ground beef|ground turkey|ground pork|thigh|breast|tenderloin/i.test(lower)) {
    return 'meat';
  }
  if (/fish|salmon|shrimp|tuna|cod|tilapia|crab|lobster|scallop/i.test(lower)) {
    return 'seafood';
  }
  if (/milk|cheese|butter|cream|yogurt|sour cream|egg/i.test(lower)) {
    return 'dairy';
  }
  if (/onion|garlic|potato|carrot|celery|lettuce|spinach|broccoli|zucchini|lemon|lime|orange|apple|avocado|ginger|basil|cilantro|parsley|rosemary|scallion|mushroom|bell pepper|yellow pepper|red pepper|green pepper|jalap|poblano|serrano|green onion|shallot|leek|kale|cabbage|squash|sweet potato|asparagus|corn(?!starch)|pea(?!nut)|bean sprout|tomato(?! paste| sauce)|cucumber|eggplant|cauliflower/i.test(lower)) {
    return 'produce';
  }
  if (/salt|pepper|oil|vinegar|sauce|paste|broth|stock|rice|pasta|noodle|flour|sugar|honey|maple|spice|cumin|paprika|oregano|cinnamon|nutmeg|curry|chili|cayenne|seasoning|turmeric|garam|masala|mustard|coriander|cardamom|clove|bay leaf|thyme|dried|canned|bean|lentil|chickpea|tomato paste|tomato sauce|cornstarch|peanut/i.test(lower)) {
    return 'pantry';
  }

  return 'pantry';
}

/**
 * Parse ISO 8601 duration to minutes
 */
function parseDurationToMinutes(duration: string | null | undefined): number | null {
  if (!duration) return null;

  // Handle "30 minutes" style
  const simpleMatch = duration.match(/^(\d+)\s*(?:minutes?|mins?)$/i);
  if (simpleMatch) return parseInt(simpleMatch[1]);

  // Handle ISO 8601 duration (PT30M, PT1H30M, etc.)
  const isoMatch = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (isoMatch) {
    const hours = parseInt(isoMatch[1] || '0');
    const minutes = parseInt(isoMatch[2] || '0');
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Parse servings string to number
 */
function parseServings(servings: string | number | null | undefined): number | null {
  if (!servings) return null;
  if (typeof servings === 'number') return servings;

  const match = servings.toString().match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Extract domain name from URL for source attribution
 */
function extractSource(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove www. prefix and get domain
    const host = urlObj.hostname.replace(/^www\./, '');
    // Capitalize first letter of each word
    return host.split('.')[0]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return 'Unknown';
  }
}

// ============================================
// Scraper Interface
// ============================================

interface PythonScrapeResult {
  success: boolean;
  error?: string;
  title?: string;
  ingredients?: string[];
  instructions?: string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: string | number;
  image?: string;
  description?: string;
}

interface ParsedIngredient {
  description: string;
  quantity: number | null;
  unitOfMeasureID: string | null;
}

// ============================================
// Recipe Scraper Service
// ============================================

export class RecipeScraperService {
  /**
   * Scrape a recipe from a URL
   */
  async scrape(url: string): Promise<ScrapedRecipe> {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL provided');
    }

    // Try Python scraper first
    let result = this.scrapePython(url);

    if (!result.success) {
      // Could add Node.js fallback here if needed
      throw new Error(result.error || 'Failed to scrape recipe');
    }

    // Parse ingredients
    const ingredients = await this.parseIngredients(result.ingredients || []);

    if (ingredients.length === 0) {
      throw new Error('No ingredients found in recipe');
    }

    // Build response
    const prepTimeMinutes = typeof result.prepTime === 'number'
      ? result.prepTime
      : parseDurationToMinutes(result.prepTime);

    const cookTimeMinutes = typeof result.cookTime === 'number'
      ? result.cookTime
      : parseDurationToMinutes(result.cookTime);

    const totalTimeMinutes = typeof result.totalTime === 'number'
      ? result.totalTime
      : parseDurationToMinutes(result.totalTime);

    return {
      name: result.title || 'Untitled Recipe',
      description: result.description ? decodeHtmlEntities(result.description) : null,
      sourceUrl: url,
      source: extractSource(url),
      prepTimeMinutes,
      cookTimeMinutes,
      totalTimeMinutes,
      defaultServings: parseServings(result.servings),
      ingredients,
      instructions: (result.instructions || []).filter(Boolean),
      image: result.image || null,
    };
  }

  /**
   * Scrape using Python's recipe-scrapers library
   */
  private scrapePython(url: string): PythonScrapeResult {
    try {
      const result = execSync(`python "${PYTHON_SCRIPT}" "${url}"`, {
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
      });
      return JSON.parse(result);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse raw ingredient strings into structured format
   */
  private async parseIngredients(rawIngredients: string[]): Promise<ScrapedIngredient[]> {
    // Dynamically import parse-ingredient (ESM module)
    let parseIngredientLib: (text: string) => ParsedIngredient[];

    try {
      const module = await import('parse-ingredient');
      parseIngredientLib = module.parseIngredient;
    } catch {
      // Fallback: return ingredients with just names
      return rawIngredients.map(text => ({
        name: cleanIngredientName(decodeHtmlEntities(text)),
        amount: null,
        unit: null,
        category: categorizeIngredient(text),
      }));
    }

    return rawIngredients.map(rawText => {
      const text = decodeHtmlEntities(rawText).replace(/\s+/g, ' ').trim();

      try {
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
            category,
          };
        }
      } catch {
        // Fall through to fallback
      }

      // Fallback: return raw text as name
      return {
        name: cleanIngredientName(text),
        amount: null,
        unit: null,
        category: categorizeIngredient(text),
      };
    });
  }
}

// Singleton instance
let instance: RecipeScraperService | null = null;

export function getRecipeScraperService(): RecipeScraperService {
  if (!instance) {
    instance = new RecipeScraperService();
  }
  return instance;
}

export const recipeScraperService = getRecipeScraperService();
