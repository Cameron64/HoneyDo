/**
 * Date Utilities
 *
 * Centralized date formatting functions used throughout the app.
 * All functions expect date strings in YYYY-MM-DD format.
 */

/**
 * Parse a date string to a Date object, handling timezone issues.
 * Adding 'T00:00:00' ensures the date is parsed in local timezone.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Get today's date at midnight (for comparisons)
 */
function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Format a date for display with relative labels (Today, Tomorrow)
 * and weekday + date for other days.
 *
 * Examples:
 * - "Today"
 * - "Tomorrow"
 * - "Mon, Jan 15"
 */
export function formatMealDate(dateStr: string): string {
  const date = parseDate(dateStr);
  const today = getToday();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with full weekday name for section headers.
 * Returns relative labels for today/tomorrow.
 *
 * Examples:
 * - "Today"
 * - "Tomorrow"
 * - "Monday"
 * - "Tuesday"
 */
export function formatDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  const today = getToday();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return 'Today';
  }
  if (date.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Format a date as short month and day.
 *
 * Example: "Jan 15"
 */
export function formatDateShort(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with full weekday, month, and day.
 *
 * Example: "Monday, Jan 15"
 */
export function formatDateFull(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date range as "Jan 15 - Jan 21"
 */
export function formatDateRange(start: string, end: string): string {
  const startDate = parseDate(start);
  const endDate = parseDate(end);

  const startStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endStr = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${startStr} - ${endStr}`;
}

/**
 * Format a date for history/last made display.
 *
 * Example: "Jan 15, 2024"
 */
export function formatHistoryDate(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get a week label from a start date.
 *
 * Example: "Week of Jan 15"
 */
export function formatWeekLabel(startDateStr: string): string {
  const startDate = parseDate(startDateStr);
  return `Week of ${startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

/**
 * Format meal type label with proper capitalization.
 */
export function formatMealTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Format a date as relative time (e.g., "today", "yesterday", "3 days ago").
 * Accepts ISO datetime strings (with time component).
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
