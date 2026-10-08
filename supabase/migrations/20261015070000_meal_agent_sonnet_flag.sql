-- Sonnet 5.5 runs the meal agent and the first look at photos (FOOD_AGENT_MODELS.md, 7 October: photos 22/22, p90 28 s
-- against Flash's 53 s). The flag is the instant switch back to Flash: 'off', or a user list ("<uuid>,<uuid>"), no deploy.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('meal_agent_sonnet', 'all')
  ON CONFLICT (name) DO NOTHING;
