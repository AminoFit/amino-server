-- Goal history (2026-10-06): the goals that applied on each day, so past days are judged against the goals the user had
-- then, not today's. One row per user per day the goals changed, in the user's own time zone; the goals for a day are the
-- latest row on or before it. The app syncs these rows (Watermelon goal_history) for the Progress tab's charts.
--
-- Rows are written by a trigger on "User", so every way goals change is recorded: the app's Edit goals and onboarding,
-- the web settings, agents over MCP. Several changes in one day keep the last one for that day.

CREATE TABLE IF NOT EXISTS public."UserGoalHistory" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "effectiveOn" date NOT NULL,
  "calorieGoal" integer,
  "proteinGoal" integer,
  "carbsGoal" integer,
  "fatGoal" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "effectiveOn")
);
-- The app pulls rows changed since its last sync.
CREATE INDEX IF NOT EXISTS "UserGoalHistory_userId_updatedAt_idx" ON public."UserGoalHistory"("userId", "updatedAt");

ALTER TABLE public."UserGoalHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read your own goal history" ON public."UserGoalHistory";
CREATE POLICY "Read your own goal history" ON public."UserGoalHistory" FOR SELECT
  USING ("userId" = (SELECT auth.uid()));
-- Only the trigger writes (as the table owner); users can't insert, change or delete history directly.

-- Records the user's goals against today in their time zone.
CREATE OR REPLACE FUNCTION public.record_goal_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW."calorieGoal" IS NULL AND NEW."proteinGoal" IS NULL AND NEW."carbsGoal" IS NULL AND NEW."fatGoal" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."calorieGoal" IS NOT DISTINCT FROM OLD."calorieGoal"
    AND NEW."proteinGoal" IS NOT DISTINCT FROM OLD."proteinGoal" AND NEW."carbsGoal" IS NOT DISTINCT FROM OLD."carbsGoal"
    AND NEW."fatGoal" IS NOT DISTINCT FROM OLD."fatGoal" THEN
    RETURN NEW;
  END IF;
  INSERT INTO public."UserGoalHistory" ("userId", "effectiveOn", "calorieGoal", "proteinGoal", "carbsGoal", "fatGoal")
  VALUES (NEW.id, (pg_catalog.now() AT TIME ZONE coalesce(public.valid_timezone(NEW."tzIdentifier"), 'UTC'))::date,
    NEW."calorieGoal", NEW."proteinGoal", NEW."carbsGoal", NEW."fatGoal")
  ON CONFLICT ("userId", "effectiveOn") DO UPDATE SET "calorieGoal" = EXCLUDED."calorieGoal",
    "proteinGoal" = EXCLUDED."proteinGoal", "carbsGoal" = EXCLUDED."carbsGoal", "fatGoal" = EXCLUDED."fatGoal",
    "updatedAt" = pg_catalog.now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "User_goal_history" ON public."User";
CREATE TRIGGER "User_goal_history" AFTER INSERT OR UPDATE OF "calorieGoal", "proteinGoal", "carbsGoal", "fatGoal"
  ON public."User" FOR EACH ROW EXECUTE FUNCTION public.record_goal_history();

-- Backfill: each user's current goals, from their first logged day (else today). Earlier changes weren't kept, so days
-- before that use the earliest goals known.
INSERT INTO public."UserGoalHistory" ("userId", "effectiveOn", "calorieGoal", "proteinGoal", "carbsGoal", "fatGoal")
SELECT u.id,
  coalesce((SELECT min((coalesce(m."consumedOn", m."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE z.tz)::date)
    FROM public."Message" m WHERE m."userId" = u.id AND m."deletedAt" IS NULL), (pg_catalog.now() AT TIME ZONE z.tz)::date),
  u."calorieGoal", u."proteinGoal", u."carbsGoal", u."fatGoal"
FROM public."User" u, LATERAL (SELECT coalesce(public.valid_timezone(u."tzIdentifier"), 'UTC') AS tz) z
WHERE u."calorieGoal" IS NOT NULL OR u."proteinGoal" IS NOT NULL OR u."carbsGoal" IS NOT NULL OR u."fatGoal" IS NOT NULL
ON CONFLICT ("userId", "effectiveOn") DO NOTHING;
