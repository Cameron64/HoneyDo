import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { SkillInput, SkillOutput, MealSuggestion } from '@honeydo/shared';
import { nanoid } from 'nanoid';
import { getClaudeSession } from './claude-session';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createMealsMcpServer,
  type SubmitSelectionsResult,
} from '@honeydo/mcp-meals';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nutrition data (per serving)
interface RecipeNutrition {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  saturatedFat?: number | null;
  cholesterol?: number | null;
  servingSize?: string | null;
}

// Full recipe type from history.json (with new metadata)
interface FullRecipe {
  id: string;
  name: string;
  source: string;
  sourceUrl: string | null;
  cuisine: string;
  diet: 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';
  proteinSources: string[];
  allergens: string[];
  macroProfile: 'protein-heavy' | 'carb-heavy' | 'balanced' | 'light';
  mealTypes: string[];
  seasonality: string[] | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  totalTimeMinutes: number;
  effort: number;
  defaultServings: number;
  servingsUnit: string;
  ingredients: Array<{
    name: string;
    amount: number | null;
    unit: string | null;
    category: string;
  }>;
  instructions: string[];
  tags: string[];
  rating: number | null;
  timesMade: number;
  lastMade: string | null;
  nutrition?: RecipeNutrition | null;
}

// Claude's simplified output format (just IDs)
interface ClaudeSelection {
  id: string;
  date: string;
  mealType: string;
}

interface ClaudeOutput {
  selections: ClaudeSelection[];
  reasoning: string;
}

export interface MealSuggestionsConfig {
  projectRoot: string;
  timeout: number; // ms (default: 180000 for 3 min)
}

export type ActivityCallback = (message: string, type: 'thinking' | 'querying' | 'results', progress: number) => void;

// Initialize MCP server singleton (lazy)
let mealsMcpServer: ReturnType<typeof createMealsMcpServer> | null = null;

function getMealsMcpServer() {
  if (!mealsMcpServer) {
    const monorepoRoot = path.resolve(__dirname, '../../../../');
    const historyPath = path.join(monorepoRoot, 'data/recipes/history.json');
    console.log('[MealSuggestions] Initializing MCP server with history:', historyPath);
    mealsMcpServer = createMealsMcpServer({ recipesHistoryPath: historyPath });
  }
  return mealsMcpServer;
}

export class MealSuggestionsService {
  private recipesById: Map<string, FullRecipe> = new Map();

  constructor(private config: MealSuggestionsConfig) {
    this.loadRecipeIndex();
  }

  /**
   * Load recipes into memory for quick ID lookup
   */
  private loadRecipeIndex(): void {
    const monorepoRoot = path.resolve(__dirname, '../../../../');
    const historyPath = path.join(monorepoRoot, 'data/recipes/history.json');

    if (!existsSync(historyPath)) {
      console.warn('[MealSuggestions] Recipe history not found at:', historyPath);
      return;
    }

    try {
      const content = readFileSync(historyPath, 'utf-8');
      const history = JSON.parse(content) as { recipes: FullRecipe[] };

      this.recipesById.clear();
      for (const recipe of history.recipes) {
        this.recipesById.set(recipe.id, recipe);
      }

      console.log('[MealSuggestions] Loaded', this.recipesById.size, 'recipes into index');
    } catch (error) {
      console.error('[MealSuggestions] Failed to load recipe index:', error);
    }
  }

  /**
   * Look up a recipe by ID
   */
  private getRecipeById(id: string): FullRecipe | undefined {
    return this.recipesById.get(id);
  }

  async getSuggestions(input: SkillInput, onActivity?: ActivityCallback): Promise<SkillOutput> {
    // Reload recipe index to pick up any changes
    this.loadRecipeIndex();

    // Check for mock mode (for development/testing without Claude credits)
    console.log('[MealSuggestions] MOCK_MEAL_SUGGESTIONS =', process.env.MOCK_MEAL_SUGGESTIONS);
    if (process.env.MOCK_MEAL_SUGGESTIONS === 'true') {
      console.log('[MealSuggestions] Mock mode enabled, returning mock suggestions');
      return this.getMockSuggestions(input);
    }

    // Load system prompt
    const systemPromptPath = path.join(__dirname, '../prompts/meal-suggestions.md');

    if (!existsSync(systemPromptPath)) {
      throw new Error(`System prompt not found at ${systemPromptPath}`);
    }

    const systemPrompt = readFileSync(systemPromptPath, 'utf-8');

    // Build the full prompt
    const userPrompt = this.buildPrompt(input);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // Write prompt to temp file
    const monorepoRoot = path.resolve(__dirname, '../../../../');
    const tempDir = path.join(os.tmpdir(), 'honeydo-prompts');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempPromptFile = path.join(tempDir, `prompt-${nanoid()}.txt`);
    writeFileSync(tempPromptFile, fullPrompt, 'utf-8');

    try {
      console.log('[MealSuggestions] Running Claude CLI from:', monorepoRoot);
      console.log('[MealSuggestions] Prompt file:', tempPromptFile);

      const stdout = await this.runClaudeCli(tempPromptFile, monorepoRoot, input.suggestionsCount, onActivity);

      console.log('[MealSuggestions] Claude CLI completed, parsing output...');
      return this.parseOutput(stdout);
    } catch (error) {
      const err = error as { status?: number; stderr?: string; message?: string };
      console.error('[MealSuggestions] Claude CLI error:', err.message);
      console.error('[MealSuggestions] Full error:', JSON.stringify(err, null, 2));

      const friendlyError = this.extractFriendlyError(err.message || '');
      throw new Error(friendlyError);
    } finally {
      try {
        unlinkSync(tempPromptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get suggestions using the persistent Claude session with MCP tools.
   * This is the recommended method - uses MCP for structured tool calls instead of JSON parsing.
   */
  async getSuggestionsWithSession(input: SkillInput, onActivity?: ActivityCallback): Promise<SkillOutput> {
    // Ensure MCP server has latest recipes
    getMealsMcpServer().reloadRecipes();

    // Check for mock mode
    if (process.env.MOCK_MEAL_SUGGESTIONS === 'true') {
      console.log('[MealSuggestions] Mock mode enabled, returning mock suggestions');
      return this.getMockSuggestions(input);
    }

    // Load system prompt
    const systemPromptPath = path.join(__dirname, '../prompts/meal-suggestions.md');
    if (!existsSync(systemPromptPath)) {
      throw new Error(`System prompt not found at ${systemPromptPath}`);
    }
    const systemPrompt = readFileSync(systemPromptPath, 'utf-8');

    // Build the user prompt
    const userPrompt = this.buildPrompt(input);

    // Emit initial thinking activity
    if (onActivity) {
      const thinkingMessages = [
        'Okay bestie, let me cook...',
        'Getting my chef hat on...',
        'Putting on my thinking cap...',
        'Manifesting delicious vibes...',
        'Time to work my magic...',
      ];
      onActivity(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)], 'thinking', 5);
    }

    // Progress tracking for activity callbacks
    let queryCount = 0;
    const expectedQueries = Math.max(2, Math.ceil(input.suggestionsCount / 4) + 1);

    const calculateProgress = (qCount: number): number => {
      const queryPhaseStart = 10;
      const queryPhaseEnd = 65;
      const queryPhaseRange = queryPhaseEnd - queryPhaseStart;
      const progress = queryPhaseStart + ((qCount + 1) / expectedQueries) * queryPhaseRange;
      return Math.min(Math.round(progress), queryPhaseEnd);
    };

    // Track the submit_selections tool result (using object wrapper for TS callback flow analysis)
    const capturedResult: { value: SubmitSelectionsResult | null } = { value: null };

    try {
      console.log('[MealSuggestions] Using MCP-enabled session...');

      const session = getClaudeSession();
      const { server } = getMealsMcpServer();

      // Add timeout wrapper (5 minutes)
      const timeoutMs = this.config.timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Session query timed out after ${Math.round(timeoutMs / 60000)} minutes`));
        }, timeoutMs);
      });

      const result = await Promise.race([
        session.runQuery({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        mcpServers: {
          'honeydo-meals': server,
        },
        allowedTools: [
          'mcp__honeydo-meals__query_recipes',
          'mcp__honeydo-meals__submit_selections',
        ],
        onMessage: (message: SDKMessage) => {
          // Handle streaming messages for activity updates
          if (message.type === 'assistant' && onActivity) {
            const assistantMsg = message as { message?: { content?: Array<{ type: string; name?: string }> } };
            if (assistantMsg.message?.content) {
              for (const block of assistantMsg.message.content) {
                if (block.type === 'tool_use') {
                  if (block.name === 'mcp__honeydo-meals__query_recipes') {
                    queryCount++;
                    const friendlyMsg = this.parseBashCommand(''); // Reuse random message pool
                    onActivity(friendlyMsg, 'querying', calculateProgress(queryCount));
                  } else if (block.name === 'mcp__honeydo-meals__submit_selections') {
                    onActivity('Locking in the final picks...', 'querying', 85);
                  }
                }
              }
            }
          }

          // Capture tool result from submit_selections
          // The SDK passes tool_use_result directly on user messages
          if (message.type === 'user') {
            const userMsg = message as Record<string, unknown>;

            // Check for direct tool_use_result property (SDK format)
            if (userMsg.tool_use_result) {
              console.log('[MealSuggestions] Found tool_use_result, type:', typeof userMsg.tool_use_result);
              try {
                let toolResult: SubmitSelectionsResult;

                if (typeof userMsg.tool_use_result === 'string') {
                  toolResult = JSON.parse(userMsg.tool_use_result) as SubmitSelectionsResult;
                } else if (Array.isArray(userMsg.tool_use_result)) {
                  // MCP returns an array of content blocks: [{ type: 'text', text: JSON }]
                  const textBlock = (userMsg.tool_use_result as Array<{ type: string; text?: string }>).find(b => b.type === 'text' && b.text);
                  if (textBlock?.text) {
                    toolResult = JSON.parse(textBlock.text) as SubmitSelectionsResult;
                    console.log('[MealSuggestions] Parsed from array text block');
                  } else {
                    console.log('[MealSuggestions] tool_use_result array has no text block');
                    return;
                  }
                } else if (typeof userMsg.tool_use_result === 'object') {
                  // Could be the MCP content wrapper or the result directly
                  const obj = userMsg.tool_use_result as Record<string, unknown>;
                  if (obj.type === 'text' && typeof obj.text === 'string') {
                    toolResult = JSON.parse(obj.text) as SubmitSelectionsResult;
                  } else if ('success' in obj && 'suggestions' in obj) {
                    toolResult = obj as unknown as SubmitSelectionsResult;
                  } else {
                    console.log('[MealSuggestions] Unknown tool_use_result object format:', JSON.stringify(obj).slice(0, 200));
                    return;
                  }
                } else {
                  return;
                }

                if (toolResult.success && toolResult.suggestions && Array.isArray(toolResult.suggestions)) {
                  capturedResult.value = toolResult;
                  console.log('[MealSuggestions] Captured submit_selections result:', toolResult.suggestions.length, 'meals');
                }
              } catch (e) {
                console.log('[MealSuggestions] Failed to parse tool_use_result:', (e as Error).message);
              }
            }
          }
        },
      }),
        timeoutPromise,
      ]);

      // Emit results activity
      if (onActivity) {
        const resultMessages = [
          'Serving up the goods!',
          'Chef\'s kiss! Here they come...',
          'Ding ding! Order up!',
          'Ta-da! Your meals await...',
        ];
        onActivity(resultMessages[Math.floor(Math.random() * resultMessages.length)], 'results', 95);
      }

      console.log('[MealSuggestions] MCP session completed in', result.duration_ms, 'ms');

      // Use tool result if available (preferred)
      if (capturedResult.value && capturedResult.value.success) {
        return {
          suggestions: capturedResult.value.suggestions as MealSuggestion[],
          reasoning: capturedResult.value.reasoning,
        };
      }

      // Fallback: try to parse tool result from messages
      const parsedFromMessages = this.parseToolResultFromMessages(result.messages);
      if (parsedFromMessages) {
        return parsedFromMessages;
      }

      // Last resort: try parsing text result (legacy compatibility)
      console.warn('[MealSuggestions] No MCP tool result found, falling back to text parsing');
      return this.parseSessionResult(result.result);
    } catch (error) {
      const err = error as Error;
      console.error('[MealSuggestions] MCP session error:', err.message);
      throw new Error(this.extractFriendlyError(err.message));
    }
  }

  /**
   * Parse submit_selections tool result from SDK messages
   */
  private parseToolResultFromMessages(messages: SDKMessage[]): SkillOutput | null {
    console.log('[MealSuggestions] Parsing', messages.length, 'messages for tool results');

    // Look for user messages with tool_use_result (SDK format)
    for (const msg of messages) {
      if (msg.type === 'user') {
        const userMsg = msg as Record<string, unknown>;

        // Check for direct tool_use_result property
        if (userMsg.tool_use_result) {
          try {
            let result: SubmitSelectionsResult;

            if (typeof userMsg.tool_use_result === 'string') {
              result = JSON.parse(userMsg.tool_use_result) as SubmitSelectionsResult;
            } else if (Array.isArray(userMsg.tool_use_result)) {
              // MCP returns an array of content blocks: [{ type: 'text', text: JSON }]
              const textBlock = (userMsg.tool_use_result as Array<{ type: string; text?: string }>).find(b => b.type === 'text' && b.text);
              if (textBlock?.text) {
                result = JSON.parse(textBlock.text) as SubmitSelectionsResult;
              } else {
                continue;
              }
            } else if (typeof userMsg.tool_use_result === 'object') {
              const obj = userMsg.tool_use_result as Record<string, unknown>;
              if (obj.type === 'text' && typeof obj.text === 'string') {
                result = JSON.parse(obj.text) as SubmitSelectionsResult;
              } else if ('success' in obj && 'suggestions' in obj) {
                result = obj as unknown as SubmitSelectionsResult;
              } else {
                continue;
              }
            } else {
              continue;
            }

            if (result.success && result.suggestions && Array.isArray(result.suggestions)) {
              console.log('[MealSuggestions] Parsed tool result from messages:', result.suggestions.length, 'suggestions');
              return {
                suggestions: result.suggestions as MealSuggestion[],
                reasoning: result.reasoning,
              };
            }
          } catch {
            // Not valid format, try next message
          }
        }
      }
    }
    return null;
  }

  /**
   * Parse result from session query (similar to parseOutput but for direct result string)
   */
  private parseSessionResult(resultText: string): SkillOutput {
    console.log('[MealSuggestions] Parsing session result length:', resultText.length);

    // Strip markdown code fences
    const content = resultText.replace(/```json\s*/gi, '').replace(/```/g, '');

    // Find JSON object
    const jsonStart = content.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON object found in Claude response');
    }

    // Find matching closing brace
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
      console.error('[MealSuggestions] JSON truncated. Content ends with:', content.slice(-200));
      throw new Error('JSON appears truncated');
    }

    const jsonString = content.slice(jsonStart, jsonEnd + 1);
    const claudeOutput: ClaudeOutput = JSON.parse(jsonString);
    console.log('[MealSuggestions] Parsed selections count:', claudeOutput.selections?.length);

    // Look up full recipes by ID
    const suggestions: MealSuggestion[] = [];
    const missingIds: string[] = [];

    for (const selection of claudeOutput.selections || []) {
      const recipe = this.getRecipeById(selection.id);

      if (!recipe) {
        console.warn('[MealSuggestions] Recipe not found for ID:', selection.id);
        missingIds.push(selection.id);
        continue;
      }

      suggestions.push({
        date: selection.date,
        mealType: selection.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
        recipe: {
          name: recipe.name,
          description: '',
          source: recipe.source,
          sourceUrl: recipe.sourceUrl ?? undefined,
          cuisine: recipe.cuisine,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
          effort: recipe.effort,
          defaultServings: recipe.defaultServings,
          servingsUnit: recipe.servingsUnit,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          nutrition: recipe.nutrition ?? null,
        },
      });
    }

    if (missingIds.length > 0) {
      console.warn('[MealSuggestions] Missing recipe IDs:', missingIds);
    }

    if (suggestions.length === 0) {
      throw new Error('No valid recipes found for the selected IDs');
    }

    return {
      suggestions,
      reasoning: claudeOutput.reasoning || 'Selections based on preferences and constraints.',
    };
  }

  private runClaudeCli(promptFile: string, cwd: string, suggestionsCount: number, onActivity?: ActivityCallback): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';

      // Track query count for progress estimation
      // Claude typically makes 1-2 queries per ~4 recipes, plus an initial stats query
      // So for 8 recipes, expect ~3-4 queries total
      let queryCount = 0;
      const expectedQueries = Math.max(2, Math.ceil(suggestionsCount / 4) + 1);

      // Emit initial thinking activity
      if (onActivity) {
        const thinkingMessages = [
          'Okay bestie, let me cook...',
          'Getting my chef hat on...',
          'Putting on my thinking cap...',
          'Manifesting delicious vibes...',
          'Time to work my magic...',
        ];
        onActivity(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)], 'thinking', 5);
      }

      // Give Claude access to Bash for running recipe-query
      // Use stream-json format to get real-time activity updates
      // Note: stream-json requires --verbose when using -p (print mode)
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--allowedTools', 'Bash',
      ];

      console.log('[MealSuggestions] Spawning: claude', args.join(' '));

      // Remove ANTHROPIC_API_KEY so Claude uses Max subscription
      const cleanEnv = { ...process.env };
      delete cleanEnv.ANTHROPIC_API_KEY;

      const proc = spawn('claude', args, {
        cwd,
        shell: isWindows ? 'cmd.exe' : '/bin/sh',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv,
      });

      // Write prompt to stdin
      const promptContent = readFileSync(promptFile, 'utf-8');
      proc.stdin.write(promptContent);
      proc.stdin.end();

      const stderrChunks: Buffer[] = [];
      let finalResult = '';
      let streamBuffer = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        console.log('[MealSuggestions] Raw chunk:', text.slice(0, 200));
        streamBuffer += text;

        // Process complete lines from buffer
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            // Debug: log event types
            console.log('[MealSuggestions] Stream event type:', event.type, 'keys:', Object.keys(event));
            this.processStreamEvent(event, onActivity, queryCount, expectedQueries, (result) => {
              finalResult = result;
            }, () => { queryCount++; });
          } catch {
            // Not JSON, ignore
            console.log('[MealSuggestions] Non-JSON line:', line.slice(0, 100));
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      const timeoutMinutes = Math.round(this.config.timeout / 60000);
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out after ${timeoutMinutes} minutes`));
      }, this.config.timeout);

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        // Process any remaining buffer
        if (streamBuffer.trim()) {
          try {
            const event = JSON.parse(streamBuffer);
            this.processStreamEvent(event, onActivity, queryCount, expectedQueries, (result) => {
              finalResult = result;
            }, () => { queryCount++; });
          } catch {
            // Not JSON, ignore
          }
        }

        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        if (stderr) {
          console.warn('[MealSuggestions] Claude CLI stderr:', stderr);
        }

        console.log('[MealSuggestions] Claude CLI exit code:', code);
        console.log('[MealSuggestions] Final result length:', finalResult.length, 'bytes');

        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr || finalResult.slice(0, 500)}`));
          return;
        }

        // Wrap the result in the expected format for parseOutput
        resolve(JSON.stringify({ result: finalResult }));
      });
    });
  }

  private processStreamEvent(
    event: Record<string, unknown>,
    onActivity?: ActivityCallback,
    queryCount?: number,
    expectedQueries?: number,
    onResult?: (result: string) => void,
    onQueryIncrement?: () => void
  ): void {
    const type = event.type as string;

    // Calculate progress based on query count and expected queries
    // Progress phases: thinking (5%), queries (10-65%), finalizing (70-95%)
    // Leave more headroom at the end since Claude takes time to format the response
    const calculateProgress = (qCount: number, expected: number): number => {
      // Query phase spans from 10% to 65% (55% range)
      // This leaves 30% for the finalizing phase which can take a while
      const queryPhaseStart = 10;
      const queryPhaseEnd = 65;
      const queryPhaseRange = queryPhaseEnd - queryPhaseStart;

      // Each query represents a portion of the query phase
      // Add 1 to qCount since we're calculating progress AFTER the query starts
      const progress = queryPhaseStart + ((qCount + 1) / expected) * queryPhaseRange;
      return Math.min(Math.round(progress), queryPhaseEnd);
    };

    switch (type) {
      case 'assistant':
        // Claude is thinking/responding - extract Bash tool use for activity messages
        if (event.message && typeof event.message === 'object') {
          const message = event.message as Record<string, unknown>;
          if (message.content && Array.isArray(message.content)) {
            let hasBashToolUse = false;
            for (const block of message.content) {
              if (block && typeof block === 'object') {
                const b = block as Record<string, unknown>;
                console.log('[MealSuggestions] Content block:', b.type, b.name);
                if (b.type === 'tool_use' && b.name === 'Bash') {
                  hasBashToolUse = true;
                  // Extract bash command for activity
                  const input = b.input as Record<string, unknown> | undefined;
                  console.log('[MealSuggestions] Bash input:', JSON.stringify(input).slice(0, 200));
                  if (input?.command && typeof input.command === 'string') {
                    const cmd = input.command;
                    // Parse command to create friendly message
                    const friendlyMsg = this.parseBashCommand(cmd);
                    const progress = calculateProgress(queryCount ?? 0, expectedQueries ?? 3);
                    console.log('[MealSuggestions] Emitting activity:', friendlyMsg, 'progress:', progress, 'query:', (queryCount ?? 0) + 1, 'of', expectedQueries);
                    if (onActivity) {
                      onActivity(friendlyMsg, 'querying', progress);
                    }
                    if (onQueryIncrement) {
                      onQueryIncrement();
                    }
                  }
                }
              }
            }
            // If this assistant message has no bash tool use and we've done some queries,
            // Claude is likely finalizing the response
            if (!hasBashToolUse && (queryCount ?? 0) > 0 && onActivity) {
              const finalizingMessages = [
                'Almost there, picking the winners...',
                'Narrowing it down to the cutest...',
                'Final picks loading...',
                'Curating your perfect menu...',
                'The vibe check is almost done...',
                'Selecting the main characters...',
                'Just a few more decisions...',
              ];
              const msg = finalizingMessages[Math.floor(Math.random() * finalizingMessages.length)];
              // Progress jumps to 75% during finalization
              onActivity(msg, 'querying', 75);
            }
          }
        }
        break;

      case 'content_block_start':
        // Tool use starts here in streaming format (fallback)
        if (event.content_block && typeof event.content_block === 'object') {
          const block = event.content_block as Record<string, unknown>;
          if (block.type === 'tool_use' && block.name === 'Bash') {
            const progress = calculateProgress(queryCount ?? 0, expectedQueries ?? 3);
            if (onActivity) {
              onActivity('Flipping through pages...', 'querying', progress);
            }
          }
        }
        break;

      case 'result':
        // Final result
        if (event.result && typeof event.result === 'string') {
          if (onResult) {
            onResult(event.result);
          }
          if (onActivity) {
            const resultMessages = [
              'Serving up the goods!',
              'Chef\'s kiss! Here they come...',
              'Ding ding! Order up!',
              'Ta-da! Your meals await...',
              'Slay! Your menu is ready...',
              'Period! That\'s your week sorted...',
              'The girlies are ready to serve...',
              'Yaaas! Dinner is planned...',
            ];
            onActivity(resultMessages[Math.floor(Math.random() * resultMessages.length)], 'results', 95);
          }
        }
        break;
    }
  }

  // Track used message indices to avoid repetition within a session
  private usedMessageIndices: Set<number> = new Set();

  private parseBashCommand(_cmd: string): string {
    // Massive pool of girly-pop phrases - way more variety!
    const allMessages = [
      // Browsing vibes
      'Ooh let me see what we got...',
      'Scrolling through the yummies...',
      'Window shopping for dinner...',
      'Peeking at the menu options...',
      'Browsing the recipe aisle...',

      // Excited discovery
      'Oh this one looks cute!',
      'Ooh I\'m seeing potential...',
      'Wait this could be THE one...',
      'Okay okay I see you recipes...',
      'Yesss options are looking good...',

      // Girly energy
      'Main character dinner search...',
      'Serving looks AND flavor...',
      'It\'s giving... dinner party...',
      'Slay the meal prep today...',
      'Chef\'s kiss energy only...',

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
      'Let\'s try something new...',
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
    ];

    // Reset used indices when we've used most of them
    if (this.usedMessageIndices.size > allMessages.length * 0.7) {
      this.usedMessageIndices.clear();
    }

    // Find an unused message
    let attempts = 0;
    let index = Math.floor(Math.random() * allMessages.length);
    while (this.usedMessageIndices.has(index) && attempts < 20) {
      index = Math.floor(Math.random() * allMessages.length);
      attempts++;
    }

    this.usedMessageIndices.add(index);
    return allMessages[index];
  }

  private buildPrompt(input: SkillInput): string {
    // Build allergen-free filter if restrictions exist
    const alwaysRestrictions = input.preferences.dietaryRestrictions
      ?.filter(r => r.scope === 'always')
      .map(r => r.name.toLowerCase().replace('-free', '').replace(' (parvalbumin)', ''))
      .join(',') || '';

    // Build recent meals list
    const recentMeals = input.recentMeals.length > 0
      ? input.recentMeals.map(m => m.recipeName).join(', ')
      : 'none';

    // Build cuisine preferences string (cuisinePreferences is a Record<string, {maxPerWeek, preference}>)
    const cuisineConstraints = input.preferences.cuisinePreferences
      ? Object.entries(input.preferences.cuisinePreferences)
          .filter(([, pref]) => pref.maxPerWeek !== undefined)
          .map(([cuisine, pref]) => `${cuisine}: max ${pref.maxPerWeek}/week`)
          .join(', ')
      : '';

    return `
## Request

Select ${input.suggestionsCount} meals for ${input.dateRange.start} to ${input.dateRange.end}.
Meal types: ${input.mealTypes.join(', ')}
Season: ${input.context.season}

## Constraints

Recent meals (avoid): ${recentMeals}
${alwaysRestrictions ? `Allergen-free (required): ${alwaysRestrictions}` : ''}
${cuisineConstraints ? `Cuisine limits: ${cuisineConstraints}` : ''}
${(() => {
  const disliked = input.ingredientPreferences.filter(p => p.preference === 'dislike' || p.preference === 'never').map(p => p.ingredient);
  return disliked.length > 0 ? `Disliked ingredients: ${disliked.join(', ')}` : '';
})()}
${input.notes.length > 0 ? `Rules: ${input.notes.map(n => n.content).join('; ')}` : ''}
`.trim();
  }

  private extractFriendlyError(errorMessage: string): string {
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
        // Continue
      }
    }

    if (errorMessage.includes('Credit balance is too low')) {
      return 'Credit balance is too low. Please add credits to your Claude account.';
    }
    if (errorMessage.includes('timed out')) {
      return 'Request timed out. Please try again.';
    }
    if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      return 'Claude CLI not found. Please ensure Claude Code is installed.';
    }
    if (errorMessage.includes('rate limit')) {
      return 'Rate limit exceeded. Please wait a moment and try again.';
    }

    return 'Failed to generate suggestions. Please try again later.';
  }

  private parseOutput(stdout: string): SkillOutput {
    console.log('[MealSuggestions] Raw stdout length:', stdout.length);

    try {
      const response = JSON.parse(stdout);

      // Extract text content from Claude's response
      let content: string;
      if (response.result) {
        content = response.result;
      } else if (response.content) {
        content = typeof response.content === 'string'
          ? response.content
          : response.content[0]?.text || '';
      } else {
        content = stdout;
      }

      console.log('[MealSuggestions] Extracted content length:', content.length);
      console.log('[MealSuggestions] Content preview:', content.slice(0, 500));

      // Strip markdown code fences
      content = content.replace(/```json\s*/gi, '').replace(/```/g, '');

      // Find JSON object
      const jsonStart = content.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('No JSON object found in Claude response');
      }

      // Find matching closing brace
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
        console.error('[MealSuggestions] JSON truncated. Content ends with:', content.slice(-200));
        throw new Error('JSON appears truncated');
      }

      const jsonString = content.slice(jsonStart, jsonEnd + 1);
      console.log('[MealSuggestions] Extracted JSON length:', jsonString.length);

      const claudeOutput: ClaudeOutput = JSON.parse(jsonString);
      console.log('[MealSuggestions] Parsed selections count:', claudeOutput.selections?.length);

      // Look up full recipes by ID
      const suggestions: MealSuggestion[] = [];
      const missingIds: string[] = [];

      for (const selection of claudeOutput.selections || []) {
        const recipe = this.getRecipeById(selection.id);

        if (!recipe) {
          console.warn('[MealSuggestions] Recipe not found for ID:', selection.id);
          missingIds.push(selection.id);
          continue;
        }

        suggestions.push({
          date: selection.date,
          mealType: selection.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          recipe: {
            name: recipe.name,
            description: '', // Not stored in history
            source: recipe.source,
            sourceUrl: recipe.sourceUrl ?? undefined,
            cuisine: recipe.cuisine,
            prepTimeMinutes: recipe.prepTimeMinutes,
            cookTimeMinutes: recipe.cookTimeMinutes,
            totalTimeMinutes: recipe.totalTimeMinutes,
            effort: recipe.effort,
            defaultServings: recipe.defaultServings,
            servingsUnit: recipe.servingsUnit,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            tags: recipe.tags,
            nutrition: recipe.nutrition ?? null,
          },
        });
      }

      if (missingIds.length > 0) {
        console.warn('[MealSuggestions] Missing recipe IDs:', missingIds);
      }

      if (suggestions.length === 0) {
        throw new Error('No valid recipes found for the selected IDs');
      }

      return {
        suggestions,
        reasoning: claudeOutput.reasoning || 'Selections based on preferences and constraints.',
      };
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      console.error('[MealSuggestions] Parse error:', errorMsg);

      if (errorMsg.includes('truncated')) {
        throw new Error('Claude output was truncated. Try requesting fewer days.');
      }

      throw new Error(`Failed to parse Claude output: ${errorMsg}`);
    }
  }

  /**
   * Mock suggestions for testing
   */
  private getMockSuggestions(input: SkillInput): SkillOutput {
    // Get some real recipes from the index
    const recipes = Array.from(this.recipesById.values()).slice(0, 8);
    const startDate = new Date(input.dateRange.start);
    const suggestions: MealSuggestion[] = [];

    for (let i = 0; i < input.suggestionsCount && i < recipes.length; i++) {
      const recipe = recipes[i];
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      suggestions.push({
        date: date.toISOString().split('T')[0],
        mealType: input.mealTypes[0] || 'dinner',
        recipe: {
          name: recipe.name,
          description: '',
          source: recipe.source,
          sourceUrl: recipe.sourceUrl ?? undefined,
          cuisine: recipe.cuisine,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
          effort: recipe.effort,
          defaultServings: recipe.defaultServings,
          servingsUnit: recipe.servingsUnit,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          nutrition: recipe.nutrition ?? null,
        },
      });
    }

    return {
      suggestions,
      reasoning: 'Mock suggestions for testing.',
    };
  }
}

// Helper to determine current season
export function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

// Singleton instance
export const mealSuggestionsService = new MealSuggestionsService({
  projectRoot: process.env.PROJECT_ROOT || process.cwd(),
  timeout: 300000, // 5 minutes - Claude needs time for multi-turn recipe research
});
