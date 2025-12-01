# Meal Plan Viewer

View and manage your accepted meal plan.

## Usage

```
/meal-plan [date-range] [options]
```

## Arguments

- `date-range`: Optional. Format: `YYYY-MM-DD to YYYY-MM-DD` or shortcuts
  - `today`, `tomorrow`, `this-week`, `next-week`
  - If not provided, shows current week

## Options

- `--calendar`: Show in calendar grid format
- `--list`: Show in simple list format (default)
- `--detail`: Include ingredients and instructions
- `--json`: Output as JSON

## Views

### List View (default)

```
Meal Plan: Jan 20-26, 2025

Monday, Jan 20
  Dinner: Lemon Herb Chicken (4 servings, 60 min)
          Mediterranean | Effort: 3/5

Tuesday, Jan 21
  Dinner: Vegetarian Stir Fry (2 servings, 25 min)
          Asian | Effort: 2/5

Wednesday, Jan 22
  Dinner: Spaghetti Carbonara (2 servings, 30 min)
          Italian | Effort: 3/5

Thursday, Jan 23
  [No meal planned]

Friday, Jan 24
  Dinner: Grilled Salmon (4 servings, 35 min)
          American | Effort: 2/5

Saturday, Jan 25
  Dinner: Beef Bourguignon (6 servings, 180 min)
          French | Effort: 5/5

Sunday, Jan 26
  Dinner: Roast Chicken (4 servings, 90 min)
          American | Effort: 3/5

---
6 meals planned | Shopping list: Not generated
```

### Detail View

```
Monday, Jan 20 - Lemon Herb Chicken

Source: NYT Cooking
Time: 15 min prep + 45 min cook = 60 min total
Servings: 4 | Effort: 3/5

Ingredients:
- 2 lbs chicken thighs
- 2 lemons
- 4 sprigs fresh rosemary
- 4 cloves garlic
- 2 tbsp olive oil

Instructions:
1. Preheat oven to 400F
2. Season chicken with salt and pepper
3. ...

Tags: one-pan, protein, weeknight
```

## Actions

From the meal plan view, you can:

1. **Remove a meal**: `/meal-plan remove Monday` or by date
2. **Swap meals**: `/meal-plan swap Monday Wednesday`
3. **Change servings**: `/meal-plan servings Monday 4`
4. **View recipe**: `/meal-plan detail Monday`
5. **Generate shopping**: `/shopping-from-meals this-week`
6. **Get more suggestions**: `/suggest-meals` for empty days

## Data Source

Reads from `accepted_meals` table:
- Meals that were accepted from suggestions
- Includes denormalized recipe data
- Tracks if shopping list was generated

## Files to Reference

- `docs/epics/4-recipes/features/4-accepted-meals-view/PLAN.md` - Full spec
- `apps/api/src/modules/recipes/routers/meals.ts` - API routes
- `apps/web/src/modules/recipes/components/MealPlanView.tsx` - Frontend

## Quick Actions

```bash
# What's for dinner tonight?
/meal-plan today

# See the full week
/meal-plan this-week

# Plan is empty? Get suggestions
/suggest-meals this-week

# Ready to shop? Generate list
/shopping-from-meals this-week
```

## Integration with Other Commands

```
/suggest-meals     --> Accept/reject --> /meal-plan --> /shopping-from-meals
                                              |
                                              v
                                    View what's planned
```
