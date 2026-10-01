-- The user's own foods and recipes that a meal's text names (plan phase 4): the agent sees them only when relevant.
-- word_similarity(name, text) is how much of the food's name appears in the meal text ("Chicken pasta" in "1.5
-- portions of my chicken pasta" is 1.0; in "pasta at Olive Garden" about 0.5). Recipes only behind recipes_in_agent;
-- archived versions never. The agent's recipe check (Jev) still decides whether the text means the recipe. Among
-- equally good name matches the most recently edited comes first (owner: on a clash, the latest).
CREATE OR REPLACE FUNCTION public.search_own_foods(p_text text, p_user_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(id integer, name text, brand text, score real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT f.id, f.name, f.brand,
    extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) AS score
  FROM public."FoodItem" f
  WHERE p_user_id IS NOT NULL AND f."privateToUserId" = p_user_id AND f."archivedAt" IS NULL
    AND (f."recipePortions" IS NULL OR public.user_flag_enabled('recipes_in_agent', p_user_id))
    AND length(public.food_identity_part(p_text)) BETWEEN 1 AND 2000
    AND extensions.word_similarity(public.food_identity_part(f.name), public.food_identity_part(p_text)) >= 0.6
  ORDER BY score DESC, f."lastUpdated" DESC, f.id DESC
  LIMIT least(greatest(p_limit, 1), 10)
$function$;
REVOKE ALL ON FUNCTION public.search_own_foods(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_own_foods(text, uuid, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
