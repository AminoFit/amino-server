-- Jev photo shadow test (2026-10-15; dropped, or the pipeline changed, after a week's report). For each photo meal the
-- worker asks Jev, with the photos, which of the first look's catalogue candidates each found food is, while the meal
-- agent works as usual; one row per found food sets Jev's pick, confidence and latency next to the plan's choice. Nothing
-- reads it back into a meal. Only the server writes and reads it (like MealRun); a user's rows go with the user.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public."PhotoJevShadow" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "operationId" uuid NOT NULL,
  "messageId" integer NOT NULL,
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  -- The plan's route (the agent's model, photo-fast-route, …), the agent kind and the plan's outcome.
  route text NOT NULL,
  agent text,
  outcome text NOT NULL,
  "mealMs" integer NOT NULL,
  "agentSteps" integer NOT NULL,
  "photoCount" integer NOT NULL,
  "sentPhotos" integer NOT NULL,
  -- The first look's food and the candidates Jev chose between: [{id, name, brand, mine?}].
  food text NOT NULL,
  detail text,
  candidates jsonb NOT NULL,
  "jevModel" text NOT NULL,
  "jevStatus" text NOT NULL,
  "jevChoice" text,
  "jevConfidence" real,
  "jevMs" integer NOT NULL,
  -- When all of the meal's Jev answers were in, from the meal's start (against mealMs: the time a switch could save).
  "jevReadyMs" integer NOT NULL,
  "jevCostUsd" numeric(12,8),
  -- The candidate the final plan logged ("food_<id>"), "none" or "several"; and every food the plan logged.
  "agentChoice" text NOT NULL,
  "loggedFoods" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."PhotoJevShadow" IS 'Jev photo shadow test (2026-10-15): Jev''s pick among a photo meal''s first-look candidates next to the plan''s choice. Temporary.';
CREATE INDEX IF NOT EXISTS "PhotoJevShadow_createdAt_idx" ON public."PhotoJevShadow"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PhotoJevShadow_userId_idx" ON public."PhotoJevShadow"("userId");

ALTER TABLE public."PhotoJevShadow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."PhotoJevShadow" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."PhotoJevShadow_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public."PhotoJevShadow" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public."PhotoJevShadow_id_seq" TO service_role;
