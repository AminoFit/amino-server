# Catalogue search speed — 8 October 2026

Why searches took a second or more, and the fix. Measured on production, read-only (tests on a temporary copy of
`FoodItem`, 14,131 rows, rolled back).

## Where the time went

`search_meal_food_catalogue` serves the app's search, MCP `search_foods`, the meal agent's `findFood` and the per-food
candidates Sonnet gets on text meals (`mentionedFoods`). One-word queries took 30-110 ms; queries of two or more words
took 0.9-1.5 s, warm.

The function unions five candidate branches. For "fat free milk":

| Branch | Time |
| --- | ---: |
| Trigram match on the name | 39 ms |
| Exact brand | 20 ms |
| Alias | 20 ms |
| Every word in the name (leads with an indexed `LIKE`) | 38 ms |
| **Words split between brand and name** ("fairlife" + "2% ... milk") | **1,003 ms** |

The last branch only runs for two or more words, has no index it can use, and calls `food_identity_part` twice on every
row. That function costs 777 ms over all rows (the same expression inline: 274 ms): its `SET search_path` keeps Postgres
from inlining it.

Per stage in the app/MCP path (`searchFoodsForUser`): text search 0.7-1.15 s on multi-word queries, and the typo pass
(the same function with a looser threshold, run after the first) another 0.8-1.5 s when few results came back, so
"pechuga de pollo" took 2.1 s and "chiken brest" 2.6 s. Meaning search (60-200 ms), the user's own foods and loading the
results (50-160 ms) are small.

## Fix (migration 20261015080000)

A trigram index on the same brand + name text, and the branch leads with the longest needed word through it, the way
the name-only branch already does. Results and order identical on 10 queries at both thresholds (English, Spanish,
German, Japanese, brands, numbers, a typo):

| Query | Normal, old → new | Typo pass, old → new |
| --- | --- | --- |
| fat free milk | 1,003 → 249 ms | 1,375 → 519 ms |
| Coffee / espresso | 817 → 41 ms | 1,181 → 159 ms |
| fairlife 2% milk | 889 → 27 ms | 1,124 → 187 ms |
| pechuga de pollo | 758 → 21 ms | 1,028 → 22 ms |
| chiken brest | 1,026 → 97 ms | 1,324 → 676 ms |
| Oatly barista oat milk | 1,223 → 21 ms | 1,120 → 88 ms |
| kirkland greek yogurt | 1,217 → 101 ms | 1,048 → 321 ms |
| espresso, Hafermilch, ゆで卵 | 20-106 → 19-27 ms | unchanged |

## Applied 8 October

Live after the migration, end to end (app/MCP `searchFoodsForUser`, then the meal agent's `searchFoods`):

| Query | App/MCP before → after | Agent before → after |
| --- | --- | --- |
| Coffee / espresso | 819 → 199 ms | 1,303 → 275 ms |
| fat free milk | 1,165 → 534 ms | 1,216 → 475 ms |
| pechuga de pollo | 2,071 → 328 ms | 1,172 → 289 ms |
| fairlife 2% milk | 954 → 223 ms | 1,096 → 241 ms |
| chiken brest | 2,603 → 914 ms | 1,200 → 362 ms |

## Not done (smaller, later)

- `food_identity_part` without `SET search_path` (it qualifies every name already) would let Postgres inline it: about
  3x cheaper per call, which is most of what is left in the typo pass (500-700 ms for broad queries) and the ranking.
  Needs a check that the expression indexes still match after inlining.
- The app's typo pass waits for the first pass; it could start in parallel when the query has several words.
