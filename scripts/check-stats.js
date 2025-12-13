const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/recipes/history.json', 'utf8'));

console.log('=== FINAL SCRAPE RESULTS ===\n');

const total = data.recipes.length;
const withIngredients = data.recipes.filter(r => r.ingredients && r.ingredients.length > 0).length;
const withInstructions = data.recipes.filter(r => r.instructions && r.instructions.length > 0).length;
const withTimes = data.recipes.filter(r => r.prepTimeMinutes || r.cookTimeMinutes).length;

console.log('Total recipes:', total);
console.log('With ingredients:', withIngredients + '/' + total, '(' + Math.round(withIngredients/total*100) + '%)');
console.log('With instructions:', withInstructions + '/' + total, '(' + Math.round(withInstructions/total*100) + '%)');
console.log('With times:', withTimes + '/' + total);

const totalInstructions = data.recipes.reduce((sum, r) => sum + (r.instructions ? r.instructions.length : 0), 0);
console.log('\nTotal instruction steps:', totalInstructions);
console.log('Average steps per recipe:', (totalInstructions / withInstructions).toFixed(1));

let totalIngs = 0, withAmounts = 0, withUnits = 0;
for (const r of data.recipes) {
  for (const ing of r.ingredients || []) {
    totalIngs++;
    if (ing.amount !== null) withAmounts++;
    if (ing.unit !== null) withUnits++;
  }
}

console.log('\nIngredient quality:');
console.log('  Total ingredients:', totalIngs);
console.log('  With amounts:', withAmounts, '(' + Math.round(withAmounts/totalIngs*100) + '%)');
console.log('  With units:', withUnits, '(' + Math.round(withUnits/totalIngs*100) + '%)');

const noInstructions = data.recipes.filter(r => !r.instructions || r.instructions.length === 0);
if (noInstructions.length > 0) {
  console.log('\nRecipes missing instructions (' + noInstructions.length + '):');
  noInstructions.forEach(r => {
    console.log('  -', r.name);
    console.log('    URL:', r.sourceUrl);
  });
}
