# Meal agent on Sonnet 5.5 — work of 7-8 October 2026

One place for the meal-logging work of these two days: what was decided, what shipped, what it measured, what's open.
Detail and raw numbers: the top sections of [FOOD_AGENT_MODELS.md](FOOD_AGENT_MODELS.md) and
[2026-10-08-search-speed.md](2026-10-08-search-speed.md). Codex's audit of the same pipeline is in
`docs/audit/2026-10-08-food-logging-speed.md` (not in git).

## Decisions (owner)

- **Sonnet 5.5 runs the meal agent and the first look at photos** (7 October). Flash stays for the second look, scene
  check, barcode locator, text list and fast routes; Jev for the fast routes' matching.
- The switch is a runtime flag, never an env var: `FeatureFlag.meal_agent_sonnet` = `all` (or `off`, or user ids;
  30 s cache). Off = the meal runs exactly as before on Flash.
- No word or phrase rules, in code or in prompts: a fix is structural or a general instruction, checked in several
  wordings and languages.
- A brand or variant the user names always wins over their habits; habits otherwise decide ("memory for free").
- Low-calorie drinks are logged: coffee and tea carry caffeine and micronutrients.
- Calorie claims in the words size the food ("290 cal everything bagel" → a generic bagel sized to 290 kcal): right.

## What shipped (amino-server, all on main and deployed)

| Commit | Change |
| --- | --- |
| cb0fd2e | Agent meals for the user alone carry the agent's name ("via ChatGPT") |
| 44e4569 | Sonnet agent + Sonnet first look behind `meal_agent_sonnet`; coverage text, cached system message, anyOf schema; two-foods rule in the final comparison (migration 20261015070000) |
| 71924d6 | Claude hosts: Anthropic, then Google Vertex, then Azure (global, same price, structured output) |
| 8b2f0bd | Flash: Google AI Studio first, Vertex second (Vertex stalled 139-183 s; half of Flash calls took 11 s) |
| d59f68e | Text meals get `mentionedFoods`: each listed food with its own catalogue candidates (the whole-sentence prefetch had lattes, no espresso) |
| d5245af | Catalogue search 3-30x faster on multi-word queries: trigram index on brand + name (migration 20261015080000) |
| 55f5564 | Late per-food searches still reach the agent (catalogue null → findFood); typical-serving rule skips scanned products |
| 3d5d0c5 | Habit foods: `user_food_habits` (180 days + favourites, before this meal, server only; migration 20261015090000) labelled on candidates, `yourUsual` on the clear habit |
| 2981f75 | No "my usual" phrase rule: an unbranded mention is the user's usual food |
| 7f578df | Fast route still answers when the agent fails first (`firstRoute`); per-food wait counted from the meal's start (4 s searches, 6 s list) |
| c602d9b | Named variants checked against the food's numbers by the model's judgement → USDA source when clearly contradicted; history matches are a mention's only candidates |

Eval tooling added: `MEAL_AGENT=sonnet|flash` (production path), `EVAL_FIRST_LOOK`, `EVAL_COMPARE_RULE`,
`EVAL_PROVIDER` in the evals; `scripts/meal-model-replay.ts` with `--text` (other words on the same meal), `DEBUG=1`
(schema failures) and `DEBUG=prompt` (what the agent received), printing components and stage times.

## Results

- Production path: text 17/17, history 15/15, photos 21-22/22 across runs (misses vary run to run: 30344's packaged
  sandwich logged as parts once, 30323's scanned milk at 100 g once, 30345's pita, below).
- Photos, 7 October (all 22 cases): all-Flash 21/22, p90 53 s; Sonnet agent + Sonnet first look 22/22, p90 28 s.
- Text meals median about 5.5 s (3.1 s before the per-food candidates, which stopped the dropped coffee); photo meals
  median 14-17 s.
- Real meals fixed along the way: "Coffee / espresso with 1 cup fat free milk" (espresso dropped → espresso 60 g +
  milk, 5/5); "7g ghee (my usual brand)" (generic → 4th & Heart, also for "7g ghee" and Spanish wording); "a cup of
  kefir" (generic → their Lifeway Lowfat Plain 3/3); "200 ml full fat kefir" (a lowfat generic → USDA Maple Hill
  whole-milk kefir); espresso + Oatly (their own "espresso shot" + Oatly 240 g as kept).
- Measured against 8 days of meals, Codex's other priority-1 scheduling fixes save under a second; the time is in
  Sonnet's model steps (about 2.5 s each) and the photo first look.
- Spend on evals and replays: about $1.95 on 7 October, about $6 on 8 October.

## Lessons

- A prompt line that competes with an older rule loses (the generic-food rule beat "prefer their history" 3/3):
  shape what the agent is shown instead (history matches as the only candidates).
- Counts alone didn't make "my usual" work; a computed `yourUsual` did.
- Test the structural change with other wordings on the same meal (`--text`) before calling it general.
- A replay must not see the meal itself in its history (`user_food_habits` takes the meal's time and id).

## Open

1. **Photo + text meals drop foods named only in the words, or set apart in the photo**: the Naya bowl's pita (on the
   lid behind the bowl, and named) dropped 2 in 6. The final check compares with the first look, not the words.
   (Proposed session.)
2. **Usual meals**: recurring groups of foods ("my usual breakfast"), beyond the 3 days of `recentMeals`. (Proposed
   session.)
3. **Catalogue foods that mislead**: generic "kefir" (1488, 163) carry lowfat values; Cucumber Combo (10372) is cucumber
   only; espresso 8713's serving list starts with cup and tsp. Read-only audit of generic foods whose numbers contradict
   their names, then fixes in place with the owner's OK.
4. **USDA search speed**: `search_usda_database` takes 0.5-1.8 s over 470k rows (index use to check), plus 0.6-1 s for
   the USDA API's nutrition. Matters when the agent goes to sources.
5. Search follow-ups: inline `food_identity_part` (about 3x cheaper per call), run the app's typo pass in parallel.
6. Watch live: amounts when none is given (espresso 0 / 5 / 237 g before the rules), packaged products photographed
   without a label, "same fairlife latte I had yesterday" when yesterday's was skim.
