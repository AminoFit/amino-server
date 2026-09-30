-- The text fast route (Jev matches a plain text meal's items while the agent starts) is on for everyone. The flag is
-- the instant off switch: set it to 'off', or to a user list ("<uuid>,<uuid>"), with no deploy.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('meal_text_fast_route', 'all')
  ON CONFLICT (name) DO NOTHING;
