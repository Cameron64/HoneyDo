const https = require('https');

const url = process.argv[2] || 'https://archive.is/Tqn4J';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractRecipeFromHtml(html) {
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      let data = JSON.parse(match[1]);
      if (data['@graph']) {
        const recipe = data['@graph'].find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        if (recipe) return recipe;
      }
      if (Array.isArray(data)) {
        const recipe = data.find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        if (recipe) return recipe;
      }
      if (data['@type'] === 'Recipe' ||
          (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))) {
        return data;
      }
    } catch (e) {
      // Continue
    }
  }
  return null;
}

function extractInstructions(recipeInstructions) {
  if (!recipeInstructions || !Array.isArray(recipeInstructions)) return [];
  const instructions = [];
  for (const item of recipeInstructions) {
    if (typeof item === 'string') {
      if (item.trim()) instructions.push(item.trim());
    } else if (item && typeof item === 'object') {
      if (item.text) {
        instructions.push(item.text.trim());
      } else if (item.itemListElement && Array.isArray(item.itemListElement)) {
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

async function test() {
  console.log('Fetching:', url);
  const html = await fetchUrl(url);
  console.log('HTML length:', html.length);

  const recipe = extractRecipeFromHtml(html);

  if (recipe) {
    console.log('\n✓ Found recipe!');
    console.log('Name:', recipe.name);
    console.log('Ingredients:', recipe.recipeIngredient?.length || 0);

    const instructions = extractInstructions(recipe.recipeInstructions);
    console.log('Instructions:', instructions.length);

    if (instructions.length > 0) {
      console.log('\nFirst 3 instructions:');
      instructions.slice(0, 3).forEach((inst, i) => {
        console.log(`${i + 1}. ${inst.substring(0, 100)}...`);
      });
    }

    if (recipe.recipeIngredient?.length > 0) {
      console.log('\nFirst 5 ingredients:');
      recipe.recipeIngredient.slice(0, 5).forEach((ing, i) => {
        console.log(`${i + 1}. ${ing}`);
      });
    }
  } else {
    console.log('✗ No recipe found in JSON-LD');
  }
}

test().catch(console.error);
