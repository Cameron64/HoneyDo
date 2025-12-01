# Review Meal Suggestions

Review and accept/reject meal suggestions from the AI.

## Usage

```
/review-suggestions [suggestion-id] [options]
```

## Arguments

- `suggestion-id`: Optional. Specific suggestion batch to review
  - If not provided, shows the most recent pending suggestions

## Options

- `--accept-all`: Accept all remaining unreviewed meals
- `--reject-all`: Reject all remaining unreviewed meals
- `--interactive`: Step through each meal one by one (default)
- `--summary`: Show summary without interactive review

## Workflow

After running `/suggest-meals`, you'll have pending suggestions to review:

```
Meal Suggestions (Jan 20-26, 2025)
Generated: 2 minutes ago
Status: 7 meals pending review

AI Reasoning:
"Selected Mediterranean cuisine for Tuesday since you haven't had it in
2 weeks. Kept weeknight meals under 45 minutes. Included one vegetarian
meal per your rules. Avoided cilantro in all recipes."

---

[1/7] Monday, Jan 20 - Dinner

LEMON HERB CHICKEN
Mediterranean | 60 min | Effort: 3/5 | 4 servings

Bright, zesty roasted chicken with Mediterranean herbs

Ingredients:
- 2 lbs chicken thighs
- 2 lemons
- 4 sprigs fresh rosemary
- 4 cloves garlic
- 2 tbsp olive oil

Source: NYT Cooking

[A]ccept  [R]eject  [S]ervings (change to __)  [N]otes  [Skip]  [Q]uit
>
```

## Actions per Meal

| Key | Action | Description |
|-----|--------|-------------|
| `A` | Accept | Add to meal plan |
| `R` | Reject | Skip this meal, won't be planned |
| `S` | Servings | Change serving size (affects shopping quantities) |
| `N` | Notes | Add notes for this meal |
| `Skip` | Skip | Leave unreviewed, come back later |
| `Q` | Quit | Exit review, keep progress |

## After Review

```
Review Complete!

Accepted: 5 meals
Rejected: 2 meals
Skipped: 0 meals

Accepted meals:
- Mon: Lemon Herb Chicken (4 servings)
- Tue: Vegetarian Stir Fry (2 servings)
- Wed: Spaghetti Carbonara (2 servings)
- Fri: Grilled Salmon (4 servings)
- Sat: Beef Bourguignon (6 servings)

Rejected meals:
- Thu: Fish Tacos (not in the mood)
- Sun: Roast Duck (too complex)

Next steps:
- View your plan: /meal-plan this-week
- Generate shopping list: /shopping-from-meals this-week
- Get more suggestions: /suggest-meals (for empty days)
```

## Bulk Actions

```bash
# Accept everything (trust the AI)
/review-suggestions --accept-all

# Start fresh
/review-suggestions --reject-all

# Just see what was suggested
/review-suggestions --summary
```

## Modifying Accepted Meals

After accepting, you can still:
- Change servings: Updates quantity for shopping
- Add notes: Reminders for cooking day
- Remove: Take off the plan entirely

## Suggestion Expiration

Suggestions expire after 7 days if not reviewed. Expired suggestions:
- Are marked as `expired` in database
- Don't appear in review
- Can be regenerated with `/suggest-meals`

## Files to Reference

- `docs/epics/4-recipes/features/3-suggestion-review/PLAN.md` - Full spec
- `apps/api/src/modules/recipes/routers/suggestions.ts` - API routes
- `apps/web/src/modules/recipes/components/SuggestionReview.tsx` - Frontend

## Example Session

```
$ /suggest-meals next-week
Requesting meal suggestions for Jan 27 - Feb 2...
Done! 7 meals suggested. Run /review-suggestions to review.

$ /review-suggestions
[Shows first meal]
> A

[Shows second meal]
> S
New servings: 4
> A

[Shows third meal]
> R
Reason (optional): Not in the mood for fish
>

[Continues through all meals...]

Review Complete! 5 accepted, 2 rejected.

$ /meal-plan next-week
[Shows accepted meals]

$ /shopping-from-meals next-week
[Generates ingredient list]
```
