import { db } from './src/db';
import { acceptedMeals, wizardSessions, mealSuggestions, type RecipeData, type MealSuggestionItem } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function query() {
  // Get the wizard session
  const sessions = await db.query.wizardSessions.findMany();
  console.log('\nWIZARD SESSIONS:', sessions.length);
  const session = sessions[0];

  if (!session?.newBatchId) {
    console.log('No active wizard session with newBatchId');
    process.exit(0);
  }

  console.log('Session:', {
    step: session.currentStep,
    newBatchId: session.newBatchId,
    currentSuggestionRequestId: session.currentSuggestionRequestId,
  });

  // Get meal from batch and inspect its recipeData
  const batchMeals = await db.query.acceptedMeals.findMany({
    where: eq(acceptedMeals.batchId, session.newBatchId),
  });

  console.log('\n=== MEALS IN BATCH ===');
  console.log('Total:', batchMeals.length);

  if (batchMeals.length > 0) {
    const firstMeal = batchMeals[0];
    console.log('\nFirst meal recipeData (raw JSON):');
    console.log(JSON.stringify(firstMeal.recipeData, null, 2));
  }

  // Check the original suggestion to see if it has ingredients
  if (session.currentSuggestionRequestId) {
    const suggestion = await db.query.mealSuggestions.findFirst({
      where: eq(mealSuggestions.id, session.currentSuggestionRequestId),
    });

    if (suggestion?.suggestions) {
      console.log('\n=== ORIGINAL SUGGESTION DATA ===');
      const items = suggestion.suggestions as MealSuggestionItem[];
      const firstItem = items[0];
      if (firstItem) {
        console.log('First suggestion recipe:');
        console.log('- Name:', firstItem.recipe.name);
        console.log('- Ingredients count:', firstItem.recipe.ingredients?.length || 0);
        if (firstItem.recipe.ingredients?.length > 0) {
          console.log('- First ingredient:', firstItem.recipe.ingredients[0]);
        }
      }
    }
  }

  process.exit(0);
}

query().catch(e => { console.error(e); process.exit(1); });
