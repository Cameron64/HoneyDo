/**
 * Update Accepted Meals with Enhanced Ingredients
 *
 * This script updates the recipe_data in accepted_meals table
 * to use the enhanced ingredient lists from history.json
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const historyPath = path.join(__dirname, '../../../data/recipes/history.json');
const dbPath = path.join(__dirname, '../data/honeydo.db');

// Load history
const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

// Create recipe lookup by name
const recipesByName = {};
history.recipes.forEach(r => {
  recipesByName[r.name.toLowerCase()] = r;
});

// Open database
const db = new Database(dbPath);

// Get all accepted meals
const meals = db.prepare('SELECT id, recipe_name, recipe_data FROM accepted_meals').all();

console.log(`Found ${meals.length} accepted meals\n`);

let updated = 0;
const updateStmt = db.prepare('UPDATE accepted_meals SET recipe_data = ? WHERE id = ?');

meals.forEach(meal => {
  const historyRecipe = recipesByName[meal.recipe_name.toLowerCase()];

  if (!historyRecipe) {
    console.log(`⚠ No match in history: ${meal.recipe_name}`);
    return;
  }

  const currentData = JSON.parse(meal.recipe_data);
  const currentIngCount = currentData.ingredients?.length || 0;
  const historyIngCount = historyRecipe.ingredients?.length || 0;

  // Force update to get cleaned ingredient names
  const forceUpdate = process.argv.includes('--force');

  if (historyIngCount >= currentIngCount || forceUpdate) {
    // Merge - keep current recipe data but update ingredients
    currentData.ingredients = historyRecipe.ingredients;

    updateStmt.run(JSON.stringify(currentData), meal.id);
    updated++;
    console.log(`✓ Updated: ${meal.recipe_name} (${currentIngCount} → ${historyIngCount} ingredients)`);
  } else {
    console.log(`- Skipped: ${meal.recipe_name} (already has ${currentIngCount} ingredients)`);
  }
});

db.close();

console.log(`\n=== Summary ===`);
console.log(`Updated: ${updated}`);
console.log(`Total meals: ${meals.length}`);
