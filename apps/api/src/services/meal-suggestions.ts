import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SkillInput, SkillOutput } from '@honeydo/shared';
import { skillOutputSchema } from '@honeydo/shared';
import { nanoid } from 'nanoid';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MealSuggestionsConfig {
  projectRoot: string;
  timeout: number; // ms (default: 180000 for 3 min)
}

export class MealSuggestionsService {
  constructor(private config: MealSuggestionsConfig) {}

  async getSuggestions(input: SkillInput): Promise<SkillOutput> {
    // Check for mock mode (for development/testing without Claude credits)
    if (process.env.MOCK_MEAL_SUGGESTIONS === 'true') {
      console.log('[MealSuggestions] Mock mode enabled, returning mock suggestions');
      return this.getMockSuggestions(input);
    }

    // Load the system prompt - path relative to this file's location
    const promptPath = path.join(__dirname, '../prompts/meal-suggestions.md');

    if (!existsSync(promptPath)) {
      throw new Error(`System prompt not found at ${promptPath}`);
    }

    const systemPrompt = readFileSync(promptPath, 'utf-8');

    // Build the full prompt with input data
    const userPrompt = this.buildPrompt(input);

    // Combine system prompt and user prompt into a single prompt
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // Write prompt to a temp file to avoid command line length limits
    // Use monorepo root for data folder
    const monorepoRoot = path.resolve(__dirname, '../../../../');
    const tempDir = path.join(monorepoRoot, 'data', 'temp');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempPromptFile = path.join(tempDir, `prompt-${nanoid()}.txt`);
    writeFileSync(tempPromptFile, fullPrompt, 'utf-8');

    try {
      console.log('[MealSuggestions] Running Claude CLI from:', monorepoRoot);
      console.log('[MealSuggestions] Prompt file:', tempPromptFile);

      // Use spawn instead of exec to better handle large outputs
      // Run from monorepo root so Claude can access data/recipes/history.json
      const stdout = await this.runClaudeCli(tempPromptFile, monorepoRoot);

      console.log('[MealSuggestions] Claude CLI completed, parsing output...');
      return this.parseOutput(stdout);
    } catch (error) {
      const err = error as { status?: number; stderr?: string; message?: string };
      console.error('[MealSuggestions] Claude CLI error:', err.message);

      // Try to extract a user-friendly error message
      const friendlyError = this.extractFriendlyError(err.message || '');
      throw new Error(friendlyError);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempPromptFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private runClaudeCli(promptFile: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';

      // Build command args - using type command on Windows to pipe file content
      const args = [
        '-p',
        '--output-format', 'json',
        '--allowedTools', 'Read',
        '--max-turns', '3',
      ];

      console.log('[MealSuggestions] Spawning: claude', args.join(' '));

      const proc = spawn('claude', args, {
        cwd,
        shell: isWindows ? 'cmd.exe' : '/bin/sh',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Write prompt to stdin
      const promptContent = readFileSync(promptFile, 'utf-8');
      proc.stdin.write(promptContent);
      proc.stdin.end();

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('Claude CLI timed out after 3 minutes'));
      }, this.config.timeout);

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        if (stderr) {
          console.warn('[MealSuggestions] Claude CLI stderr:', stderr);
        }

        console.log('[MealSuggestions] Claude CLI exit code:', code);
        console.log('[MealSuggestions] stdout size:', stdout.length, 'bytes');

        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout.slice(0, 500)}`));
          return;
        }

        resolve(stdout);
      });
    });
  }

  private buildPrompt(input: SkillInput): string {
    return `
Please suggest meals for the following request.

## Number of Suggestions to Generate
${input.suggestionsCount}

## Date Range
${input.dateRange.start} to ${input.dateRange.end}

## Meal Types to Plan
${input.mealTypes.join(', ')}

## Default Servings
${input.servings}

## Recent Meals (avoid these)
${JSON.stringify(input.recentMeals, null, 2)}

## Preferences
${JSON.stringify(input.preferences, null, 2)}

## Ingredient Preferences
${JSON.stringify(input.ingredientPreferences, null, 2)}

## Freeform Notes/Rules
${input.notes.map((n) => `[${n.type}] ${n.content}`).join('\n')}

## Context
- Season: ${input.context.season}
- Current Date: ${input.context.currentDate}

First, read the recipe history from data/recipes/history.json to see available recipes.
Then return ONLY the JSON object - start your response with { and end with }. Do not include any text before or after the JSON. Put your explanation in the "reasoning" field inside the JSON.
`.trim();
  }

  /**
   * Extract a user-friendly error message from Claude CLI output
   */
  private extractFriendlyError(errorMessage: string): string {
    // Try to parse JSON from the error message
    const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        // Claude CLI returns "result" field with the error message
        if (parsed.result && typeof parsed.result === 'string') {
          return parsed.result;
        }
        if (parsed.error && typeof parsed.error === 'string') {
          return parsed.error;
        }
      } catch {
        // JSON parsing failed, continue to other checks
      }
    }

    // Check for common error patterns
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

    // Default fallback - don't expose raw technical errors
    return 'Failed to generate suggestions. Please try again later.';
  }

  private parseOutput(stdout: string): SkillOutput {
    // With --output-format json, Claude returns a JSON object
    // The actual content is in the result field
    console.log('[MealSuggestions] Raw stdout length:', stdout.length);

    try {
      const response = JSON.parse(stdout);

      // Extract the text content from Claude's response
      let content: string;
      if (response.result) {
        content = response.result;
      } else if (response.content) {
        content =
          typeof response.content === 'string'
            ? response.content
            : response.content[0]?.text || '';
      } else {
        content = stdout;
      }

      console.log('[MealSuggestions] Extracted content length:', content.length);
      console.log('[MealSuggestions] Content preview:', content.slice(0, 300));

      // Strip markdown code fences if present
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      // Also handle fences in the middle of the content
      content = content.replace(/```json\s*/gi, '').replace(/```/g, '');

      // Find the start of JSON object
      const jsonStart = content.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('No JSON object found in Claude response');
      }

      // Find matching closing brace using bracket counting
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
        // JSON appears truncated - log diagnostic info
        console.error('[MealSuggestions] JSON appears truncated. Content ends with:', content.slice(-200));
        throw new Error('JSON appears truncated - no matching closing brace found');
      }

      const jsonString = content.slice(jsonStart, jsonEnd + 1);
      console.log('[MealSuggestions] Extracted JSON length:', jsonString.length);

      const parsed = JSON.parse(jsonString);
      console.log('[MealSuggestions] Parsed JSON, suggestions count:', parsed.suggestions?.length);

      // Fill in missing optional fields with defaults
      if (parsed.suggestions) {
        parsed.suggestions = parsed.suggestions.map((s: Record<string, unknown>) => ({
          ...s,
          recipe: {
            ...((s.recipe as Record<string, unknown>) || {}),
            description: (s.recipe as Record<string, unknown>)?.description || '',
            ingredients: (s.recipe as Record<string, unknown>)?.ingredients || [],
            instructions: (s.recipe as Record<string, unknown>)?.instructions || [],
          },
        }));
      }

      // Validate against schema
      const result = skillOutputSchema.safeParse(parsed);
      if (!result.success) {
        console.error('[MealSuggestions] Schema validation failed:', result.error.issues);
        throw new Error(`Invalid response format: ${JSON.stringify(result.error.issues)}`);
      }

      return result.data;
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      console.error('[MealSuggestions] Parse error:', errorMsg);

      // If the error indicates truncation, provide more helpful message
      if (errorMsg.includes('truncated') || errorMsg.includes('matching closing brace')) {
        throw new Error(
          'Claude output was truncated - the response was too long. Try requesting fewer days or simpler recipes.'
        );
      }

      // If JSON parsing fails, try to find JSON in raw stdout
      const jsonMatch = stdout.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const result = skillOutputSchema.safeParse(parsed);
          if (result.success) {
            return result.data;
          }
        } catch {
          // Continue to throw
        }
      }
      throw new Error(`Failed to parse Claude output: ${stdout.slice(0, 500)}`);
    }
  }

  /**
   * Generate mock suggestions for testing without Claude credits
   * These mock recipes come from the actual history.json file
   */
  private getMockSuggestions(input: SkillInput): SkillOutput {
    const mockRecipes = [
      {
        name: 'Potato Curry',
        description: 'A hearty vegetarian curry with potatoes.',
        source: 'Connoisseurus Veg',
        sourceUrl: 'https://www.connoisseurusveg.com/potato-curry/#recipe',
        cuisine: 'Indian',
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        totalTimeMinutes: 45,
        effort: 2,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['vegetarian', 'curry', 'weeknight'],
      },
      {
        name: 'Chicken Stir Fry',
        description: 'Quick and easy chicken stir fry.',
        source: 'Mom On Timeout',
        sourceUrl: 'https://www.momontimeout.com/easy-chicken-stir-fry-recipe/#recipe',
        cuisine: 'Asian',
        prepTimeMinutes: 15,
        cookTimeMinutes: 15,
        totalTimeMinutes: 30,
        effort: 2,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['stir-fry', 'quick', 'weeknight', 'chicken'],
      },
      {
        name: 'Cuban Chicken',
        description: 'Cuban-style chicken with black beans and rice.',
        source: 'Our Balanced Bowl',
        sourceUrl: 'https://ourbalancedbowl.com/cuban-chicken-and-black-bean-rice-bowls/',
        cuisine: 'Cuban',
        prepTimeMinutes: 15,
        cookTimeMinutes: 25,
        totalTimeMinutes: 40,
        effort: 2,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['bowl', 'chicken', 'black-beans', 'weeknight'],
      },
      {
        name: 'Greek Orzo Skillet',
        description: 'Mediterranean-style one-pan orzo dish.',
        source: 'Real Food Dietitians',
        sourceUrl: 'https://therealfooddietitians.com/greek-orzo-skillet/#tasty-recipes-57657',
        cuisine: 'Mediterranean',
        prepTimeMinutes: 15,
        cookTimeMinutes: 25,
        totalTimeMinutes: 40,
        effort: 2,
        defaultServings: 6,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['orzo', 'one-pan', 'mediterranean'],
      },
      {
        name: 'White Chicken Chili',
        description: 'Creamy slow-cooker white chicken chili.',
        source: 'Real Food Dietitians',
        sourceUrl: 'https://therealfooddietitians.com/slow-cooker-white-chicken-chili/#tasty-recipes-9972',
        cuisine: 'American',
        prepTimeMinutes: 20,
        cookTimeMinutes: 240,
        totalTimeMinutes: 260,
        effort: 2,
        defaultServings: 8,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['slow-cooker', 'chili', 'chicken', 'make-ahead'],
      },
      {
        name: 'Indian Butter Chicken',
        description: 'Classic creamy Indian butter chicken.',
        source: 'Real Food Dietitians',
        sourceUrl: 'https://therealfooddietitians.com/indian-butter-chicken/#tasty-recipes-10569',
        cuisine: 'Indian',
        prepTimeMinutes: 20,
        cookTimeMinutes: 25,
        totalTimeMinutes: 45,
        effort: 3,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['curry', 'chicken', 'indian', 'creamy'],
      },
      {
        name: 'Taco Bowl',
        description: 'Healthy taco bowl with all the fixings.',
        source: 'Real Food Dietitians',
        sourceUrl: 'https://therealfooddietitians.com/healthy-taco-hot-dish/#tasty-recipes-20814',
        cuisine: 'Mexican',
        prepTimeMinutes: 15,
        cookTimeMinutes: 25,
        totalTimeMinutes: 40,
        effort: 2,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['taco', 'bowl', 'weeknight'],
      },
      {
        name: 'Sausage and Gnocchi Skillet',
        description: 'One-pan Italian sausage with gnocchi.',
        source: 'Real Food Dietitians',
        sourceUrl: 'https://therealfooddietitians.com/sausage-and-gnocchi-skillet/',
        cuisine: 'Italian',
        prepTimeMinutes: 10,
        cookTimeMinutes: 25,
        totalTimeMinutes: 35,
        effort: 2,
        defaultServings: 4,
        servingsUnit: 'servings',
        ingredients: [],
        instructions: [],
        tags: ['gnocchi', 'sausage', 'one-pan', 'weeknight'],
      },
    ];

    // Generate dates starting from tomorrow
    const startDate = new Date(input.dateRange.start);
    const suggestions = [];

    for (let i = 0; i < input.suggestionsCount && i < mockRecipes.length; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + Math.floor(i / 1)); // One meal per day

      suggestions.push({
        date: date.toISOString().split('T')[0],
        mealType: input.mealTypes[0] || 'dinner',
        recipe: mockRecipes[i],
      });
    }

    return {
      suggestions,
      reasoning: 'Mock suggestions generated for testing. These are sample recipes to test the wizard flow.',
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
  timeout: 180000, // 3 minutes
});
