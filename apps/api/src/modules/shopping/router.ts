import { router } from '../../trpc';
import { listsRouter } from './lists.router';
import { itemsRouter } from './items.router';
import { aiRouter } from './ai.router';

export const shoppingRouter = router({
  lists: listsRouter,
  items: itemsRouter,
  ai: aiRouter,
});

export type ShoppingRouter = typeof shoppingRouter;
