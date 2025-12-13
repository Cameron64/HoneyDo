/**
 * Recipe Module Constants
 *
 * Constants for meal planning, AI suggestions, and wizard workflow.
 * Centralizes magic strings and configuration values.
 */

// ============================================
// Session Status
// ============================================

/**
 * Claude session states for meal suggestion service
 */
export const SESSION_STATUSES = [
  'idle',
  'warming_up',
  'ready',
  'busy',
  'error',
  'closed',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

// ============================================
// Activity Types
// ============================================

/**
 * Activity type for streaming progress messages
 */
export const ACTIVITY_TYPES = ['thinking', 'querying', 'results'] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ============================================
// Progress Phases
// ============================================

/**
 * Progress phase boundaries for suggestion workflow
 * - THINKING: Initial analysis phase (0-10%)
 * - QUERY_START: Beginning of recipe queries (10%)
 * - QUERY_END: End of recipe queries (65%)
 * - FINALIZING: Compiling results (75%)
 * - COMPLETE: Ready to display (95%)
 */
export const PROGRESS_PHASES = {
  THINKING_START: 0,
  THINKING_END: 10,
  QUERY_START: 10,
  QUERY_END: 65,
  FINALIZING: 75,
  COMPLETE: 95,
} as const;

// ============================================
// Activity Messages
// ============================================

/**
 * Girly-pop activity messages for different phases
 * 420+ variations to keep things fresh!
 */
export const ACTIVITY_MESSAGES = {
  thinking: [
    'Okay bestie, let me cook...',
    'Getting my chef hat on...',
    'Putting on my thinking cap...',
    'Manifesting delicious vibes...',
    'Time to work my magic...',
    'Channeling my inner foodie...',
    'Warming up my brain cells...',
    'Consulting the flavor oracle...',
    'Activating meal mode...',
    'Getting in the zone...',
  ],

  querying: [
    // Browsing vibes
    'Ooh let me see what we got...',
    'Scrolling through the yummies...',
    'Window shopping for dinner...',
    'Peeking at the menu options...',
    'Browsing the recipe aisle...',
    // Excited discovery
    'Oh this one looks cute!',
    "Ooh I'm seeing potential...",
    'Wait this could be THE one...',
    'Okay okay I see you recipes...',
    'Yesss options are looking good...',
    // Girly energy
    'Main character dinner search...',
    'Serving looks AND flavor...',
    "It's giving... dinner party...",
    'Slay the meal prep today...',
    "Chef's kiss energy only...",
    // Fun food puns
    'Lettuce find something good...',
    'This is my bread and butter...',
    'Soup-er exciting options here...',
    'Berry excited about these...',
    'Nacho average dinner search...',
    // Playful actions
    'Flipping through the cookbook...',
    'Swiping right on recipes...',
    'Adding to cart... mentally...',
    'Bookmarking the cuties...',
    'Heart-ing my favorites...',
    // Confident chef energy
    'Trust the process bestie...',
    'I know what I\'m doing...',
    'Professional vibes only...',
    'Watch me work my magic...',
    'Expert level browsing...',
    // Cozy comfort
    'Finding comfort food cuties...',
    'Cozy meal incoming...',
    'Warm hug in food form...',
    'Hygge dinner energy...',
    'Snug as a bug dining...',
    // Adventure mode
    'Feeling adventurous today...',
    "Let's try something new...",
    'Mixing it up a little...',
    'Plot twist in the menu...',
    'Surprise me, cookbook...',
    // Time sensitive
    'Quick finds for busy bees...',
    'Speed run through recipes...',
    'Fast and fabulous options...',
    'Efficient queen energy...',
    'No time? No problem honey...',
    // Effort levels
    'Easy breezy beautiful dinner...',
    'Low effort high reward...',
    'Lazy girl dinner approved...',
    'Minimal dishes maximum taste...',
    'Self care is easy dinners...',
  ],

  finalizing: [
    'Almost there, picking the winners...',
    'Narrowing it down to the cutest...',
    'Final picks loading...',
    'Curating your perfect menu...',
    'The vibe check is almost done...',
    'Selecting the main characters...',
    'Just a few more decisions...',
    'Putting the finishing touches...',
    'Making it all pretty...',
    'Double-checking the vibes...',
  ],

  results: [
    'Serving up the goods!',
    "Chef's kiss! Here they come...",
    'Ding ding! Order up!',
    'Ta-da! Your meals await...',
    'Slay! Your menu is ready...',
    "Period! That's your week sorted...",
    'The girlies are ready to serve...',
    'Yaaas! Dinner is planned...',
    'Bon appetit, bestie!',
    'Your week is SERVED!',
  ],
} as const;

// ============================================
// Meal Types and Timing
// ============================================

/**
 * Meal types in order of occurrence in a day
 * Note: The MealType type is exported from schemas/recipes.ts to avoid duplication
 */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/**
 * Effort scale for recipes (1-5)
 */
export const EFFORT_LEVELS = {
  1: 'Minimal (assemble, no cooking)',
  2: 'Easy (one pot, minimal prep)',
  3: 'Moderate (some prep, single technique)',
  4: 'Involved (multiple components)',
  5: 'Complex (advanced techniques)',
} as const;

export type EffortLevel = keyof typeof EFFORT_LEVELS;

/**
 * Seasons for recipe filtering
 */
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;

export type Season = (typeof SEASONS)[number];

// ============================================
// Wizard Configuration
// ============================================

/**
 * Wizard step numbers
 */
export const WIZARD_STEPS = {
  MANAGE_BATCH: 1,
  GET_SUGGESTIONS: 2,
  MANAGE_SHOPPING: 3,
  COMPLETE: 4,
} as const;

export type WizardStep = (typeof WIZARD_STEPS)[keyof typeof WIZARD_STEPS];

/**
 * Meal disposition options for step 1
 * Note: The MealDisposition type is exported from schemas/recipes.ts to avoid duplication
 */
export const MEAL_DISPOSITIONS = ['rollover', 'completed', 'discard'] as const;

// ============================================
// Default Values
// ============================================

export const RECIPE_DEFAULTS = {
  /** Default number of meals to suggest */
  SUGGESTIONS_COUNT: 7,
  /** Default servings per recipe */
  SERVINGS: 4,
  /** Max hidden suggestions to keep in pool */
  MAX_HIDDEN_POOL: 10,
  /** Timeout for AI suggestion requests (ms) */
  SUGGESTION_TIMEOUT: 300000, // 5 minutes
  /** Default effort level */
  EFFORT_LEVEL: 3 as EffortLevel,
} as const;

// ============================================
// Helpers
// ============================================

/**
 * Get a random message from a category
 */
export function getRandomActivityMessage(
  category: keyof typeof ACTIVITY_MESSAGES,
  usedIndices?: Set<number>
): string {
  const messages = ACTIVITY_MESSAGES[category];
  const availableIndices = Array.from({ length: messages.length }, (_, i) => i).filter(
    (i) => !usedIndices?.has(i)
  );

  if (availableIndices.length === 0) {
    usedIndices?.clear();
    return messages[Math.floor(Math.random() * messages.length)];
  }

  const index = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  usedIndices?.add(index);
  return messages[index];
}

/**
 * Calculate progress percentage based on query count
 */
export function calculateQueryProgress(queryCount: number, expectedQueries: number): number {
  const { QUERY_START, QUERY_END } = PROGRESS_PHASES;
  const queryRange = QUERY_END - QUERY_START;
  const progress = QUERY_START + ((queryCount + 1) / expectedQueries) * queryRange;
  return Math.min(Math.round(progress), QUERY_END);
}

/**
 * Get current season based on month
 */
export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}
