-- Runtime feature flags: read by the server at request time (short cache), so a
-- rollout or kill switch takes effect without an environment change or redeploy.
CREATE TABLE IF NOT EXISTS public."FeatureFlag" (
  name text PRIMARY KEY,
  value text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."FeatureFlag" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."FeatureFlag" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public."FeatureFlag" TO service_role;
-- The meal agent resolves photo logs; text follows once the photo run is clean.
INSERT INTO public."FeatureFlag"(name, value) VALUES ('meal_resolver_adopt', 'photos')
  ON CONFLICT (name) DO NOTHING;
