-- Admin › food page: "similar foods" timed out (2026-10-07, food 15302). Ordering by the distance to a joined row's
-- embedding kept the planner off the vector index, so it read and sorted every food (about 1 s warm, past PostgREST's
-- 8 s limit when the table wasn't in memory). The target's embedding is now a scalar subquery (an InitPlan
-- parameter), which the index can order by: about 20 ms.
CREATE OR REPLACE FUNCTION public.admin_similar_foods(p_food_id integer, p_limit integer DEFAULT 12)
RETURNS TABLE(id integer, name text, brand text, "foodInfoSource" text, "kcalPerServing" double precision,
  "defaultServingWeightGram" double precision, "privateToUserId" uuid, similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $function$
  WITH target AS MATERIALIZED (SELECT t."bgeBaseEmbedding" AS embedding FROM public."FoodItem" t WHERE t.id = p_food_id)
  SELECT f.id, f.name, f.brand, f."foodInfoSource"::text, f."kcalPerServing", f."defaultServingWeightGram",
    f."privateToUserId", 1 - (f."bgeBaseEmbedding" <=> (SELECT embedding FROM target))
  FROM public."FoodItem" f
  WHERE f."bgeBaseEmbedding" IS NOT NULL AND f.id <> p_food_id AND (SELECT embedding FROM target) IS NOT NULL
  ORDER BY f."bgeBaseEmbedding" <=> (SELECT embedding FROM target)
  LIMIT least(greatest(p_limit, 1), 50);
$function$;

NOTIFY pgrst, 'reload schema';
