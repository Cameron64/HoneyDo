import 'dotenv/config';
import { db } from './index';
import { modules } from './schema';

async function seed() {
  console.log('Seeding database...');

  // Seed default modules
  await db
    .insert(modules)
    .values([
      {
        id: 'shopping-list',
        name: 'Shopping List',
        description: 'Shared shopping lists with Google Keep sync',
        icon: 'ShoppingCart',
        enabled: true,
        sortOrder: 1,
      },
      {
        id: 'home-automation',
        name: 'Home Automation',
        description: 'Control your smart home via Home Assistant',
        icon: 'Home',
        enabled: true,
        sortOrder: 2,
      },
      {
        id: 'recipes',
        name: 'Recipes',
        description: 'Recipe book and meal planning',
        icon: 'ChefHat',
        enabled: true,
        sortOrder: 3,
      },
    ])
    .onConflictDoNothing();

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
