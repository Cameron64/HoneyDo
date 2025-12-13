/**
 * Persistent Claude Session Service
 *
 * This service maintains a Claude Code session that can be resumed across
 * multiple requests, reducing startup time by reusing session context.
 *
 * Architecture:
 * - Uses @anthropic-ai/claude-agent-sdk `query()` with `resume` option
 * - Queue-based request handling (one request at a time)
 * - Session ID stored and reused across requests
 * - Automatic session recovery on errors
 */

import {
  query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
  type Options,
} from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

// Type for MCP server instances (from createSdkMcpServer)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpServer = any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type SessionStatus = 'idle' | 'warming_up' | 'ready' | 'busy' | 'error' | 'closed';

export interface ClaudeSessionConfig {
  model?: string;
  cwd?: string;
  warmupPrompt?: string;
  allowedTools?: string[];
  /** MCP servers available for all queries (config-level) */
  mcpServers?: Record<string, McpServer>;
}

export interface QueryRequest {
  prompt: string;
  onMessage?: (message: SDKMessage) => void;
  systemPrompt?: string;
  /** MCP servers for this specific query (merged with config-level) */
  mcpServers?: Record<string, McpServer>;
  /** Override allowed tools for this query */
  allowedTools?: string[];
}

export interface QueryResult {
  result: string;
  messages: SDKMessage[];
  duration_ms: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

type QueueItem = {
  request: QueryRequest;
  resolve: (result: QueryResult) => void;
  reject: (error: Error) => void;
};

/**
 * Helper to wrap a string prompt as an async generator
 * Required when using MCP servers
 */
async function* wrapPromptAsGenerator(prompt: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  } as SDKUserMessage;
}

export class ClaudeSessionService extends EventEmitter {
  private sessionId: string | null = null;
  private status: SessionStatus = 'idle';
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private config: Required<Omit<ClaudeSessionConfig, 'allowedTools' | 'mcpServers'>> & {
    allowedTools?: string[];
    mcpServers?: Record<string, McpServer>;
  };
  private lastError: Error | null = null;
  private sessionStartTime: number = 0;
  private queryCount: number = 0;

  constructor(config: ClaudeSessionConfig = {}) {
    super();
    const monorepoRoot = path.resolve(__dirname, '../../../../');

    this.config = {
      model: config.model || 'claude-sonnet-4-20250514',
      cwd: config.cwd || monorepoRoot,
      warmupPrompt: config.warmupPrompt || 'You are ready for meal planning tasks. Respond with just "Ready".',
      allowedTools: config.allowedTools,
      mcpServers: config.mcpServers,
    };
  }

  /**
   * Get current session status
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Get session uptime in milliseconds (0 if not ready)
   */
  getUptime(): number {
    if (this.status !== 'ready' && this.status !== 'busy') {
      return 0;
    }
    return Date.now() - this.sessionStartTime;
  }

  /**
   * Get query count for this session
   */
  getQueryCount(): number {
    return this.queryCount;
  }

  /**
   * Get current session ID (null if no session)
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get last error if any
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Initialize and warm up the session
   * Call this on API startup to eliminate cold start on first request
   */
  async warmup(): Promise<void> {
    if (this.status === 'ready' || this.status === 'busy') {
      console.log('[ClaudeSession] Session already ready, skipping warmup');
      return;
    }

    if (this.status === 'warming_up') {
      console.log('[ClaudeSession] Warmup already in progress');
      return;
    }

    this.status = 'warming_up';
    this.emit('status', this.status);
    console.log('[ClaudeSession] Starting session warmup...');

    const warmupStart = Date.now();

    try {
      // Remove ANTHROPIC_API_KEY so Claude uses Max subscription
      const cleanEnv = { ...process.env };
      delete cleanEnv.ANTHROPIC_API_KEY;

      const options: Options = {
        model: this.config.model,
        cwd: this.config.cwd,
        env: cleanEnv,
        maxTurns: 1, // Single turn for warmup
        permissionMode: 'bypassPermissions', // Skip all permission prompts for headless automation
      };

      if (this.config.allowedTools) {
        options.allowedTools = this.config.allowedTools;
      }

      console.log('[ClaudeSession] Creating warmup query...');

      const q = query({
        prompt: this.config.warmupPrompt,
        options,
      });

      // Process warmup response and capture session ID
      for await (const message of q) {
        if (message.type === 'system' && message.subtype === 'init') {
          this.sessionId = message.session_id;
          console.log('[ClaudeSession] Session ID captured:', this.sessionId);
        }

        if (message.type === 'result') {
          const elapsed = Date.now() - warmupStart;
          console.log(`[ClaudeSession] Warmup complete in ${elapsed}ms`);
          break;
        }
      }

      this.status = 'ready';
      this.sessionStartTime = Date.now();
      this.queryCount = 0;
      this.emit('status', this.status);
      console.log('[ClaudeSession] Session ready for requests');
    } catch (error) {
      this.lastError = error as Error;
      this.status = 'error';
      this.emit('status', this.status);
      console.error('[ClaudeSession] Warmup failed:', error);
      throw error;
    }
  }

  /**
   * Send a query using the persistent session
   * Returns a promise that resolves with the result
   */
  async runQuery(request: QueryRequest): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the next item in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    // Ensure session is ready
    if (this.status !== 'ready') {
      if (this.status === 'idle' || this.status === 'error') {
        try {
          await this.warmup();
        } catch (error) {
          // Reject all queued items
          while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            item.reject(new Error('Failed to initialize Claude session'));
          }
          return;
        }
      } else if (this.status === 'warming_up') {
        // Wait for warmup to complete - will be called again when ready
        return;
      }
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;
    const { request, resolve, reject } = item;

    this.status = 'busy';
    this.emit('status', this.status);

    const startTime = Date.now();
    const messages: SDKMessage[] = [];

    try {
      console.log('[ClaudeSession] Processing query...');
      console.log('[ClaudeSession] Using session ID:', this.sessionId);

      // Remove ANTHROPIC_API_KEY so Claude uses Max subscription
      const cleanEnv = { ...process.env };
      delete cleanEnv.ANTHROPIC_API_KEY;

      const options: Options = {
        model: this.config.model,
        cwd: this.config.cwd,
        env: cleanEnv,
        permissionMode: 'bypassPermissions', // Skip all permission prompts for headless automation
        includePartialMessages: true, // For streaming activity
      };

      // Resume from previous session if available
      if (this.sessionId) {
        options.resume = this.sessionId;
      }

      // Merge allowed tools (request overrides config)
      const allowedTools = request.allowedTools || this.config.allowedTools;
      if (allowedTools) {
        options.allowedTools = allowedTools;
      }

      // Merge MCP servers (request extends config)
      const mcpServers = {
        ...this.config.mcpServers,
        ...request.mcpServers,
      };
      const hasMcpServers = Object.keys(mcpServers).length > 0;
      if (hasMcpServers) {
        options.mcpServers = mcpServers;
        console.log('[ClaudeSession] Using MCP servers:', Object.keys(mcpServers));
      }

      // Add system prompt if provided
      if (request.systemPrompt) {
        options.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: request.systemPrompt,
        };
      }

      // When using MCP servers, prompt must be an async generator
      const promptInput = hasMcpServers
        ? wrapPromptAsGenerator(request.prompt)
        : request.prompt;

      const q = query({
        prompt: promptInput,
        options,
      });

      // Collect all messages
      for await (const message of q) {
        messages.push(message);

        // Update session ID if we get a new one
        if (message.type === 'system' && message.subtype === 'init') {
          const sysMsg = message as SDKSystemMessage;
          this.sessionId = sysMsg.session_id;
        }

        // Call message callback if provided (for streaming activity)
        if (request.onMessage) {
          request.onMessage(message);
        }

        // Check if this is the final result
        if (message.type === 'result') {
          const resultMessage = message as SDKResultMessage;
          const duration = Date.now() - startTime;

          console.log(`[ClaudeSession] Query completed in ${duration}ms`);
          this.queryCount++;

          if (resultMessage.subtype === 'success') {
            resolve({
              result: resultMessage.result,
              messages,
              duration_ms: duration,
              usage: {
                inputTokens: resultMessage.usage.input_tokens,
                outputTokens: resultMessage.usage.output_tokens,
              },
            });
          } else {
            // Error result - include error details
            const errResult = resultMessage as SDKResultMessage & { errors?: string[] };
            reject(new Error(`Query failed: ${resultMessage.subtype}${errResult.errors ? ` - ${errResult.errors.join(', ')}` : ''}`));
          }
          break;
        }
      }
    } catch (error) {
      console.error('[ClaudeSession] Query error:', error);
      reject(error as Error);

      // Mark session as needing recovery
      this.lastError = error as Error;
      // Don't change status yet - let next request try fresh
    } finally {
      this.isProcessing = false;

      if (this.status === 'busy') {
        this.status = 'ready';
        this.emit('status', this.status);
      }

      // Process next item in queue
      this.processQueue();
    }
  }

  /**
   * Clear the session to start fresh
   */
  async clearSession(): Promise<void> {
    console.log('[ClaudeSession] Clearing session...');
    this.sessionId = null;
    this.queryCount = 0;
    this.status = 'idle';
    this.emit('status', this.status);
  }

  /**
   * Check if session is healthy
   */
  isHealthy(): boolean {
    return this.status === 'ready' || this.status === 'busy';
  }
}

// Singleton instance
let instance: ClaudeSessionService | null = null;

export function getClaudeSession(config?: ClaudeSessionConfig): ClaudeSessionService {
  if (!instance) {
    instance = new ClaudeSessionService(config);
  }
  return instance;
}

export function resetClaudeSession(): void {
  if (instance) {
    instance.clearSession();
    instance = null;
  }
}
