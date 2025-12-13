# HoneyDo AI Prompts - Claude Code Instructions

> System prompts for AI-powered features

## Overview

This directory contains system prompts used by Claude Code integrations. These prompts instruct Claude on how to perform specific tasks like generating meal suggestions.

## Directory Structure

```
apps/api/src/prompts/
├── CLAUDE.md              # This file
├── meal-suggestions.md    # Meal planning system prompt
└── recipe-query.md        # Recipe search/query prompt
```

## Prompt Design Principles

### 1. Clear Role Definition
Start prompts with a clear role for Claude:
```markdown
You are a meal planning assistant for a household...
```

### 2. Input/Output Format
Specify exactly what data Claude will receive and should return:
```markdown
## Input
You will receive:
- User preferences (cuisines, dietary restrictions)
- Date range for meal planning
- Recent meal history

## Output
Return a JSON object with:
- `suggestions`: Array of meal suggestions
- `reasoning`: Brief explanation of choices
```

### 3. Constraints and Guidelines
List specific rules to follow:
```markdown
## Guidelines
- Never suggest the same recipe twice in one week
- Consider prep time for weeknight vs weekend meals
- Balance cuisines across the week
```

### 4. Error Handling
Specify how to handle edge cases:
```markdown
## Error Cases
If no matching recipes found:
- Return empty suggestions array
- Include explanation in reasoning
```

## Current Prompts

### meal-suggestions.md

Used by the meal suggestions service for generating weekly meal plans.

**Purpose**: Generate personalized meal suggestions based on user preferences, dietary restrictions, and recipe history.

**Key Features**:
- Reads from `data/recipes/history.json`
- Considers cuisine preferences and frequencies
- Respects dietary restrictions
- Balances variety across the week
- Accounts for prep time (weeknight vs weekend)

**Called By**:
- `services/meal-suggestions.ts`
- `services/claude-session.ts` (as system prompt)

### recipe-query.md

Used for querying the recipe library.

**Purpose**: Search and filter recipes based on various criteria.

**Key Features**:
- Natural language recipe search
- Filter by cuisine, time, ingredients
- Ranking by relevance and user preferences

**Called By**:
- Recipe wizard step 2
- MCP meals server

## Writing New Prompts

### Template

```markdown
# [Feature Name] System Prompt

## Role
You are a [role description]...

## Context
[What the user is trying to accomplish]

## Input
You will receive:
- [Input 1]: Description
- [Input 2]: Description

## Output
Return a JSON object with this exact structure:
```json
{
  "field1": "description",
  "field2": []
}
```

## Guidelines
1. [Guideline 1]
2. [Guideline 2]
3. [Guideline 3]

## Examples

### Example 1
Input: ...
Output: ...

### Example 2
Input: ...
Output: ...

## Error Handling
- If [condition], then [action]
- If [condition], then [action]
```

### Best Practices

1. **Be Specific**: Vague prompts lead to inconsistent results
2. **Provide Examples**: Show expected input/output pairs
3. **Version Control**: These prompts should be in git
4. **Test Iteratively**: Refine prompts based on actual results
5. **Use Markdown**: Prompts are loaded as markdown, use formatting

### Loading Prompts

Prompts are loaded as strings and passed to Claude:

```typescript
import fs from 'fs/promises';
import path from 'path';

const promptPath = path.join(__dirname, '../prompts/meal-suggestions.md');
const systemPrompt = await fs.readFile(promptPath, 'utf-8');

const result = await session.runQuery({
  prompt: userPrompt,
  systemPrompt: systemPrompt,
});
```

Or inline as template literals:
```typescript
const systemPrompt = `
You are a meal planning assistant...

## Guidelines
- Balance cuisines
- Consider prep time
`;
```

## Integration with Claude Session

When using with the Claude Session Service:

```typescript
import { getClaudeSession } from '../services/claude-session';

const session = getClaudeSession();

// System prompt appended to claude_code preset
await session.runQuery({
  prompt: 'Generate meal suggestions for Jan 15-21',
  systemPrompt: mealSuggestionsPrompt,  // From prompts/
  onMessage: (msg) => { /* streaming */ },
});
```

The `systemPrompt` is passed as:
```typescript
options.systemPrompt = {
  type: 'preset',
  preset: 'claude_code',
  append: request.systemPrompt,  // Your prompt appended here
};
```

## Prompt Variables

Some prompts expect dynamic data interpolation:

```typescript
const systemPrompt = baseSuggestionPrompt
  .replace('{{PREFERENCES}}', JSON.stringify(preferences))
  .replace('{{DATE_RANGE}}', `${start} to ${end}`);
```

Or use template literals:
```typescript
const systemPrompt = `
${baseSuggestionPrompt}

## User Preferences
${JSON.stringify(preferences, null, 2)}

## Date Range
${start} to ${end}
`;
```

## Files to Reference

- Claude session: `../services/claude-session.ts`
- Meal suggestions service: `../services/meal-suggestions.ts`
- Skill input types: `packages/shared/src/schemas/recipes.ts`
