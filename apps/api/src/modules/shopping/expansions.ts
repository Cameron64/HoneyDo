import type { ShoppingCategoryId } from '@honeydo/shared';

/**
 * Represents an item that can be expanded from a vague shopping request.
 */
export interface ExpansionItem {
  name: string;
  quantity?: number;
  unit?: string;
  category: ShoppingCategoryId;
}

/**
 * Predefined expansions for common vague shopping items.
 * Maps a normalized item name to an array of specific ingredients.
 */
export const ITEM_EXPANSIONS: Record<string, ExpansionItem[]> = {
  'taco stuff': [
    { name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' },
    { name: 'Taco seasoning', quantity: 1, unit: 'pack', category: 'pantry' },
    { name: 'Tortillas', quantity: 1, unit: 'pack', category: 'bakery' },
    { name: 'Shredded cheese', quantity: 1, unit: 'bag', category: 'dairy' },
    { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
    { name: 'Tomatoes', quantity: 2, category: 'produce' },
    { name: 'Sour cream', quantity: 1, category: 'dairy' },
  ],
  tacos: [
    { name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' },
    { name: 'Taco seasoning', quantity: 1, unit: 'pack', category: 'pantry' },
    { name: 'Tortillas', quantity: 1, unit: 'pack', category: 'bakery' },
    { name: 'Shredded cheese', quantity: 1, unit: 'bag', category: 'dairy' },
    { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
    { name: 'Tomatoes', quantity: 2, category: 'produce' },
    { name: 'Sour cream', quantity: 1, category: 'dairy' },
  ],
  breakfast: [
    { name: 'Eggs', quantity: 1, unit: 'dozen', category: 'dairy' },
    { name: 'Bacon', quantity: 1, unit: 'pack', category: 'meat' },
    { name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' },
    { name: 'Butter', quantity: 1, category: 'dairy' },
    { name: 'Orange juice', quantity: 1, unit: 'gallon', category: 'beverages' },
  ],
  'sandwich stuff': [
    { name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' },
    { name: 'Deli turkey', quantity: 0.5, unit: 'lb', category: 'deli' },
    { name: 'Deli ham', quantity: 0.5, unit: 'lb', category: 'deli' },
    { name: 'Cheese slices', quantity: 1, unit: 'pack', category: 'dairy' },
    { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
    { name: 'Tomatoes', quantity: 2, category: 'produce' },
    { name: 'Mayo', quantity: 1, unit: 'jar', category: 'pantry' },
  ],
  salad: [
    { name: 'Mixed greens', quantity: 1, unit: 'bag', category: 'produce' },
    { name: 'Tomatoes', quantity: 2, category: 'produce' },
    { name: 'Cucumber', quantity: 1, category: 'produce' },
    { name: 'Shredded carrots', quantity: 1, unit: 'bag', category: 'produce' },
    { name: 'Salad dressing', quantity: 1, unit: 'bottle', category: 'pantry' },
  ],
  'pasta dinner': [
    { name: 'Pasta', quantity: 1, unit: 'box', category: 'pantry' },
    { name: 'Pasta sauce', quantity: 1, unit: 'jar', category: 'pantry' },
    { name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' },
    { name: 'Parmesan cheese', quantity: 1, category: 'dairy' },
    { name: 'Garlic bread', quantity: 1, category: 'frozen' },
  ],
  'pizza night': [
    { name: 'Pizza dough', quantity: 1, category: 'bakery' },
    { name: 'Pizza sauce', quantity: 1, unit: 'jar', category: 'pantry' },
    { name: 'Mozzarella cheese', quantity: 1, unit: 'bag', category: 'dairy' },
    { name: 'Pepperoni', quantity: 1, unit: 'pack', category: 'deli' },
  ],
};

/**
 * List of patterns that can be expanded.
 * Used for quick lookup to determine if an item is expandable.
 */
export const EXPANDABLE_PATTERNS = Object.keys(ITEM_EXPANSIONS);
