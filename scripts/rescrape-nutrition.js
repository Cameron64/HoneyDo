#!/usr/bin/env node
/**
 * Re-scrape existing recipes to add nutrition data
 *
 * Usage:
 *   node scripts/rescrape-nutrition.js           # Scrape all recipes missing nutrition
 *   node scripts/rescrape-nutrition.js --all     # Force re-scrape all recipes with URLs
 *   node scripts/rescrape-nutrition.js --dry-run # Preview without saving
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, '../data/recipes/history.json');
const PYTHON_SCRIPT = path.join(__dirname, 'scrape-recipe.py');

// Parse command line arguments
const args = process.argv.slice(2);
const forceAll = args.includes('--all');
const dryRun = args.includes('--dry-run');

/**
 * Parse nutrition string values like "328 kcal" or "13 g" to numbers
 */
function parseNutrientValue(value) {
  if (!value) return null;
  const match = value.toString().match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Convert raw scraper nutrients to our schema format
 */
function normalizeNutrients(raw) {
  if (!raw) return null;

  return {
    calories: parseNutrientValue(raw.calories),
    protein: parseNutrientValue(raw.proteinContent),
    carbohydrates: parseNutrientValue(raw.carbohydrateContent),
    fat: parseNutrientValue(raw.fatContent),
    fiber: parseNutrientValue(raw.fiberContent),
    sugar: parseNutrientValue(raw.sugarContent),
    sodium: parseNutrientValue(raw.sodiumContent),
    saturatedFat: parseNutrientValue(raw.saturatedFatContent),
    cholesterol: parseNutrientValue(raw.cholesterolContent),
    servingSize: raw.servingSize || null,
  };
}

/**
 * Scrape a recipe URL using Python scraper
 */
function scrapeRecipe(url) {
  try {
    const result = execSync(`python "${PYTHON_SCRIPT}" "${url}"`, {
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    });
    return JSON.parse(result);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sleep for ms milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Recipe Nutrition Re-scraper');
  console.log('='.repeat(60));
  console.log(`Mode: ${forceAll ? 'All recipes' : 'Only missing nutrition'}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  // Load history
  const data = JSON.parse(await fs.readFile(HISTORY_FILE, 'utf8'));
  const recipes = data.recipes;

  console.log(`Total recipes: ${recipes.length}`);

  // Filter recipes to process
  const toProcess = recipes.filter(r => {
    if (!r.sourceUrl) return false;
    if (forceAll) return true;
    return !r.nutrition;
  });

  console.log(`Recipes to process: ${toProcess.length}`);
  console.log('');

  if (toProcess.length === 0) {
    console.log('No recipes need nutrition data. Use --all to force re-scrape.');
    return;
  }

  // Process each recipe
  let successCount = 0;
  let failCount = 0;
  let noDataCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const recipe = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;

    console.log(`${progress} ${recipe.name}`);
    console.log(`        URL: ${recipe.sourceUrl}`);

    if (dryRun) {
      console.log('        [DRY RUN] Would scrape');
      console.log('');
      continue;
    }

    // Scrape the URL
    const result = scrapeRecipe(recipe.sourceUrl);

    if (!result.success) {
      console.log(`        ERROR: ${result.error?.substring(0, 80)}`);
      failCount++;
      console.log('');
      await sleep(1000); // Rate limiting
      continue;
    }

    // Parse nutrition
    const nutrition = normalizeNutrients(result.nutrients);

    if (!nutrition || nutrition.calories === null) {
      console.log('        No nutrition data available on page');
      noDataCount++;
      console.log('');
      await sleep(1000);
      continue;
    }

    // Update the recipe
    const recipeIndex = recipes.findIndex(r => r.id === recipe.id);
    if (recipeIndex >= 0) {
      recipes[recipeIndex].nutrition = nutrition;
      console.log(`        Calories: ${nutrition.calories} | Protein: ${nutrition.protein}g | Carbs: ${nutrition.carbohydrates}g | Fat: ${nutrition.fat}g`);
      successCount++;
    }

    console.log('');
    await sleep(1500); // Rate limiting - be nice to servers
  }

  // Summary
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  Success: ${successCount}`);
  console.log(`  No data: ${noDataCount}`);
  console.log(`  Failed:  ${failCount}`);
  console.log('');

  // Save if not dry run and we have updates
  if (!dryRun && successCount > 0) {
    // Create backup first
    const backupPath = HISTORY_FILE.replace('.json', `.backup-${Date.now()}.json`);
    await fs.copyFile(HISTORY_FILE, backupPath);
    console.log(`Backup saved to: ${backupPath}`);

    // Save updated data
    await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
    console.log(`Updated ${successCount} recipes with nutrition data`);
  } else if (dryRun) {
    console.log('Dry run complete - no changes saved');
  }
}

main().catch(console.error);
