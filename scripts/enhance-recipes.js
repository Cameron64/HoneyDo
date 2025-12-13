const fs = require('fs');
const path = require('path');

const historyPath = path.join(__dirname, '../data/recipes/history.json');
const data = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

// Common seasonings by cuisine/type
const seasoningsByCuisine = {
  'Indian': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'turmeric', amount: 0.5, unit: 'tsp', category: 'pantry' },
  ],
  'Asian': [
    { name: 'salt', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'white pepper', amount: 0.25, unit: 'tsp', category: 'pantry' },
  ],
  'Thai': [
    { name: 'salt', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'fish sauce', amount: 1, unit: 'tbsp', category: 'pantry' },
  ],
  'Mediterranean': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'dried oregano', amount: 1, unit: 'tsp', category: 'pantry' },
  ],
  'Mexican': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'fresh cilantro', amount: 0.25, unit: 'cup', category: 'produce' },
  ],
  'Italian': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
    { name: 'fresh basil', amount: 0.25, unit: 'cup', category: 'produce', optional: true },
  ],
  'American': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
  ],
  'Cuban': [
    { name: 'salt', amount: 1, unit: 'tsp', category: 'pantry' },
    { name: 'black pepper', amount: 0.5, unit: 'tsp', category: 'pantry' },
  ],
  'Korean': [
    { name: 'salt', amount: 0.5, unit: 'tsp', category: 'pantry' },
  ],
  'Japanese': [
    { name: 'salt', amount: 0.5, unit: 'tsp', category: 'pantry' },
  ],
};

// Special additions based on tags or recipe name
const specialAdditions = {
  'stew': [{ name: 'bay leaf', amount: 2, unit: null, category: 'pantry' }],
  'soup': [{ name: 'bay leaf', amount: 1, unit: null, category: 'pantry' }],
  'chili': [{ name: 'smoked paprika', amount: 1, unit: 'tsp', category: 'pantry' }],
  'roast': [{ name: 'fresh rosemary', amount: 2, unit: 'sprigs', category: 'produce' }],
  'chicken': [{ name: 'paprika', amount: 0.5, unit: 'tsp', category: 'pantry' }],
};

// Check if ingredient already exists
function hasIngredient(ingredients, name) {
  return ingredients.some(i =>
    i.name.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(i.name.toLowerCase())
  );
}

let enhancedCount = 0;
const enhancements = [];

data.recipes.forEach(recipe => {
  const originalCount = recipe.ingredients.length;
  const added = [];

  // Add cuisine-based seasonings
  const seasonings = seasoningsByCuisine[recipe.cuisine] || seasoningsByCuisine['American'];
  seasonings.forEach(s => {
    if (!hasIngredient(recipe.ingredients, s.name)) {
      recipe.ingredients.push({...s});
      added.push(s.name);
    }
  });

  // Add special additions based on tags
  Object.entries(specialAdditions).forEach(([keyword, additions]) => {
    if (recipe.tags?.some(t => t.includes(keyword)) ||
        recipe.name.toLowerCase().includes(keyword)) {
      additions.forEach(a => {
        if (!hasIngredient(recipe.ingredients, a.name)) {
          recipe.ingredients.push({...a});
          added.push(a.name);
        }
      });
    }
  });

  if (recipe.ingredients.length > originalCount) {
    enhancedCount++;
    enhancements.push({ name: recipe.name, added });
  }
});

// Save the enhanced file
fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));

console.log(`Enhanced ${enhancedCount} recipes with missing seasonings`);
console.log(`Total recipes: ${data.recipes.length}`);
console.log('\nEnhancements:');
enhancements.forEach(e => {
  console.log(`  - ${e.name}: +${e.added.join(', ')}`);
});
