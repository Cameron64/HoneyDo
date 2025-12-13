import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { WizardLayout } from '@/components/layout/WizardLayout';
import { HomePage } from '@/pages/Home';
import { SettingsPage } from '@/pages/Settings';
import { SignInPage } from '@/pages/SignIn';
import { SignUpPage } from '@/pages/SignUp';
import { NotFoundPage } from '@/pages/NotFound';
import { ShoppingPlaceholder } from '@/pages/modules/ShoppingPlaceholder';
import { HomeAutomationPage } from '@/modules/home';
import {
  RecipesPage,
  PreferencesPage,
  MealPlanPage,
  BatchManagementPage,
  ShoppingGenerationPage,
  NewBatchWizard,
  BatchHistoryPage,
  RecipeLibraryPage,
} from '@/modules/recipes';

// Root route with basic layout for auth pages
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Auth layout (no sidebar, just header)
const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth-layout',
  component: () => (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  ),
});

// Sign in route (with wildcard for Clerk SSO callbacks like /sign-in/sso-callback)
const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-in/$',
  component: SignInPage,
});

// Sign up route (with wildcard for Clerk SSO callbacks like /sign-up/sso-callback)
const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/sign-up/$',
  component: SignUpPage,
});

// App layout with sidebar and nav
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app-layout',
  component: AppShell,
});

// Wizard layout (full-screen, no scrolling container)
const wizardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'wizard-layout',
  component: WizardLayout,
});

// Index/Home route
const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: HomePage,
});

// Settings route
const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
});

// Shopping route
const shoppingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/shopping',
  component: ShoppingPlaceholder,
});

// Recipes routes
const recipesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes',
  component: RecipesPage,
});

const recipesPreferencesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/preferences',
  component: PreferencesPage,
});

const recipesPlanRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/plan',
  component: MealPlanPage,
});

const recipesBatchRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/batch',
  component: BatchManagementPage,
});

const recipesShopRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/shop',
  component: ShoppingGenerationPage,
});

const recipesHistoryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/history',
  component: BatchHistoryPage,
});

const recipesLibraryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/recipes/library',
  component: RecipeLibraryPage,
});

const recipesWizardRoute = createRoute({
  getParentRoute: () => wizardLayoutRoute,
  path: '/recipes/wizard',
  component: NewBatchWizard,
});

// Home automation route
const homeAutomationRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/home-automation',
  component: HomeAutomationPage,
});

// 404 route
const notFoundRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '*',
  component: NotFoundPage,
});

// Create route tree
const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([signInRoute, signUpRoute]),
  wizardLayoutRoute.addChildren([recipesWizardRoute]),
  appLayoutRoute.addChildren([
    indexRoute,
    settingsRoute,
    shoppingRoute,
    recipesRoute,
    recipesPreferencesRoute,
    recipesPlanRoute,
    recipesBatchRoute,
    recipesShopRoute,
    recipesHistoryRoute,
    recipesLibraryRoute,
    homeAutomationRoute,
    notFoundRoute,
  ]),
]);

// Create router
export const router = createRouter({ routeTree });

// Type declaration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
