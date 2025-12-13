/**
 * Centralized error service for logging errors across the app.
 * All errors flow through here and are funneled to the debug store.
 *
 * Usage:
 *   import { errorService } from '@/services/error-service';
 *   errorService.log('recipes', 'wizard/step2', 'Failed to parse ingredients', { raw: data });
 */

import { useDebugStore, type AppModule } from '@/stores/debug';

/** Map tRPC error codes to user-friendly messages */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'You need to sign in to do that',
  FORBIDDEN: 'You don\'t have permission to do that',
  NOT_FOUND: 'The requested item was not found',
  BAD_REQUEST: 'Invalid request',
  TIMEOUT: 'Request timed out',
  TOO_MANY_REQUESTS: 'Too many requests, please try again later',
  INTERNAL_SERVER_ERROR: 'Something went wrong on our end',
  PARSE_ERROR: 'Invalid data received',
  CONFLICT: 'This conflicts with existing data',
};

/** Infer module from tRPC path (e.g., "recipes.wizard.start" -> "recipes") */
function inferModuleFromPath(path: string): AppModule {
  const firstPart = path.split('.')[0];
  if (firstPart === 'shopping') return 'shopping';
  if (firstPart === 'recipes') return 'recipes';
  if (firstPart === 'home') return 'home';
  return 'core';
}

/** Infer module from URL path */
function inferModuleFromUrl(url: string): AppModule {
  if (url.includes('/shopping')) return 'shopping';
  if (url.includes('/recipes')) return 'recipes';
  if (url.includes('/home')) return 'home';
  return 'core';
}

class ErrorService {
  private isDev = import.meta.env.DEV;
  private apiUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

  /**
   * Log an error to the debug store and persist to backend
   */
  log(module: AppModule, source: string, message: string, details?: unknown): void {
    // Always log to store
    useDebugStore.getState().addError(module, source, message, details);

    // Log to console in dev mode
    if (this.isDev) {
      console.error(`[${module}/${source}]`, message, details ?? '');
    }

    // Persist to backend (fire and forget)
    this.persistError(module, source, message, details);
  }

  /**
   * Send error to backend for persistence
   */
  private async persistError(module: AppModule, source: string, message: string, details?: unknown): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/errors/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          source,
          message,
          details,
          timestamp: new Date().toISOString(),
          url: window.location.href,
        }),
        credentials: 'include',
      });
    } catch {
      // Silently fail - don't cause more errors trying to log errors
    }
  }

  /**
   * Log a tRPC error with automatic module detection
   */
  logTrpcError(error: { message: string; data?: { code?: string; path?: string } }): void {
    const path = error.data?.path ?? 'unknown';
    const module = inferModuleFromPath(path);
    const code = error.data?.code;

    // Use friendly message if available
    const message = code && ERROR_CODE_MESSAGES[code]
      ? ERROR_CODE_MESSAGES[code]
      : error.message;

    this.log(module, `trpc:${path}`, message, {
      code,
      originalMessage: error.message,
    });
  }

  /**
   * Log a WebSocket error
   */
  logSocketError(event: string, error: unknown): void {
    const module = inferModuleFromUrl(event);
    const message = error instanceof Error ? error.message : String(error);
    this.log(module, `socket:${event}`, message, error);
  }

  /**
   * Log a React error boundary catch
   */
  logReactError(error: Error, errorInfo?: { componentStack?: string }): void {
    const module = inferModuleFromUrl(window.location.pathname);
    this.log(module, 'react:boundary', error.message, {
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  /**
   * Log an unhandled promise rejection
   */
  logUnhandledRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const module = inferModuleFromUrl(window.location.pathname);
    this.log(module, 'unhandled:promise', message, {
      stack: reason?.stack,
    });
  }

  /**
   * Log a global window error
   */
  logWindowError(event: ErrorEvent): void {
    const module = inferModuleFromUrl(window.location.pathname);
    this.log(module, `window:${event.filename ?? 'unknown'}`, event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  }

  /**
   * Get user-friendly message for an error code
   */
  getFriendlyMessage(code: string): string {
    return ERROR_CODE_MESSAGES[code] ?? 'Something went wrong';
  }

  /**
   * Initialize global error handlers
   * Call this once at app startup
   */
  initGlobalHandlers(): void {
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logUnhandledRejection(event);
    });

    // Global errors
    window.addEventListener('error', (event) => {
      this.logWindowError(event);
    });

    if (this.isDev) {
      console.log('[ErrorService] Global error handlers initialized');
    }
  }
}

// Singleton instance
export const errorService = new ErrorService();
