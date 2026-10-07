-- Meals the actor logged for someone, a page at a time (newest first): the app shows them on their own screen and
-- loads older pages as it scrolls, instead of one capped list on the person's page. The cursor is the last meal of the
-- previous page (consumedOn, id). Same visibility as before: only while the actor may still log for them.
DROP FUNCTION IF EXISTS public.meals_logged_for(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.meals_logged_for(p_actor uuid, p_target uuid, p_limit integer DEFAULT 50,
  p_before timestamp DEFAULT NULL, p_before_id integer DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT coalesce(jsonb_agg(x.row ORDER BY x."consumedOn" DESC, x.id DESC), '[]') FROM (
    SELECT m."consumedOn", m.id, jsonb_build_object('id', m.id, 'consumedOn', m."consumedOn", 'content', m.content,
      'kcal', coalesce(sum(l.kcal), 0), 'proteinG', coalesce(sum(l."proteinG"), 0), 'carbG', coalesce(sum(l."carbG"), 0),
      'totalFatG', coalesce(sum(l."totalFatG"), 0)) row
    FROM public."Message" m LEFT JOIN public."LoggedFoodItem" l ON l."messageId" = m.id AND l."deletedAt" IS NULL
    WHERE m."userId" = p_target AND m."loggedByUserId" = p_actor AND m."deletedAt" IS NULL AND public.can_log_for(p_actor, p_target)
      AND (p_before IS NULL OR (m."consumedOn", m.id) < (p_before, coalesce(p_before_id, 2147483647)))
    GROUP BY m.id ORDER BY m."consumedOn" DESC, m.id DESC LIMIT least(greatest(p_limit, 1), 200)) x
$function$;

REVOKE ALL ON FUNCTION public.meals_logged_for(uuid, uuid, integer, timestamp, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meals_logged_for(uuid, uuid, integer, timestamp, integer) TO service_role;
