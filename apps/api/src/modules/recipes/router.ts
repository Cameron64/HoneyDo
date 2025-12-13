import { router } from '../../trpc';
import { preferencesRouter } from './preferences.router';
import { suggestionsRouter } from './suggestions.router';
import { mealsRouter } from './meals.router';
import { shoppingRouter } from './shopping.router';
import { scheduleRouter } from './schedule.router';
import { wizardRouter } from './wizard';
import { historyRouter } from './history.router';
import { scrapeRouter } from './scrape.router';

/**
 * Recipes Module Router
 *
 * This module handles AI-powered meal planning with the following sub-routers:
 *
 * - preferences: User preferences (cuisines, dietary restrictions, time constraints)
 * - suggestions: AI meal suggestion requests and review workflow
 * - meals: Accepted meals management (calendar view)
 * - shopping: Recipe-to-shopping-list ingredient integration
 * - schedule: Automatic weekly suggestion scheduling
 *
 * Usage examples:
 *   trpc.recipes.preferences.get.useQuery()
 *   trpc.recipes.suggestions.request.useMutation()
 *   trpc.recipes.meals.getRange.useQuery({ start, end })
 *   trpc.recipes.shopping.getIngredients.useQuery({ start, end })
 *   trpc.recipes.schedule.set.useMutation()
 *   trpc.recipes.wizard.start.useMutation()
 */
export const recipesRouter = router({
  preferences: preferencesRouter,
  suggestions: suggestionsRouter,
  meals: mealsRouter,
  shopping: shoppingRouter,
  schedule: scheduleRouter,
  wizard: wizardRouter,
  history: historyRouter,
  scrape: scrapeRouter,
});
