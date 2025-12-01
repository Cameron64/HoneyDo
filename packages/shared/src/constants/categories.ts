// Shopping list categories with icons and store order
// Store order represents typical grocery store layout

export const SHOPPING_CATEGORIES = [
  { id: 'produce', name: 'Produce', icon: 'Apple', order: 1 },
  { id: 'bakery', name: 'Bakery', icon: 'Croissant', order: 2 },
  { id: 'deli', name: 'Deli', icon: 'Sandwich', order: 3 },
  { id: 'meat', name: 'Meat & Seafood', icon: 'Beef', order: 4 },
  { id: 'dairy', name: 'Dairy', icon: 'Milk', order: 5 },
  { id: 'frozen', name: 'Frozen', icon: 'Snowflake', order: 6 },
  { id: 'pantry', name: 'Pantry', icon: 'Package', order: 7 },
  { id: 'snacks', name: 'Snacks', icon: 'Cookie', order: 8 },
  { id: 'beverages', name: 'Beverages', icon: 'GlassWater', order: 9 },
  { id: 'household', name: 'Household', icon: 'Home', order: 10 },
  { id: 'personal', name: 'Personal Care', icon: 'Heart', order: 11 },
  { id: 'other', name: 'Other', icon: 'ShoppingBasket', order: 12 },
] as const;

export type ShoppingCategoryId = (typeof SHOPPING_CATEGORIES)[number]['id'];

export const CATEGORY_MAP = Object.fromEntries(
  SHOPPING_CATEGORIES.map((cat) => [cat.id, cat])
) as Record<ShoppingCategoryId, (typeof SHOPPING_CATEGORIES)[number]>;

export const DEFAULT_CATEGORY: ShoppingCategoryId = 'other';

// Common units for quantity
export const QUANTITY_UNITS = [
  'each',
  'lb',
  'oz',
  'kg',
  'g',
  'gallon',
  'quart',
  'liter',
  'ml',
  'dozen',
  'pack',
  'bag',
  'box',
  'can',
  'jar',
  'bottle',
  'bunch',
  'head',
  'loaf',
] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
