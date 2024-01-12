alter table "public"."IconQueue" drop column "requested_food_string";

alter table "public"."IconQueue" add column "requested_food_item_id" integer;

alter table "public"."IconQueue" add constraint "IconQueue_requested_food_item_id_fkey" FOREIGN KEY (requested_food_item_id) REFERENCES "FoodItem"(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."IconQueue" validate constraint "IconQueue_requested_food_item_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_top_foodicon_embedding_similarity(food_item_id integer)
 RETURNS TABLE(food_icon_id integer, cosine_similarity double precision)
 LANGUAGE sql
AS $function$
    SELECT 
        fi.id AS food_icon_id, 
        1 - (fi."bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "FoodItem" WHERE id = food_item_id)) AS cosine_similarity
    FROM "FoodIcon" fi
    WHERE fi."bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$function$
;


