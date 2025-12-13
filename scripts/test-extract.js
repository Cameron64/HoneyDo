const recipeScraper = require('recipe-data-scraper');

async function test() {
  const url = process.argv[2] || 'https://therealfooddietitians.com/slow-cooker-white-chicken-chili/';
  console.log('Testing:', url);

  const data = await recipeScraper(url);

  console.log('\nRaw recipeInstructions:');
  console.log('Type:', typeof data.recipeInstructions);
  console.log('Is Array:', Array.isArray(data.recipeInstructions));
  console.log('Length:', data.recipeInstructions?.length);
  console.log('Content:', JSON.stringify(data.recipeInstructions, null, 2));
}

test().catch(console.error);
