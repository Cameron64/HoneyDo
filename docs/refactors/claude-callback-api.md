# Refactor: Claude Callback API for Predictable AI Responses

## Problem Statement

The current Claude CLI integration for meal suggestions is **unpredictable**:

1. **Parsing Claude's output is fragile** - We spawn Claude, hope for valid JSON, and parse it with bracket-counting. Any deviation breaks the flow.
2. **No explicit confirmation** - We don't truly know if Claude "got" the request or finished processing.
3. **Progress is inferred** - Activity messages are extracted by watching for Bash tool use blocks, which is brittle.
4. **Error handling is reactive** - We only know something went wrong after parsing fails.

## Proposed Solution

**Have Claude call OUR API endpoint** to submit suggestions. This inverts the control flow:

```
BEFORE (Current):
┌──────────┐      spawn CLI       ┌──────────┐
│  API     │ ─────────────────────▶│  Claude  │
│  Server  │                       │   CLI    │
│          │◀─────────────────────│          │
└──────────┘   parse stdout JSON   └──────────┘
                (fragile!)

AFTER (Proposed):
┌──────────┐      spawn CLI       ┌──────────┐
│  API     │ ─────────────────────▶│  Claude  │
│  Server  │                       │   CLI    │
│          │                       │          │
│ /callback│◀─────────────────────│  calls   │
│ endpoint │   HTTP POST (Zod)    │  our API │
└──────────┘                       └──────────┘
                (explicit!)
```

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Explicit confirmation** | HTTP 200 = we got the data. No parsing stdout. |
| **Server-side validation** | Zod validates the payload on OUR terms. |
| **Request correlation** | Pass `requestId` to Claude, get it back in callback. |
| **Retry-friendly** | If Claude fails to call, we know (timeout). Can retry. |
| **Progress callbacks** | Claude can call `/progress` endpoint for activity updates. |
| **Works with CLI** | No need to switch to direct API. Uses existing Claude Code. |

---

## Architecture

### New Endpoints

```
POST /api/claude/suggestions      # Claude calls this with suggestions
POST /api/claude/progress         # Claude calls this for activity updates
```

Both endpoints are **internal only** - not exposed externally, authenticated via request ID + HMAC signature.

### Data Flow

```
1. Frontend triggers requestMoreSuggestions mutation
   └─▶ Creates mealSuggestions record with status='pending'
   └─▶ Generates requestId + hmacSecret
   └─▶ Spawns Claude CLI with callback instructions

2. Claude processes request
   └─▶ Reads recipe history
   └─▶ Calls POST /api/claude/progress { requestId, message, progress }
   └─▶ (Multiple times during processing)

3. Claude finishes
   └─▶ Calls POST /api/claude/suggestions {
         requestId,
         hmac,
         suggestions: [...],
         reasoning: "..."
       }

4. Callback endpoint receives data
   └─▶ Validates HMAC signature
   └─▶ Validates payload with Zod
   └─▶ Updates mealSuggestions record: status='received'
   └─▶ Emits WebSocket: recipes:suggestions:received
   └─▶ Returns HTTP 200 to Claude

5. Frontend receives WebSocket event
   └─▶ Refetches suggestions
   └─▶ Displays results
```

### Timeout Handling

```
After spawning Claude:
└─▶ Start 5-minute timeout
└─▶ If callback not received:
    └─▶ Update status='expired'
    └─▶ Emit recipes:suggestions:error
    └─▶ Log for debugging
```

---

## Implementation Plan

### Phase 1: Create Callback Endpoints

**File: `apps/api/src/routes/claude-callback.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db';
import { mealSuggestions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { socketEmitter } from '../services/websocket/emitter';
import { skillOutputSchema, type MealSuggestionItem } from '@honeydo/shared';

// Request schemas
const progressSchema = z.object({
  requestId: z.string(),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
  type: z.enum(['thinking', 'querying', 'results']).optional(),
});

const suggestionsCallbackSchema = z.object({
  requestId: z.string(),
  hmac: z.string(),
  suggestions: z.array(z.object({
    date: z.string(),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    recipe: z.object({
      name: z.string(),
      // ... full recipe schema
    }),
  })),
  reasoning: z.string(),
});

// Store pending requests with their secrets (in-memory, or use Redis)
export const pendingRequests = new Map<string, {
  secret: string;
  userId: string;
  createdAt: number;
}>();

export async function claudeCallbackRoutes(app: FastifyInstance) {
  // Progress updates (no HMAC required - low stakes)
  app.post('/api/claude/progress', async (request, reply) => {
    const result = progressSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const { requestId, message, progress, type } = result.data;
    const pending = pendingRequests.get(requestId);

    if (!pending) {
      return reply.status(404).send({ error: 'Unknown request' });
    }

    // Emit progress to user
    socketEmitter.toUser(pending.userId, 'recipes:suggestions:activity', {
      message,
      type: type || 'querying',
      progress: progress || 50,
    });

    return { success: true };
  });

  // Final suggestions callback (HMAC verified)
  app.post('/api/claude/suggestions', async (request, reply) => {
    const result = suggestionsCallbackSchema.safeParse(request.body);
    if (!result.success) {
      console.error('[ClaudeCallback] Invalid payload:', result.error);
      return reply.status(400).send({ error: 'Invalid payload', details: result.error.issues });
    }

    const { requestId, hmac, suggestions, reasoning } = result.data;
    const pending = pendingRequests.get(requestId);

    if (!pending) {
      return reply.status(404).send({ error: 'Unknown or expired request' });
    }

    // Verify HMAC
    const expectedHmac = crypto
      .createHmac('sha256', pending.secret)
      .update(requestId)
      .digest('hex');

    if (hmac !== expectedHmac) {
      console.error('[ClaudeCallback] HMAC mismatch for request:', requestId);
      return reply.status(403).send({ error: 'Invalid signature' });
    }

    // Clean up pending request
    pendingRequests.delete(requestId);

    // Transform to MealSuggestionItem format
    const suggestionItems: MealSuggestionItem[] = suggestions.map((s) => ({
      date: s.date,
      mealType: s.mealType,
      recipe: s.recipe,
      accepted: null,
      servingsOverride: null,
      notes: null,
    }));

    // Update database
    await db
      .update(mealSuggestions)
      .set({
        status: 'received',
        suggestions: suggestionItems,
        reasoning,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(mealSuggestions.id, requestId));

    // Notify frontend
    socketEmitter.toUser(pending.userId, 'recipes:suggestions:received', {
      suggestionId: requestId,
    });

    console.log('[ClaudeCallback] Received', suggestions.length, 'suggestions for request:', requestId);

    return { success: true, received: suggestions.length };
  });
}
```

### Phase 2: Update System Prompt

**File: `apps/api/src/prompts/meal-suggestions.md`**

Add callback instructions to the system prompt:

```markdown
## How to Submit Your Response

When you have generated your meal suggestions, you MUST submit them by calling the HoneyDo API.

### Progress Updates (Optional)

While working, you can send progress updates:

```bash
curl -X POST "{{CALLBACK_BASE_URL}}/api/claude/progress" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "{{REQUEST_ID}}",
    "message": "Browsing Italian recipes...",
    "progress": 30,
    "type": "querying"
  }'
```

### Final Submission (Required)

When done, submit your suggestions:

```bash
curl -X POST "{{CALLBACK_BASE_URL}}/api/claude/suggestions" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "{{REQUEST_ID}}",
    "hmac": "{{HMAC_SIGNATURE}}",
    "suggestions": [
      {
        "date": "2024-01-15",
        "mealType": "dinner",
        "recipe": {
          "name": "Recipe Name",
          "source": "Source",
          ...
        }
      }
    ],
    "reasoning": "I chose these recipes because..."
  }'
```

The HMAC signature must be computed as:
```
HMAC-SHA256(secret="{{HMAC_SECRET}}", message="{{REQUEST_ID}}")
```

**Important**: Your task is NOT complete until you receive a `{"success": true}` response from the suggestions endpoint.
```

### Phase 3: Update Meal Suggestions Service

**File: `apps/api/src/services/meal-suggestions.ts`**

```typescript
import crypto from 'crypto';
import { pendingRequests } from '../routes/claude-callback';

interface CallbackConfig {
  requestId: string;
  baseUrl: string;
  hmacSecret: string;
}

export class MealSuggestionsService {
  /**
   * Generate callback configuration for a request
   */
  private generateCallbackConfig(requestId: string, userId: string): CallbackConfig {
    const hmacSecret = crypto.randomBytes(32).toString('hex');
    const baseUrl = process.env.CALLBACK_BASE_URL || 'http://localhost:3001';

    // Store for verification when callback arrives
    pendingRequests.set(requestId, {
      secret: hmacSecret,
      userId,
      createdAt: Date.now(),
    });

    // Set timeout to clean up if no callback received
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        this.handleTimeout(requestId, userId);
      }
    }, 5 * 60 * 1000); // 5 minute timeout

    return {
      requestId,
      baseUrl,
      hmacSecret,
    };
  }

  /**
   * Build the prompt with callback instructions injected
   */
  private buildPromptWithCallback(
    input: SkillInput,
    callback: CallbackConfig
  ): string {
    const basePrompt = this.buildPrompt(input);

    // Compute HMAC for Claude to use
    const hmac = crypto
      .createHmac('sha256', callback.hmacSecret)
      .update(callback.requestId)
      .digest('hex');

    return `
${basePrompt}

---

## Callback Configuration

When submitting your response, use these values:

- REQUEST_ID: ${callback.requestId}
- CALLBACK_BASE_URL: ${callback.baseUrl}
- HMAC_SIGNATURE: ${hmac}

Remember: Call the /api/claude/suggestions endpoint with your results.
Progress updates to /api/claude/progress are optional but encouraged.
`;
  }

  async getSuggestionsWithCallback(
    input: SkillInput,
    requestId: string,
    userId: string
  ): Promise<void> {
    // Generate callback config
    const callbackConfig = this.generateCallbackConfig(requestId, userId);

    // Load system prompt
    const systemPromptPath = path.join(__dirname, '../prompts/meal-suggestions.md');
    const systemPrompt = readFileSync(systemPromptPath, 'utf-8');

    // Build prompt with callback instructions
    const userPrompt = this.buildPromptWithCallback(input, callbackConfig);

    // Spawn Claude - we don't wait for output, Claude will call us back
    const proc = spawn('claude', [
      '-p',
      '--allowedTools', 'Bash,Read',  // Needs Bash for curl
      '--max-turns', '10',
    ], {
      cwd: this.config.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin
    proc.stdin.write(`${systemPrompt}\n\n---\n\n${userPrompt}`);
    proc.stdin.end();

    // Log output for debugging but don't parse it
    proc.stdout.on('data', (chunk) => {
      console.log('[Claude]', chunk.toString().slice(0, 200));
    });

    proc.stderr.on('data', (chunk) => {
      console.error('[Claude stderr]', chunk.toString());
    });

    proc.on('close', (code) => {
      console.log('[Claude] Process exited with code:', code);
      // Don't handle success here - wait for callback
    });

    proc.on('error', (error) => {
      console.error('[Claude] Process error:', error);
      this.handleTimeout(requestId, userId);
    });
  }

  private async handleTimeout(requestId: string, userId: string) {
    console.error('[MealSuggestions] Timeout waiting for callback:', requestId);

    await db
      .update(mealSuggestions)
      .set({
        status: 'expired',
        error: 'Claude did not respond in time',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(mealSuggestions.id, requestId));

    socketEmitter.toUser(userId, 'recipes:suggestions:error', {
      suggestionId: requestId,
      error: 'Request timed out. Please try again.',
    });
  }
}
```

### Phase 4: Update Router to Use Callback Method

**File: `apps/api/src/modules/recipes/wizard/step2-request.router.ts`**

```typescript
export const step2RequestRouter = router({
  requestMoreSuggestions: protectedProcedure
    .input(requestSuggestionsSchema)
    .mutation(async ({ ctx, input }) => {
      // ... existing session validation ...

      // Create pending request record
      const [request] = await ctx.db
        .insert(mealSuggestions)
        .values({
          requestedBy: ctx.userId,
          dateRangeStart: input.dateRangeStart,
          dateRangeEnd: input.dateRangeEnd,
          status: 'pending',
          visibleCount,
        })
        .returning();

      // Build skill input
      const skillInput = await buildSkillInput({ /* ... */ });

      // Use callback-based method (fire and forget)
      // Claude will call our endpoint when done
      mealSuggestionsService.getSuggestionsWithCallback(
        skillInput,
        request.id,  // requestId for correlation
        ctx.userId
      );

      return { requestId: request.id, status: 'pending' };
    }),
});
```

### Phase 5: Register Routes

**File: `apps/api/src/server.ts`**

```typescript
import { claudeCallbackRoutes } from './routes/claude-callback';

// ... existing setup ...

// Register Claude callback routes (before tRPC)
await app.register(claudeCallbackRoutes);
```

---

## Security Considerations

### HMAC Authentication

Each request gets a unique secret:
1. Server generates random 32-byte secret
2. Computes HMAC-SHA256(secret, requestId)
3. Includes HMAC in prompt for Claude
4. Claude includes HMAC in callback
5. Server verifies before accepting

This prevents:
- Malicious actors from submitting fake suggestions
- Replay attacks (each request has unique secret)
- Cross-request pollution

### Request Expiration

Pending requests expire after 5 minutes:
- Prevents memory leaks from abandoned requests
- Triggers error handling for stuck requests
- Cleans up stale secrets

### Internal-Only Endpoints

The callback endpoints should be:
- Not exposed to the public internet (if possible)
- Rate-limited
- Logged for debugging

---

## Testing Plan

### Unit Tests

```typescript
describe('Claude Callback Endpoint', () => {
  it('accepts valid suggestions with correct HMAC', async () => {
    // Register pending request
    pendingRequests.set('test-123', {
      secret: 'test-secret',
      userId: 'user-1',
      createdAt: Date.now(),
    });

    const hmac = crypto
      .createHmac('sha256', 'test-secret')
      .update('test-123')
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/api/claude/suggestions',
      payload: {
        requestId: 'test-123',
        hmac,
        suggestions: [/* valid suggestions */],
        reasoning: 'Test reasoning',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ success: true, received: 1 });
  });

  it('rejects invalid HMAC', async () => {
    pendingRequests.set('test-123', {
      secret: 'test-secret',
      userId: 'user-1',
      createdAt: Date.now(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/claude/suggestions',
      payload: {
        requestId: 'test-123',
        hmac: 'wrong-hmac',
        suggestions: [],
        reasoning: '',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects unknown request ID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/claude/suggestions',
      payload: {
        requestId: 'unknown-123',
        hmac: 'any',
        suggestions: [],
        reasoning: '',
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

### Integration Tests

1. **Happy path**: Request suggestions → Claude calls back → Frontend gets WebSocket event
2. **Timeout**: Request suggestions → Claude doesn't respond → Status becomes expired
3. **Progress updates**: Claude sends progress → Frontend receives activity events
4. **Invalid response**: Claude sends bad JSON → Endpoint returns 400 → Claude should retry

### Manual Testing

```bash
# Simulate Claude calling back
curl -X POST http://localhost:3001/api/claude/suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-request-id",
    "hmac": "computed-hmac-here",
    "suggestions": [...],
    "reasoning": "Test"
  }'
```

---

## Migration Strategy

### Phase 1: Add Callback Endpoints (No Breaking Changes)
- Add `/api/claude/progress` and `/api/claude/suggestions` endpoints
- Keep existing stdout-parsing code working
- Test endpoints manually

### Phase 2: Add New Service Method
- Add `getSuggestionsWithCallback()` method
- Keep existing methods working
- Feature flag: `USE_CALLBACK_CLAUDE=true`

### Phase 3: Update Prompt
- Update system prompt to include callback instructions
- Test with real Claude

### Phase 4: Switch Over
- Update router to use callback method
- Monitor for issues
- Remove old stdout-parsing code

### Phase 5: Cleanup
- Remove `USE_CALLBACK_CLAUDE` flag
- Remove old service methods
- Update documentation

---

## Environment Variables

```bash
# apps/api/.env

# Base URL for Claude callbacks (must be accessible from Claude's perspective)
CALLBACK_BASE_URL=http://localhost:3001

# Feature flag (during migration)
USE_CALLBACK_CLAUDE=true
```

---

## Rollback Plan

If the callback approach has issues:

1. Set `USE_CALLBACK_CLAUDE=false`
2. System falls back to stdout parsing
3. Investigate issues
4. Fix and re-enable

---

## Future Enhancements

### Webhook Verification
- Add request signing for additional security
- Consider using a shared secret in environment

### Retry Logic
- If Claude's callback fails, it should retry
- Add exponential backoff instructions to prompt

### Batch Callbacks
- For large requests, Claude could send suggestions in batches
- Add `/api/claude/suggestions/batch` endpoint

### Monitoring
- Add metrics for callback latency
- Track success/failure rates
- Alert on high timeout rates

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/api/src/routes/claude-callback.ts` | **NEW** - Callback endpoints |
| `apps/api/src/server.ts` | Register callback routes |
| `apps/api/src/services/meal-suggestions.ts` | Add callback-based method |
| `apps/api/src/prompts/meal-suggestions.md` | Add callback instructions |
| `apps/api/src/modules/recipes/wizard/step2-request.router.ts` | Use callback method |

---

## Success Criteria

- [ ] Suggestions are received via HTTP callback, not stdout parsing
- [ ] HMAC verification prevents unauthorized callbacks
- [ ] Progress updates stream in real-time
- [ ] Timeouts are handled gracefully
- [ ] Frontend experience is unchanged or improved
- [ ] Error messages are clear and actionable
- [ ] Tests cover happy path and edge cases
