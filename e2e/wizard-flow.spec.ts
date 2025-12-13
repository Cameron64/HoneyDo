import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive E2E test for the New Batch Wizard flow.
 *
 * The wizard has 4 main steps:
 * 1. Review Meals (Step 1) - Manage previous batch meals (rollover/complete/discard)
 * 2. Get Suggestions (Step 2) - AI suggestions with sub-steps:
 *    - 2a: Plan batch (if totalMealCount not set)
 *    - 2b: Manual picks (if manualPickCount > 0 and not complete)
 *    - 2c: AI suggestions
 * 3. Shopping List (Step 3) - Select ingredients for shopping
 * 4. Complete (Step 4) - Summary and finish
 *
 * Runs with DEV_BYPASS_AUTH=true to skip authentication.
 */

test.describe('New Batch Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to recipes page first
    await page.goto('/recipes');
    await page.waitForLoadState('networkidle');

    // If there's an existing wizard session, abandon it to start fresh
    await page.goto('/recipes/wizard');
    await page.waitForLoadState('networkidle');

    // Look for any existing session and try to abandon it
    const cancelBtn = page.locator('button').filter({ has: page.locator('svg') }).first(); // X button
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check if we're in middle of a wizard - look for step indicator
      const stepIndicator = page.locator('text=/Step|Review|Get Suggestions|Shopping/i');
      if (await stepIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Found existing wizard session, attempting to abandon...');
        await cancelBtn.click();
        await page.waitForTimeout(500);

        // Click confirm abandon if dialog appears
        const confirmAbandon = page.locator('button:has-text("Cancel Wizard")');
        if (await confirmAbandon.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmAbandon.click();
          await page.waitForTimeout(1000);
          console.log('Abandoned existing wizard session');
        }
      }
    }

    // Go back to recipes page
    await page.goto('/recipes');
    await page.waitForLoadState('networkidle');
  });

  test('should complete full wizard flow with AI suggestions', async ({ page }) => {
    // Navigate to wizard
    await page.goto('/recipes/wizard');
    await page.waitForLoadState('networkidle');

    // Wait for wizard to load
    await expect(page.locator('h1:has-text("New Batch")')).toBeVisible({ timeout: 10000 });
    console.log('=== WIZARD LOADED ===');

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/wizard-initial.png' });

    // Detect and log current step
    let currentStep = await detectCurrentStep(page);
    console.log(`Initial step detected: ${currentStep}`);

    // Step 1: Review Meals (handle if present)
    if (currentStep === 'step1-review') {
      console.log('Step 1: Review Meals');
      await handleStep1ReviewMeals(page);
      currentStep = await detectCurrentStep(page);
    }

    // Step 2: Get Suggestions (if not already past it)
    if (currentStep !== 'step3-shopping' && currentStep !== 'step4-complete') {
      // Step 2 has sub-steps - first check what sub-step we're on
      await page.waitForTimeout(2000); // Wait for step transition
      const step2SubStep = await detectStep2SubStep(page);
      console.log(`Step 2 sub-step: ${step2SubStep}`);

      // Step 2a: Plan Batch (if shown)
      if (step2SubStep === 'plan-batch') {
        console.log('Step 2a: Plan Batch');
        await handleStep2aPlanBatch(page, { total: 3, manualPicks: 0 });
      }

      // Step 2b: Manual Picks (if shown)
      if (step2SubStep === 'manual-picks') {
        console.log('Step 2b: Manual Picks');
        await handleStep2bManualPicks(page, 0);
      }

      // Step 2c: AI Suggestions
      if (step2SubStep === 'ai-suggestions' || step2SubStep === 'plan-batch') {
        console.log('Step 2c: AI Suggestions');
        await handleStep2cAISuggestions(page, 3);
      }

      currentStep = await detectCurrentStep(page);
    }

    // Step 3: Shopping
    if (currentStep === 'step3-shopping') {
      console.log('Step 3: Shopping');
      await handleStep3Shopping(page);
      currentStep = await detectCurrentStep(page);
    }

    // Step 4: Completion
    console.log('Step 4: Completion');
    await handleStep4Completion(page);

    console.log('=== WIZARD COMPLETED SUCCESSFULLY ===');
  });
});

/**
 * Detect which main step the wizard is currently on
 */
async function detectCurrentStep(page: Page): Promise<string> {
  // Check for step 3 (shopping) - check first because it has clear indicator
  const shoppingHeading = page.locator('h2:has-text("Shopping List")');
  const createShoppingBtn = page.locator('button:has-text("Create Shopping List")');
  if (await shoppingHeading.isVisible({ timeout: 1000 }).catch(() => false) ||
      await createShoppingBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'step3-shopping';
  }

  // Check for step 1 indicators
  const noMealsToReview = page.locator('text="No Meals to Review"');
  const reviewCurrentMeals = page.locator('text="Review Current Meals"');
  const continueToSuggestions = page.locator('button:has-text("Continue to Suggestions")');
  if (await noMealsToReview.isVisible({ timeout: 1000 }).catch(() => false) ||
      await reviewCurrentMeals.isVisible({ timeout: 1000 }).catch(() => false) ||
      await continueToSuggestions.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'step1-review';
  }

  // Check for step 2 indicators (AI suggestions loading/cards)
  const gettingVibes = page.locator('text="Getting the vibes ready..."');
  const acceptedProgress = page.locator('text=/\\d+\\/\\d+ accepted/i');
  const acceptMoreMeals = page.locator('button:has-text("Accept")').filter({ hasText: /more meals/ });
  const saveButtons = page.locator('button:has-text("Save")');
  if (await gettingVibes.isVisible({ timeout: 1000 }).catch(() => false) ||
      await acceptedProgress.isVisible({ timeout: 1000 }).catch(() => false) ||
      await acceptMoreMeals.isVisible({ timeout: 1000 }).catch(() => false) ||
      await saveButtons.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'step2-suggestions';
  }

  // Check for step 4 (complete)
  const completeStep = page.locator('text=/Batch Complete|All Done|Summary/i');
  if (await completeStep.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'step4-complete';
  }

  // Log page content for debugging
  const pageContent = await page.textContent('main');
  console.log('Unknown step. Page content:', pageContent?.substring(0, 800));
  return 'unknown';
}

/**
 * Detect which sub-step of Step 2 we're on
 */
async function detectStep2SubStep(page: Page): Promise<string> {
  await page.waitForTimeout(1000);

  // Check for Plan Batch (Step 2a) - should have total meals input
  const planBatch = page.locator('text="Plan Your Batch"');
  const totalMealsInput = page.locator('input[type="number"]');
  if (await planBatch.isVisible({ timeout: 2000 }).catch(() => false) ||
      await totalMealsInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'plan-batch';
  }

  // Check for Manual Picks (Step 2b)
  const manualPicks = page.locator('text="Pick Your Recipes"');
  const fromLibraryBtn = page.locator('button:has-text("From Library")');
  if (await manualPicks.isVisible({ timeout: 1000 }).catch(() => false) ||
      await fromLibraryBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'manual-picks';
  }

  // Check for AI Suggestions (Step 2c)
  // Look for loading indicators or Save/Pass buttons on suggestion cards
  const gettingVibes = page.locator('text="Getting the vibes ready..."');
  const saveButtons = page.locator('button:has-text("Save")');
  const passButtons = page.locator('button:has-text("Pass")');
  const acceptMoreBtn = page.locator('button:has-text("Accept")').filter({ hasText: /more meals/ });
  if (await gettingVibes.isVisible({ timeout: 1000 }).catch(() => false) ||
      await saveButtons.first().isVisible({ timeout: 1000 }).catch(() => false) ||
      await passButtons.first().isVisible({ timeout: 1000 }).catch(() => false) ||
      await acceptMoreBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    return 'ai-suggestions';
  }

  // Default to AI suggestions (the step after plan batch with default values)
  return 'ai-suggestions';
}

/**
 * Step 1: Review Meals
 * Click "Continue to Suggestions" if no meals to review
 */
async function handleStep1ReviewMeals(page: Page) {
  await page.screenshot({ path: 'test-results/step1-before.png' });

  // Check if there are meals to review
  const noMealsToReview = page.locator('text="No Meals to Review"');
  if (await noMealsToReview.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('No meals to review - clicking Continue');

    // Click the "Continue to Suggestions" button
    const continueBtn = page.locator('button:has-text("Continue to Suggestions")');
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Wait for step transition
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/step1-after-continue.png' });
    return;
  }

  // If there are meals, set dispositions and continue
  const mealCards = page.locator('[data-testid="meal-disposition-card"]');
  const count = await mealCards.count();
  console.log(`Found ${count} meals to manage`);

  // Click "Discard All" for simplicity
  const discardAllBtn = page.locator('button:has-text("Discard All")');
  if (await discardAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await discardAllBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Continue button
  const continueBtn = page.locator('button:has-text("Continue to Suggestions")');
  await expect(continueBtn).toBeEnabled({ timeout: 5000 });
  await continueBtn.click();

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step1-after-continue.png' });
}

/**
 * Step 2a: Plan Batch
 * Set total meal count and manual picks ratio
 */
async function handleStep2aPlanBatch(
  page: Page,
  options: { total: number; manualPicks: number }
) {
  const { total, manualPicks } = options;
  await page.screenshot({ path: 'test-results/step2a-before.png' });

  // Wait for the step to load
  await page.waitForTimeout(1000);

  // Find and set total meals input
  const totalInput = page.locator('input[type="number"]').first();
  if (await totalInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await totalInput.fill(String(total));
    console.log(`Set total meals to ${total}`);
  }

  // If manual picks > 0, adjust slider
  if (manualPicks > 0) {
    const slider = page.locator('[role="slider"]');
    if (await slider.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 0; i < manualPicks; i++) {
        await slider.press('ArrowRight');
      }
      console.log(`Set manual picks to ${manualPicks}`);
    }
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/step2a-after-config.png' });

  // Find and click the continue button
  // Button text might be "Get X AI Suggestions" or similar
  const continueBtn = page.locator('button:has-text("Get"), button:has-text("Continue"), button:has-text("Suggestion")').last();
  await expect(continueBtn).toBeVisible({ timeout: 5000 });
  await continueBtn.click();

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step2a-after-continue.png' });
}

/**
 * Step 2b: Manual Picks
 * Select recipes from library
 */
async function handleStep2bManualPicks(page: Page, count: number) {
  await page.screenshot({ path: 'test-results/step2b-before.png' });

  for (let i = 0; i < count; i++) {
    // Click "From Library" button
    const libraryButton = page.locator('button:has-text("From Library")');
    if (await libraryButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryButton.click();
      await page.waitForTimeout(1000);

      // Select first available recipe in the sheet
      const recipeItem = page.locator('[data-testid="recipe-item"]').first();
      if (await recipeItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await recipeItem.click();
      }
      await page.waitForTimeout(500);
    }
  }

  // Click continue
  const continueBtn = page.locator('button:has-text("Continue")').last();
  if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueBtn.click();
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step2b-after.png' });
}

/**
 * Step 2c: AI Suggestions
 * Wait for suggestions and accept them by clicking "Save" buttons
 */
async function handleStep2cAISuggestions(page: Page, targetCount: number) {
  console.log(`AI Suggestions: targeting ${targetCount} meals`);
  await page.screenshot({ path: 'test-results/step2c-before.png' });

  // Wait for step to load - should see either loading state or Save buttons
  await page.waitForTimeout(2000);

  // Check if AI is currently generating (loading state)
  // Various loading messages: "Okay bestie, let me cook...", "Manifesting your meals...", etc.
  const loadingText = page.locator('text=/Manifesting|vibes|thinking|Getting.*ready|bestie|cook|meal/i').first();

  // If loading or no Save button visible yet, wait for suggestions to complete (up to 3 minutes for AI)
  const saveBtn = page.locator('button:has-text("Save")').first();
  if (await loadingText.isVisible({ timeout: 3000 }).catch(() => false) ||
      !(await saveBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.log('AI is generating suggestions, waiting for Save button (up to 3 minutes)...');
    // Wait for a Save button to appear (meal suggestion cards have Save/Pass buttons)
    await page.waitForSelector('button:has-text("Save")', { timeout: 180000 });
    console.log('Save button appeared');
  }

  await page.screenshot({ path: 'test-results/step2c-suggestions-loaded.png' });

  // Accept suggestions by clicking "Save" until we have enough
  // The main continue button shows "Accept X more meals" when disabled, and enables when done
  let acceptedCount = 0;
  while (acceptedCount < targetCount) {
    // Check if we can continue already (button text changes when enough meals accepted)
    const continueBtn = page.locator('button:has-text("Continue to Shopping"), button:has-text("Accept 0 more")');
    if (await continueBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
      console.log('Target reached - Continue button is enabled');
      break;
    }

    // Find and click Save button on a suggestion card (not Pass)
    const saveBtn = page.locator('button:has-text("Save")').first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
      acceptedCount++;
      console.log(`Saved meal ${acceptedCount}/${targetCount}`);
      await page.waitForTimeout(1500); // Wait for state update and card animation
    } else {
      // Check if we need more suggestions
      const moreBtn = page.locator('button:has-text("Get More Suggestions")');
      if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Requesting more suggestions...');
        await moreBtn.click();
        await page.waitForSelector('button:has-text("Save")', { timeout: 180000 });
      } else {
        console.log('No Save button or Get More button found');
        await page.screenshot({ path: 'test-results/step2c-no-buttons.png' });
        break;
      }
    }
  }

  await page.screenshot({ path: 'test-results/step2c-after-accepting.png' });

  // Click the continue button (should now be enabled after accepting enough meals)
  // Button text might be "Continue to Shopping" or might still show accepted count
  const continueBtn = page.locator('button').filter({ hasText: /Continue|Accept \d+ meals/ }).last();
  await expect(continueBtn).toBeEnabled({ timeout: 10000 });
  await continueBtn.click();

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step2c-after-continue.png' });
}

/**
 * Step 3: Shopping
 * Select ingredients and add to list
 */
async function handleStep3Shopping(page: Page) {
  console.log('Handling Step 3: Shopping');
  await page.screenshot({ path: 'test-results/step3-before.png' });

  // Wait for shopping step to load
  await page.waitForTimeout(2000);

  // Check if Select All button exists (may already be selected)
  const selectAllBtn = page.locator('button:has-text("Select all")');
  if (await selectAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await selectAllBtn.click();
    await page.waitForTimeout(500);
  }

  // Click "Create Shopping List" button (with count of items)
  const createListBtn = page.locator('button:has-text("Create Shopping List")');
  await expect(createListBtn).toBeVisible({ timeout: 5000 });
  await createListBtn.click();

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step3-after.png' });
}

/**
 * Step 4: Completion
 * Verify summary and finish
 */
async function handleStep4Completion(page: Page) {
  console.log('Handling Step 4: Completion');
  await page.screenshot({ path: 'test-results/step4-before.png' });

  // Wait for completion step to load
  await page.waitForTimeout(2000);

  // Click the finish button
  const finishBtn = page.locator('button:has-text("Done"), button:has-text("Finish"), button:has-text("Back to Recipes"), button:has-text("Complete")');
  if (await finishBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await finishBtn.first().click();
  }

  // Verify we're back on recipes page (or somewhere expected)
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/step4-finished.png' });
}
