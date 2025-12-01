# Suggest Meals Command

Generate personalized meal suggestions using the HoneyDo meal planning system.

## Usage

```
/suggest-meals [date-range] [options]
```

## Arguments

- `date-range`: Optional. Format: `YYYY-MM-DD to YYYY-MM-DD` or shortcuts like `this-week`, `next-week`, `weekend`
- If not provided, defaults to the next 7 days

## Options

- `--meals`: Which meal types to plan (default: dinner)
  - Examples: `--meals dinner`, `--meals breakfast,lunch,dinner`
- `--servings`: Override default servings (default: from preferences)
- `--quick`: Only suggest meals under 30 minutes
- `--fancy`: Include higher effort recipes (weekend mode)

## How It Works

1. Load user preferences from database
2. Get recent meals from last 14 days
3. Build prompt with all context
4. Invoke Claude with the `honeydo-meal-suggestions` skill
5. Parse and validate JSON response
6. Store suggestions in database
7. Display results for review

## Example Usage

```bash
# Get dinner suggestions for next week
/suggest-meals next-week

# Get suggestions for specific dates
/suggest-meals 2025-02-01 to 2025-02-07

# Quick weeknight meals only
/suggest-meals this-week --quick

# Plan all meals for the weekend
/suggest-meals weekend --meals breakfast,lunch,dinner --fancy
```

## Implementation

This command triggers the meal suggestion workflow:

1. **Check Prerequisites**:
   - Recipe history exists at `data/recipes/history.json`
   - User has configured at least basic preferences

2. **Build Skill Input**:
   ```typescript
   const input: SkillInput = {
     dateRange: { start, end },
     mealTypes: ['dinner'],
     servings: preferences.defaultServings,
     recentMeals: await getRecentMeals(14),
     preferences: await exportPreferences(),
     ingredientPreferences: await getIngredientPrefs(),
     notes: await getActiveNotes(),
     context: { season: getSeason(), currentDate: today }
   };
   ```

3. **Invoke Claude**:
   ```bash
   claude -p --output-format json \
     --allowedTools Read \
     --max-turns 3 \
     --skill honeydo-meal-suggestions \
     "[prompt with input data]"
   ```

4. **Handle Response**:
   - Validate JSON against schema
   - Store in `meal_suggestions` table
   - Return suggestion ID for review

## Files to Reference

- `docs/epics/4-recipes/features/2-external-skill-integration/PLAN.md` - Integration spec
- `apps/api/src/services/meal-suggestions.ts` - Service implementation
- `.claude/skills/honeydo-meal-suggestions.md` - The skill definition

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No suggestions returned | Check recipe history file exists |
| All meals rejected | Review dietary restrictions - may be too strict |
| Wrong cuisine balance | Adjust cuisine preferences |
| Timeout | Recipe history may be too large, or Claude is overloaded |
