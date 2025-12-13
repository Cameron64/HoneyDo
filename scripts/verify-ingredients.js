const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/recipes/history.json'), 'utf8'));

// Show examples with complete ingredients
['Taco Bowl', 'Indian Butter Chicken', 'Beef and Lentil Stew'].forEach(name => {
  const r = data.recipes.find(r => r.name === name);
  if (!r) return;
  console.log(`\n=== ${name} (${r.ingredients.length} ingredients) ===`);
  r.ingredients.forEach(i => {
    const amt = i.amount ? ` (${i.amount}${i.unit ? ' ' + i.unit : ''})` : '';
    console.log(`  - ${i.name}${amt} [${i.category}]`);
  });
});

// Count total herbs/spices
const herbs = new Set();
data.recipes.forEach(r => {
  (r.ingredients || []).forEach(i => {
    const name = i.name.toLowerCase();
    if (/salt|pepper|cumin|paprika|oregano|thyme|rosemary|basil|cilantro|parsley|cinnamon|nutmeg|turmeric|garam|curry|chili|cayenne|coriander|bay|sage|dill|red pepper flakes|garlic powder|onion powder/i.test(name)) {
      herbs.add(i.name.toLowerCase());
    }
  });
});

console.log('\n\n=== All unique herbs/spices found ===');
console.log(Array.from(herbs).sort().join(', '));

// Stats
let totalIngredients = 0;
let recipesWithSpices = 0;
data.recipes.forEach(r => {
  totalIngredients += (r.ingredients || []).length;
  const hasSpice = (r.ingredients || []).some(i =>
    /salt|pepper|spice|season|herb/i.test(i.name)
  );
  if (hasSpice) recipesWithSpices++;
});

console.log('\n\n=== Stats ===');
console.log(`Total recipes: ${data.recipes.length}`);
console.log(`Recipes with seasonings: ${recipesWithSpices}`);
console.log(`Average ingredients per recipe: ${(totalIngredients / data.recipes.length).toFixed(1)}`);
