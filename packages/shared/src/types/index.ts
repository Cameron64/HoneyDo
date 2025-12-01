// Shared TypeScript types

export type Theme = 'light' | 'dark' | 'system';

export type UserRole = 'admin' | 'member' | 'guest';

// Re-export shopping types from schemas (single source of truth)
export type {
  ShoppingList,
  CreateShoppingListInput,
  UpdateShoppingListInput,
  ShoppingItem,
  CreateShoppingItemInput,
  UpdateShoppingItemInput,
  CheckShoppingItemInput,
  BulkAddItemsInput,
  ReorderItemsInput,
  ClearCheckedItemsInput,
  ExpandItemInput,
  ExpandItemResponse,
  CategorizeItemInput,
  CategorizeItemResponse,
  SuggestItemsInput,
  SuggestItemsResponse,
  BatchCategorizeInput,
  BatchCategorizeResponse,
  FrequentItem,
  SyncStatus,
  SyncLog,
} from '../schemas/shopping';

// Re-export home automation types from schemas (single source of truth)
export type {
  HADomain,
  HAEntity,
  HAConfig,
  HAConfigStatus,
  ConfigureHAInput,
  TestConnectionResponse,
  SceneAction,
  HAScene,
  CreateSceneInput,
  UpdateSceneInput,
  HAFavorite,
  AddFavoriteInput,
  UpdateFavoriteInput,
  ReorderFavoritesInput,
  ServiceCallInput,
  ToggleEntityInput,
  HAActionLog,
  AICommandInput,
  AICommandResponse,
  StateChangedEvent,
  HAEntityWithFavorite,
} from '../schemas/home-automation';

// Re-export recipes types from schemas (single source of truth)
export type {
  MealType,
  NoteType,
  IngredientPreferenceLevel,
  CuisinePreferenceLevel,
  SuggestionStatus,
  CuisinePreference,
  CuisinePreferences,
  MealPreferences,
  UpdateMealPreferencesInput,
  IngredientPreference,
  SetIngredientPreferenceInput,
  MealPreferenceNote,
  AddNoteInput,
  UpdateNoteInput,
  RecipeIngredient,
  RecipeData,
  MealSuggestionItem,
  MealSuggestions,
  RequestSuggestionsInput,
  AcceptMealInput,
  RejectMealInput,
  SetServingsInput,
  AcceptedMeal,
  DateRange,
  SuggestionSchedule,
  SetScheduleInput,
  AggregatedIngredient,
  AddIngredientsToListInput,
  SkillInput,
  SkillOutput,
  ExportedPreferences,
  // Wizard types
  MealDisposition,
  MealDispositionRecord,
  WizardSession,
  Batch,
  SetMealDispositionsInput,
} from '../schemas/recipes';

// NOTE: Home automation constants (CONTROLLABLE_DOMAINS, READONLY_DOMAINS, SENSITIVE_DOMAINS)
// are exported directly from schemas/home-automation.ts to avoid ESM circular dependency issues.
// Import them from '@honeydo/shared' which re-exports from schemas/index.ts.

// Shopping list with items (for queries that include items)
import type { ShoppingList, ShoppingItem } from '../schemas/shopping';

export interface ShoppingListWithItems extends ShoppingList {
  items: ShoppingItem[];
}

export interface NotificationPreferences {
  enabled: boolean;
  push: boolean;
  sound: boolean;
}

export interface UserPreferences {
  theme: Theme;
  accentColor?: string;
  notifications: NotificationPreferences;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  preferences: UserPreferences | null;
  createdAt: string;
  updatedAt: string;
}

export interface Module {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface UserModule {
  userId: string;
  moduleId: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

// Import home automation types for events
import type { StateChangedEvent, HAScene } from '../schemas/home-automation';

// Import recipes types for events
import type { MealType } from '../schemas/recipes';

// Socket event types
export interface ServerToClientEvents {
  pong: (data: { timestamp: number }) => void;
  'whoami:response': (data: { userId: string; rooms: string[] }) => void;
  'system:settings:updated': (data: { preferences: UserPreferences }) => void;
  'system:notification': (data: NotificationEvent) => void;

  // Shopping list events
  'shopping:list:created': (data: ShoppingList) => void;
  'shopping:list:updated': (data: ShoppingList) => void;
  'shopping:list:archived': (data: { id: string }) => void;

  // Shopping item events
  'shopping:item:added': (data: ShoppingItem) => void;
  'shopping:items:added': (data: ShoppingItem[]) => void;
  'shopping:item:updated': (data: ShoppingItem) => void;
  'shopping:item:removed': (data: { id: string; listId: string }) => void;
  'shopping:item:checked': (data: { id: string; listId: string; checked: boolean; checkedBy: string | null; checkedAt: string | null }) => void;
  'shopping:items:cleared': (data: { listId: string; itemIds: string[] }) => void;
  'shopping:items:reordered': (data: { listId: string; itemIds: string[] }) => void;

  // Shopping sync events
  'shopping:sync:started': (data: { listId: string }) => void;
  'shopping:sync:completed': (data: { listId: string; itemsSynced: number }) => void;
  'shopping:sync:error': (data: { listId: string; error: string }) => void;

  // Home Automation events
  'home:connection:status': (data: { connected: boolean; error?: string }) => void;
  'home:entity:state-changed': (data: StateChangedEvent) => void;
  'home:scene:activated': (data: { sceneId: string; activatedBy: string }) => void;
  'home:action:executed': (data: { entityId: string; service: string; status: 'success' | 'error'; error?: string }) => void;
  'home:scene:created': (data: HAScene) => void;
  'home:scene:updated': (data: HAScene) => void;
  'home:scene:deleted': (data: { id: string }) => void;

  // Recipes events
  'recipes:suggestions:received': (data: { suggestionId: string }) => void;
  'recipes:suggestions:error': (data: { suggestionId: string; error: string }) => void;
  'recipes:suggestions:updated': (data: {
    suggestionId: string;
    replacementAvailable?: boolean;
    remainingHidden?: number;
    needsMoreSuggestions?: boolean;
  }) => void;
  'recipes:suggestions:more-received': (data: { suggestionId: string; newCount: number; totalHidden: number }) => void;
  'recipes:suggestions:more-error': (data: { suggestionId: string; error: string }) => void;
  'recipes:meal:accepted': (data: { mealId: string; date: string; mealType: MealType }) => void;
  'recipes:meal:removed': (data: { date: string; mealType: MealType }) => void;
  'recipes:meal:completed': (data: { mealId: string; date: string; mealType: MealType; completed: boolean }) => void;
  'recipes:shopping:generated': (data: { listId: string; itemCount: number }) => void;

  // Recipes wizard events
  'recipes:wizard:step-completed': (data: { step: number; nextStep: number }) => void;
  'recipes:wizard:finished': (data: { batchId: string | null; listId: string | null }) => void;
  'recipes:batch:created': (data: { batchId: string; name: string | null; dateRange?: { start: string; end: string } }) => void;
  'recipes:batch:archived': (data: { batchId: string; stats?: { completedCount: number; rolloverCount: number; discardedCount: number } }) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  whoami: () => void;
}

export interface NotificationEvent {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}
