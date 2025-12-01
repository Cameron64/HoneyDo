import { QUANTITY_UNITS } from '@honeydo/shared';

interface ParsedItem {
  name: string;
  quantity?: number;
  unit?: string;
}

// Patterns for parsing item strings like "2 milk", "1 lb chicken", "3x bananas"
const QUANTITY_PATTERNS = [
  // "2 milk", "3 apples"
  /^(\d+(?:\.\d+)?)\s+(.+)$/,
  // "2x milk", "3x apples"
  /^(\d+(?:\.\d+)?)x\s*(.+)$/i,
  // "1 lb chicken", "2 oz cheese"
  /^(\d+(?:\.\d+)?)\s*([a-z]+)\s+(.+)$/i,
];

const UNIT_ALIASES: Record<string, string> = {
  pounds: 'lb',
  pound: 'lb',
  lbs: 'lb',
  ounces: 'oz',
  ounce: 'oz',
  kilograms: 'kg',
  kilogram: 'kg',
  grams: 'g',
  gram: 'g',
  liters: 'liter',
  litres: 'liter',
  litre: 'liter',
  gallons: 'gallon',
  quarts: 'quart',
  packs: 'pack',
  packages: 'pack',
  bags: 'bag',
  boxes: 'box',
  cans: 'can',
  jars: 'jar',
  bottles: 'bottle',
  bunches: 'bunch',
  heads: 'head',
  loaves: 'loaf',
  doz: 'dozen',
};

const validUnits = new Set([...QUANTITY_UNITS, ...Object.keys(UNIT_ALIASES)]);

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

function isValidUnit(unit: string): boolean {
  const normalized = normalizeUnit(unit);
  return validUnits.has(normalized) || validUnits.has(unit.toLowerCase());
}

export function parseItemInput(input: string): ParsedItem {
  const trimmed = input.trim();

  if (!trimmed) {
    return { name: '' };
  }

  // Try patterns with unit (e.g., "1 lb chicken")
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)\s+(.+)$/i);
  if (unitMatch) {
    const [, qtyStr, potentialUnit, name] = unitMatch;
    const quantity = parseFloat(qtyStr);

    if (isValidUnit(potentialUnit)) {
      return {
        name: name.trim(),
        quantity: isNaN(quantity) ? undefined : quantity,
        unit: normalizeUnit(potentialUnit),
      };
    }
  }

  // Try patterns without unit (e.g., "2 milk", "3x apples")
  for (const pattern of QUANTITY_PATTERNS.slice(0, 2)) {
    const match = trimmed.match(pattern);
    if (match) {
      const [, qtyStr, name] = match;
      const quantity = parseFloat(qtyStr);
      return {
        name: name.trim(),
        quantity: isNaN(quantity) ? undefined : quantity,
      };
    }
  }

  // No pattern matched, return as-is
  return { name: trimmed };
}

// Parse multiple lines (for bulk add)
export function parseMultipleItems(input: string): ParsedItem[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseItemInput);
}

// Format an item for display
export function formatItemDisplay(
  name: string,
  quantity?: number | null,
  unit?: string | null
): string {
  if (!quantity) return name;
  if (unit) return `${quantity} ${unit} ${name}`;
  return `${quantity} ${name}`;
}
