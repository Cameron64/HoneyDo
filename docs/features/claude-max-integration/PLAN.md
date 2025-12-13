# Feature: Claude Max Integration for Meal Suggestions

## Overview

Replace the mock meal suggestions service with real Claude-powered suggestions using **Claude Code's headless mode**. This uses your existing Claude Max subscription instead of the Anthropic API, eliminating per-request costs.

**Current State**: The `MealSuggestionsService` has working Claude CLI integration, but defaults to mock mode (`MOCK_MEAL_SUGGESTIONS=true`) to avoid API costs during development.

**Goal**: Enable production use of Claude Max subscription for meal suggestions with proper error handling, fallbacks, and user-friendly feedback.

## User Stories

- As a user, I want meal suggestions powered by AI using my Claude Max subscription
- As a user, I want clear feedback when suggestions are loading (may take 30-60 seconds)
- As a user, I want to fall back to mock data if Claude is unavailable
- As a user, I want to see the AI's reasoning for its suggestions

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HoneyDo API Server                                │
│                                                                          │
│  1. Frontend requests suggestions via tRPC                               │
│  2. MealSuggestionsService builds prompt with preferences                │
│  3. spawn('claude', ['-p', '--output-format', 'json', ...])             │
│  4. Claude reads data/recipes/history.json via Read tool                 │
│  5. Claude returns structured JSON with suggestions                      │
│  6. Service validates against Zod schema                                 │
│  7. WebSocket notifies frontend when ready                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Flags Used

| Flag | Purpose |
|------|---------|
| `-p` / `--print` | Non-interactive mode, outputs response only |
| `--output-format json` | Returns structured JSON wrapper |
| `--allowedTools Read` | Only allow reading files (security) |
| `--max-turns 3` | Limit iterations to prevent runaway |

## Current Implementation Analysis

### What Already Exists (`apps/api/src/services/meal-suggestions.ts`)

1. **MealSuggestionsService class** - Complete implementation that:
   - Spawns Claude CLI with correct flags
   - Pipes prompt via stdin (avoids command line length limits)
   - Parses JSON output with bracket-counting for robustness
   - Validates against Zod schema
   - Has mock fallback for development

2. **System prompt** - Referenced at `apps/api/prompts/meal-suggestions.md` (needs creation)

3. **Skill definition** - At `.claude/skills/honeydo-meal-suggestions/SKILL.md`

### What Needs Work

| Component | Status | Work Needed |
|-----------|--------|-------------|
| `MealSuggestionsService` | ✅ Working | Minor refinements |
| System prompt file | ❌ Missing | Create `apps/api/src/prompts/meal-suggestions.md` |
| Error messages | ⚠️ Basic | Improve user-facing messages |
| Loading states | ⚠️ Basic | Better progress indication |
| Retry logic | ❌ Missing | Add automatic retry for transient failures |
| Timeout handling | ✅ Working | 3 minute timeout exists |
| Mock mode toggle | ✅ Working | `MOCK_MEAL_SUGGESTIONS` env var |

---

## Technical Details

### 1. Create System Prompt File

```markdown
<!-- apps/api/src/prompts/meal-suggestions.md -->

# HoneyDo Meal Suggestions

You are a meal planning assistant for HoneyDo. Your job is to suggest personalized meals based on the user's recipe history, preferences, and constraints.

## Your Task

1. Read the recipe history from `data/recipes/history.json`
2. Consider the user's preferences and constraints provided in the prompt
3. Return a JSON object with your suggestions

## Output Format

Return ONLY valid JSON. Do not include any text before or after the JSON object. Start your response with `{` and end with `}`.

```json
{
  "suggestions": [
    {
      "date": "YYYY-MM-DD",
      "mealType": "dinner",
      "recipe": {
        "name": "Recipe Name",
        "description": "Brief description",
        "source": "Source name",
        "sourceUrl": "https://...",
        "cuisine": "Italian",
        "prepTimeMinutes": 15,
        "cookTimeMinutes": 30,
        "totalTimeMinutes": 45,
        "effort": 2,
        "defaultServings": 4,
        "servingsUnit": "servings",
        "ingredients": [
          {
            "name": "ingredient",
            "amount": 1,
            "unit": "cup",
            "category": "produce"
          }
        ],
        "instructions": ["Step 1", "Step 2"],
        "tags": ["weeknight", "one-pan"]
      }
    }
  ],
  "reasoning": "Explain why you chose these recipes..."
}
```

## Selection Rules

### Hard Constraints (Never Violate)
- Respect dietary restrictions (vegetarian, allergies, etc.)
- Stay within time and effort limits
- Never suggest meals from the "avoid" lists

### Preferences (Optimize For)
- Variety in cuisines (don't repeat same cuisine consecutively)
- Balance effort levels across the week
- Prefer recipes with good ratings (4-5 stars)
- Consider seasonality
- Look for ingredient overlap to reduce shopping

### Recent Meals
- Avoid recipes made in the last 14 days
- Consider how often a recipe has been made (variety vs. favorites)

## Important Notes

- If recipe history is empty, explain that you need recipes to suggest from
- If preferences are too restrictive, explain what's blocking suggestions
- Always include reasoning to help users understand your choices
- Put your explanation in the "reasoning" field, not outside the JSON
```

### 2. Environment Configuration

```bash
# apps/api/.env

# Claude Max Integration
# Set to 'false' to use real Claude suggestions (requires Claude Code installed)
# Set to 'true' to use mock data (for development without Claude)
MOCK_MEAL_SUGGESTIONS=false

# Timeout in milliseconds (default: 180000 = 3 minutes)
CLAUDE_SUGGESTION_TIMEOUT=180000
```

### 3. Service Refinements

```typescript
// apps/api/src/services/meal-suggestions.ts - Additions

export class MealSuggestionsService {
  // Add retry logic
  async getSuggestionsWithRetry(
    input: SkillInput,
    maxRetries = 2
  ): Promise<SkillOutput> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.getSuggestions(input);
      } catch (error) {
        lastError = error as Error;
        console.error(`[MealSuggestions] Attempt ${attempt + 1} failed:`, error);

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await this.delay(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('credit balance') ||
      message.includes('not found') ||
      message.includes('enoent') ||
      message.includes('invalid response format')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Add graceful fallback
  async getSuggestionsOrFallback(input: SkillInput): Promise<SkillOutput> {
    try {
      return await this.getSuggestionsWithRetry(input);
    } catch (error) {
      console.error('[MealSuggestions] All attempts failed, using fallback');
      return this.getMockSuggestions(input);
    }
  }
}
```

### 4. Frontend Loading States

```typescript
// apps/web/src/modules/recipes/components/SuggestionRequestStatus.tsx

import { Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  status: 'idle' | 'pending' | 'ready' | 'error';
  error?: string;
  startedAt?: Date;
}

export function SuggestionRequestStatus({ status, error, startedAt }: Props) {
  if (status === 'idle') return null;

  if (status === 'pending') {
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0;

    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Getting suggestions...</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span>
            {elapsed < 30
              ? 'Claude is reading your recipes and preferences...'
              : elapsed < 60
              ? 'Analyzing your meal history for variety...'
              : 'Almost done, crafting the perfect suggestions...'}
          </span>
          <span className="text-muted-foreground text-xs">({elapsed}s)</span>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn't get suggestions</AlertTitle>
        <AlertDescription>{error || 'Please try again.'}</AlertDescription>
      </Alert>
    );
  }

  if (status === 'ready') {
    return (
      <Alert className="border-green-200 bg-green-50 text-green-800">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Suggestions ready!</AlertTitle>
      </Alert>
    );
  }

  return null;
}
```

### 5. Error Message Mapping

```typescript
// apps/api/src/services/meal-suggestions.ts

private extractFriendlyError(errorMessage: string): string {
  // Credit/billing errors
  if (errorMessage.includes('Credit balance is too low')) {
    return 'Your Claude account needs more credits. Using fallback suggestions.';
  }

  // Rate limiting
  if (errorMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Claude not installed
  if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
    return 'Claude Code is not installed on the server. Using fallback suggestions.';
  }

  // Timeout
  if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
    return 'Request took too long. This can happen with large recipe histories.';
  }

  // Truncated output
  if (errorMessage.includes('truncated')) {
    return 'Response was too long. Try requesting fewer days.';
  }

  // Parse errors
  if (errorMessage.includes('parse') || errorMessage.includes('JSON')) {
    return 'Received invalid response. Please try again.';
  }

  // Generic fallback
  return 'Something went wrong. Please try again later.';
}
```

---

## API Endpoints

No new endpoints needed. The existing `recipes.suggestions.request` mutation already calls `mealSuggestionsService.getSuggestions()`.

### Current Flow

```typescript
// apps/api/src/modules/recipes/routers/suggestions.ts

request: protectedProcedure
  .input(requestSuggestionsSchema)
  .mutation(async ({ ctx, input }) => {
    // ... build skillInput from preferences ...

    // This already calls the MealSuggestionsService
    const output = await mealSuggestionsService.getSuggestions(skillInput);

    // Store and return
    // ...
  }),
```

---

## WebSocket Events

Already implemented:

| Event | Direction | Payload |
|-------|-----------|---------|
| `recipes:suggestions:ready` | Server→Client | `{ requestId }` |
| `recipes:suggestions:error` | Server→Client | `{ requestId, error }` |

---

## Configuration

### Enable Claude Max Mode

```bash
# .env.local or .env
MOCK_MEAL_SUGGESTIONS=false
```

### Keep Mock Mode (Development)

```bash
# .env.local or .env
MOCK_MEAL_SUGGESTIONS=true
```

### Automatic Fallback

The service can be configured to automatically fall back to mock data if Claude fails:

```typescript
// Use in production for resilience
const output = await mealSuggestionsService.getSuggestionsOrFallback(input);
```

---

## Prerequisites

### Server Requirements

1. **Claude Code CLI installed** on the server
   ```bash
   # Verify installation
   claude --version
   ```

2. **Authenticated to Claude Max**
   ```bash
   # Login (one-time)
   claude login
   ```

3. **Recipe history file exists**
   - Location: `data/recipes/history.json`
   - Should contain at least a few recipes to suggest from

### Docker Considerations

If running in Docker, Claude Code needs to be installed in the container:

```dockerfile
# docker/api/Dockerfile (addition)

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Copy authentication (or use volume mount)
# Note: Auth token should be provided via environment or mounted volume
```

**Alternative**: Run Claude CLI on host, expose via internal API.

---

## Testing

### Unit Tests

```typescript
// apps/api/src/services/__tests__/meal-suggestions.test.ts

describe('MealSuggestionsService', () => {
  describe('parseOutput', () => {
    it('parses valid Claude JSON response', () => {});
    it('handles wrapped response from --output-format json', () => {});
    it('strips markdown code fences', () => {});
    it('throws on truncated JSON', () => {});
    it('throws on invalid schema', () => {});
  });

  describe('extractFriendlyError', () => {
    it('maps credit balance errors', () => {});
    it('maps rate limit errors', () => {});
    it('maps timeout errors', () => {});
    it('provides generic message for unknown errors', () => {});
  });

  describe('getSuggestionsWithRetry', () => {
    it('retries on transient failures', () => {});
    it('does not retry on non-retryable errors', () => {});
    it('uses exponential backoff', () => {});
  });
});
```

### Integration Tests

```typescript
// apps/api/src/modules/recipes/__tests__/suggestions.integration.test.ts

describe('Suggestions Integration', () => {
  it('returns mock data when MOCK_MEAL_SUGGESTIONS=true', async () => {});
  it('calls Claude CLI when MOCK_MEAL_SUGGESTIONS=false', async () => {});
  it('falls back to mock on Claude error', async () => {});
});
```

### Manual Testing

1. Set `MOCK_MEAL_SUGGESTIONS=false`
2. Ensure `data/recipes/history.json` has recipes
3. Request suggestions via the UI
4. Verify Claude is invoked (check server logs)
5. Verify suggestions match recipe history
6. Test error cases (disconnect network, kill claude process)

---

## Implementation Order

1. **Create system prompt file** (`apps/api/src/prompts/meal-suggestions.md`)
2. **Add retry logic** to `MealSuggestionsService`
3. **Add fallback method** `getSuggestionsOrFallback()`
4. **Improve error messages** in `extractFriendlyError()`
5. **Add frontend loading states** with elapsed time
6. **Test with mock mode off**
7. **Document Docker setup** if needed

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Claude not installed | Detect ENOENT, fall back to mock |
| Claude not authenticated | Error message with login instructions |
| Empty recipe history | Claude explains, suggests adding recipes |
| Very large history | May cause timeout, consider pagination |
| Network issues mid-request | Retry with backoff |
| Concurrent requests | Each spawns separate process (OK) |
| User cancels | Process continues, result discarded |

---

## Success Metrics

- [ ] Suggestions generated in < 60 seconds (typical)
- [ ] Error messages are user-friendly, not technical
- [ ] Fallback to mock data works reliably
- [ ] No API billing - uses Claude Max subscription
- [ ] Reasoning field explains AI choices

---

## Future Enhancements

1. **Streaming responses** - Show partial suggestions as they generate
2. **Caching** - Cache suggestions for same input parameters
3. **Background generation** - Pre-generate suggestions before user asks
4. **Multiple models** - Support different Claude models via config
5. **Usage tracking** - Log suggestion requests for analytics
