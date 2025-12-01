import { router } from './index';
import { userRouter } from '../modules/user/router';
import { settingsRouter } from '../modules/settings/router';
import { shoppingRouter } from '../modules/shopping';
import { homeRouter } from '../modules/home';
import { recipesRouter } from '../modules/recipes';

export const appRouter = router({
  user: userRouter,
  settings: settingsRouter,
  shopping: shoppingRouter,
  home: homeRouter,
  recipes: recipesRouter,
});

export type AppRouter = typeof appRouter;
