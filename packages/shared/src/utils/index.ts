/**
 * Shared Utilities
 *
 * Common utilities used across API and Web apps.
 * Focused on JSON parsing, date handling, and progress calculation.
 */

// ============================================
// JSON Parsing Utilities
// ============================================

/**
 * Result type for safe JSON parsing
 */
export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T>(text: string): JsonParseResult<T> {
  try {
    return { success: true, data: JSON.parse(text) as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parse error',
    };
  }
}

/**
 * Extract JSON from text that may contain markdown code fences or other content
 */
export function extractJsonFromText(text: string): string | null {
  // Strip markdown code fences
  const content = text.replace(/```json\s*/gi, '').replace(/```/g, '');

  // Find JSON object
  const jsonStart = content.indexOf('{');
  if (jsonStart === -1) {
    return null;
  }

  // Find matching closing brace using state machine
  let braceCount = 0;
  let jsonEnd = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = jsonStart; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) {
    return null;
  }

  return content.slice(jsonStart, jsonEnd + 1);
}

/**
 * Parse JSON from text that may contain markdown or other content
 */
export function parseJsonFromText<T>(text: string): JsonParseResult<T> {
  const jsonString = extractJsonFromText(text);
  if (!jsonString) {
    return { success: false, error: 'No JSON object found in text' };
  }
  return safeJsonParse<T>(jsonString);
}

// ============================================
// Date Utilities
// ============================================

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateYMD(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse YYYY-MM-DD string to Date (at midnight local time)
 */
export function parseDateYMD(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get date range for next N days starting from today
 */
export function getNextNDays(days: number): { start: string; end: string } {
  const today = new Date();
  const endDate = addDays(today, days - 1);
  return {
    start: formatDateYMD(today),
    end: formatDateYMD(endDate),
  };
}

/**
 * Check if a date string is valid YYYY-MM-DD format
 */
export function isValidDateYMD(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = parseDateYMD(dateStr);
  return !isNaN(date.getTime());
}

// ============================================
// Progress Calculation Utilities
// ============================================

/**
 * Linearly interpolate between two values
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================
// Error Extraction Utilities
// ============================================

/**
 * Common error patterns and friendly messages
 */
const ERROR_PATTERNS: [RegExp | string, string][] = [
  ['Credit balance is too low', 'Credit balance is too low. Please add credits to your Claude account.'],
  ['timed out', 'Request timed out. Please try again.'],
  ['ENOENT', 'Claude CLI not found. Please ensure Claude Code is installed.'],
  ['not found', 'Claude CLI not found. Please ensure Claude Code is installed.'],
  ['rate limit', 'Rate limit exceeded. Please wait a moment and try again.'],
];

/**
 * Extract a user-friendly error message from an error
 */
export function extractFriendlyError(errorMessage: string, defaultMessage = 'An error occurred. Please try again.'): string {
  // Try to extract JSON error
  const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.result && typeof parsed.result === 'string') {
        return parsed.result;
      }
      if (parsed.error && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Continue to pattern matching
    }
  }

  // Check for known error patterns
  for (const [pattern, message] of ERROR_PATTERNS) {
    if (typeof pattern === 'string') {
      if (errorMessage.includes(pattern)) return message;
    } else {
      if (pattern.test(errorMessage)) return message;
    }
  }

  return defaultMessage;
}

// ============================================
// String Utilities
// ============================================

/**
 * Normalize a string for comparison (lowercase, trim, remove extra spaces)
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Singularize a word (basic implementation)
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('es')) return lower.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
  return lower;
}

/**
 * Pluralize a word (basic implementation)
 */
export function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  const lower = word.toLowerCase();
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) {
    return word.slice(0, -1) + 'ies';
  }
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('ch') || lower.endsWith('sh')) {
    return word + 'es';
  }
  return word + 's';
}
