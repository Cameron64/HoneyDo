#!/usr/bin/env node

/**
 * Migration script to add IDs and infer metadata for recipes
 * Run with: node scripts/migrate-recipe-metadata.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple ID generator (like nanoid)
function nanoid(size = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

const HISTORY_PATH = path.join(__dirname, '../data/recipes/history.json');

// Known protein sources (lowercase for matching)
const PROTEIN_MAP = {
  chicken: ['chicken', 'chicken breast', 'chicken thigh', 'chicken thighs', 'rotisserie chicken'],
  beef: ['beef', 'ground beef', 'steak', 'sirloin', 'chuck', 'flank steak', 'beef broth'],
  pork: ['pork', 'pork tenderloin', 'pork chop', 'bacon', 'ham', 'sausage', 'italian sausage'],
  turkey: ['turkey', 'ground turkey', 'turkey breast'],
  fish: ['salmon', 'cod', 'tilapia', 'tuna', 'halibut', 'fish', 'mahi'],
  shrimp: ['shrimp', 'prawns'],
  shellfish: ['crab', 'lobster', 'scallops', 'clams', 'mussels', 'oysters'],
  tofu: ['tofu', 'tempeh'],
  lentils: ['lentils', 'red lentils', 'green lentils'],
  beans: ['black beans', 'kidney beans', 'cannellini beans', 'chickpeas', 'garbanzo'],
  eggs: ['egg', 'eggs'],
};

// Allergen detection (lowercase)
const ALLERGEN_MAP = {
  dairy: ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'sour cream', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'cream cheese', 'half-and-half', 'heavy cream', 'cottage cheese', 'ricotta'],
  gluten: ['flour', 'bread', 'pasta', 'spaghetti', 'noodles', 'tortilla', 'pita', 'breadcrumbs', 'panko', 'orzo', 'couscous', 'barley', 'wheat', 'gnocchi', 'rigatoni'],
  nuts: ['almonds', 'walnuts', 'cashews', 'pecans', 'pistachios', 'pine nuts', 'peanuts', 'peanut butter', 'almond butter'],
  soy: ['soy sauce', 'tofu', 'tempeh', 'edamame', 'soy milk', 'tamari', 'miso'],
  eggs: ['egg', 'eggs', 'mayo', 'mayonnaise'],
  shellfish: ['shrimp', 'prawns', 'crab', 'lobster', 'scallops', 'clams', 'mussels', 'oysters'],
  fish: ['salmon', 'cod', 'tilapia', 'tuna', 'halibut', 'fish', 'anchovy', 'anchovies', 'fish sauce', 'mahi'],
  sesame: ['sesame', 'sesame oil', 'sesame seeds', 'tahini'],
};

// Seasonality hints from tags and recipe names
const SEASON_HINTS = {
  winter: ['chili', 'soup', 'stew', 'slow-cooker', 'comfort-food', 'hearty', 'pot pie', 'roast', 'braise'],
  summer: ['grilling', 'salad', 'light', 'fresh', 'bbq', 'kabob', 'cold'],
  fall: ['pumpkin', 'harvest', 'maple', 'squash', 'apple'],
  spring: ['fresh', 'light', 'asparagus', 'pea'],
};

// Macro profile hints
const MACRO_HINTS = {
  'protein-heavy': ['steak', 'chicken breast', 'meatball', 'burger', 'kabob'],
  'carb-heavy': ['pasta', 'rice', 'potato', 'gnocchi', 'noodle', 'bread'],
  'light': ['salad', 'soup', 'zucchini', 'light'],
};

function inferProteins(ingredients) {
  const found = new Set();
  const ingredientNames = ingredients.map(i => i.name.toLowerCase());

  for (const [protein, keywords] of Object.entries(PROTEIN_MAP)) {
    for (const keyword of keywords) {
      if (ingredientNames.some(name => name.includes(keyword))) {
        found.add(protein);
        break;
      }
    }
  }

  return Array.from(found);
}

function inferAllergens(ingredients) {
  const found = new Set();
  const ingredientNames = ingredients.map(i => i.name.toLowerCase());

  for (const [allergen, keywords] of Object.entries(ALLERGEN_MAP)) {
    for (const keyword of keywords) {
      if (ingredientNames.some(name => name.includes(keyword))) {
        found.add(allergen);
        break;
      }
    }
  }

  return Array.from(found);
}

function inferDiet(proteins, allergens) {
  const hasMeat = proteins.some(p => ['chicken', 'beef', 'pork', 'turkey'].includes(p));
  const hasFish = proteins.some(p => ['fish', 'shrimp', 'shellfish'].includes(p));
  const hasDairy = allergens.includes('dairy');
  const hasEggs = allergens.includes('eggs') || proteins.includes('eggs');

  if (hasMeat) return 'omnivore';
  if (hasFish) return 'pescatarian';
  if (hasDairy || hasEggs) return 'vegetarian';
  return 'vegan';
}

function inferSeasonality(recipe) {
  const found = new Set();
  const searchText = `${recipe.name} ${(recipe.tags || []).join(' ')}`.toLowerCase();

  for (const [season, hints] of Object.entries(SEASON_HINTS)) {
    if (hints.some(hint => searchText.includes(hint))) {
      found.add(season);
    }
  }

  // Return null for year-round if no specific season detected
  return found.size > 0 ? Array.from(found) : null;
}

function inferMacroProfile(recipe, proteins) {
  const searchText = `${recipe.name} ${(recipe.tags || []).join(' ')}`.toLowerCase();

  // Check hints
  for (const [profile, hints] of Object.entries(MACRO_HINTS)) {
    if (hints.some(hint => searchText.includes(hint))) {
      return profile;
    }
  }

  // Infer from proteins
  if (proteins.length >= 2 || proteins.some(p => ['beef', 'chicken', 'fish', 'shrimp'].includes(p))) {
    return 'protein-heavy';
  }

  return 'balanced';
}

function inferMealTypes(recipe) {
  const name = recipe.name.toLowerCase();
  const tags = (recipe.tags || []).map(t => t.toLowerCase());

  if (tags.includes('breakfast') || name.includes('breakfast')) return ['breakfast'];
  if (tags.includes('lunch') || name.includes('salad') || name.includes('sandwich')) return ['lunch', 'dinner'];
  if (tags.includes('dessert') || name.includes('dessert') || name.includes('cake')) return ['dessert'];
  if (tags.includes('snack')) return ['snack'];

  // Default to dinner for most recipes
  return ['dinner'];
}

function migrateRecipe(recipe) {
  // Skip if already has ID
  if (recipe.id) {
    console.log(`  Skipping ${recipe.name} (already has ID)`);
    return recipe;
  }

  const ingredients = recipe.ingredients || [];
  const proteins = inferProteins(ingredients);
  const allergens = inferAllergens(ingredients);

  const migrated = {
    id: `r_${nanoid(10)}`,
    name: recipe.name,
    source: recipe.source,
    sourceUrl: recipe.sourceUrl,
    cuisine: recipe.cuisine,

    // New metadata fields
    diet: inferDiet(proteins, allergens),
    proteinSources: proteins,
    allergens: allergens,
    macroProfile: inferMacroProfile(recipe, proteins),
    mealTypes: inferMealTypes(recipe),
    seasonality: inferSeasonality(recipe),

    // Existing fields
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    totalTimeMinutes: recipe.totalTimeMinutes,
    effort: recipe.effort,
    defaultServings: recipe.defaultServings,
    servingsUnit: recipe.servingsUnit,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    tags: recipe.tags || [],
    rating: recipe.rating || null,
    timesMade: recipe.timesMade || 0,
    lastMade: recipe.lastMade || null,
  };

  console.log(`  Migrated ${recipe.name}: diet=${migrated.diet}, proteins=[${proteins.join(',')}], allergens=[${allergens.join(',')}]`);

  return migrated;
}

function main() {
  console.log('Loading recipe history...');
  const content = fs.readFileSync(HISTORY_PATH, 'utf-8');
  const history = JSON.parse(content);

  console.log(`Found ${history.recipes.length} recipes\n`);

  console.log('Migrating recipes...');
  const migrated = history.recipes.map(migrateRecipe);

  // Write back
  const output = { recipes: migrated };
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\nMigration complete!');

  // Print summary
  const diets = {};
  const proteins = {};
  const allergens = {};

  for (const r of migrated) {
    diets[r.diet] = (diets[r.diet] || 0) + 1;
    for (const p of r.proteinSources) {
      proteins[p] = (proteins[p] || 0) + 1;
    }
    for (const a of r.allergens) {
      allergens[a] = (allergens[a] || 0) + 1;
    }
  }

  console.log('\nSummary:');
  console.log('By diet:', diets);
  console.log('By protein:', proteins);
  console.log('By allergen:', allergens);
}

main();
