# Recipe Preferences Manager

Help the user manage their meal planning preferences for the HoneyDo Recipes module (Epic 4).

## What You Can Do

1. **View Current Preferences** - Show all configured preferences
2. **Set Cuisine Preferences** - Configure which cuisines they love/like/avoid and max per week
3. **Set Dietary Restrictions** - Add allergies, intolerances, or diet rules
4. **Set Time Constraints** - Configure max cook times for weeknight vs weekend
5. **Set Effort Constraints** - Configure max effort levels (1-5 scale)
6. **Manage Ingredient Lists** - Love/hate lists with optional notes
7. **Add Freeform Notes** - Natural language rules like "vegetarian Mondays"
8. **Export Preferences** - Show JSON export format for debugging

## Preference Storage

Preferences are stored in the database tables:
- `meal_preferences` - Fixed constraints (time, effort, servings)
- `ingredient_preferences` - Love/hate lists
- `meal_preference_notes` - Freeform notes

Check `apps/api/src/db/schema/recipes.ts` for the schema.

## Workflow

1. Ask the user what they want to configure
2. Guide them through the options with clear examples
3. Validate inputs before storing
4. Show confirmation of changes
5. Offer to export current preferences for review

## Example Interactions

**Setting cuisine preferences:**
```
User: I want to set my cuisine preferences
Assistant: Let's configure your cuisine preferences. For each cuisine, you can set:
- Preference: love, like, neutral, or avoid
- Max per week: How many times maximum (e.g., "Italian max 2x/week")

What cuisines would you like to configure?
```

**Adding dietary restrictions:**
```
User: I'm allergic to shellfish
Assistant: I'll add "shellfish allergy" to your dietary restrictions. This will:
- Prevent any recipes with shellfish from being suggested
- Flag shellfish in any ingredient lists

Added: shellfish-allergy
Would you like to add any other restrictions?
```

**Adding freeform notes:**
```
User: We try to eat vegetarian on Mondays
Assistant: I'll add that as a meal rule. This will be sent to the AI when generating suggestions.

Added rule: "Vegetarian meals on Mondays"
Type: rule
Status: active

Any other preferences to add?
```

## Data Validation

- Cuisine names: Capitalize first letter, validate against common cuisines
- Time constraints: Must be positive integers (minutes)
- Effort: Must be 1-5
- Ingredient preferences: love, like, neutral, dislike, never
- Note types: general, ingredient, rule, seasonal

## Files to Reference

- `docs/epics/4-recipes/features/1-preferences-system/PLAN.md` - Full feature spec
- `packages/shared/src/schemas/recipes.ts` - Zod validation schemas
- `apps/api/src/modules/recipes/routers/preferences.ts` - API routes
