-- The photo fast route (a text-free photo of a single food, matched by Jev from the first look while the agent starts)
-- is on for everyone. The flag is the instant off switch: 'off', or a user list ("<uuid>,<uuid>"), with no deploy.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('meal_photo_fast_route', 'all')
  ON CONFLICT (name) DO NOTHING;
