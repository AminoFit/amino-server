-- Scans as their own field in the MCP meal view (2026-10-16, after 20261016120000). `text` is now the meal's words only,
-- and `scans` lists the products scanned for it: [{barcode, count, food, brand, itemIds}], the item ids being the meal's
-- foods that scan resolved to. update_meal takes `text` and `scans` separately (src/mcp/mealScans.ts), so an agent
-- editing the words can't drop or garble a scan, and "[scanned: …]" labels never reach a stored meal.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.mcp_meal_json(m public."Message", p_tz text, p_all boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH RECURSIVE keys AS (
    SELECT key, ord FROM unnest(CASE WHEN p_all THEN ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG',
      'transFatG', 'unsatFatG', 'polyunsatFatG', 'monounsatFatG', 'fiberG', 'sugarG', 'addedSugarG', 'waterMl',
      'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'vitaminB1Mg', 'vitaminB2Mg',
      'vitaminB3Mg', 'vitaminB5Mg', 'vitaminB6Mg', 'vitaminB7Mcg', 'vitaminB9Mcg', 'vitaminB12Mcg', 'calciumMg',
      'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'sodiumMg', 'zincMg', 'copperMg', 'manganeseMg',
      'seleniumMcg', 'iodineMcg', 'cholesterolMg', 'omega3Mg', 'omega6Mg', 'caffeineMg', 'alcoholG']
      ELSE ARRAY['kcal', 'proteinG', 'carbG', 'totalFatG', 'satFatG', 'fiberG', 'sugarG', 'sodiumMg'] END)
      WITH ORDINALITY AS k(key, ord)
  ), tokens AS (
    -- Each scanned product in the text ("2 × [barcode:…]"), its digits padded to the catalogue's 14-digit GTIN.
    SELECT t.ord, coalesce(nullif(t.match[2], '')::int, 1) AS count, pg_catalog.lpad(t.match[3], 14, '0') AS gtin
    FROM pg_catalog.regexp_matches(coalesce(m.content, ''), '(([0-9]+)\s*[×xX]\s*)?\[barcode:\s*([0-9]{6,14})\]', 'gi')
      WITH ORDINALITY AS t(match, ord)
  ), foods AS (
    SELECT l.id, l."foodItemId" AS food_id, f.name, f.brand, l."servingAmount" AS amount,
      coalesce(l."loggedUnit", s."servingName") AS unit, l.grams, to_jsonb(l) AS row, f."partialNutrients" AS partial,
      -- The scanned code this food came from: its own barcode, or one of its package barcodes.
      (SELECT t.gtin FROM tokens t WHERE t.gtin = pg_catalog.lpad(f.gtin, 14, '0')
          OR EXISTS (SELECT 1 FROM public."FoodBarcode" b WHERE b."foodItemId" = f.id AND b.gtin = t.gtin)
        ORDER BY t.ord LIMIT 1) AS barcode
    FROM public."LoggedFoodItem" l
    LEFT JOIN public."FoodItem" f ON f.id = l."foodItemId"
    LEFT JOIN public."Serving" s ON s.id = l."servingId"
    WHERE l."messageId" = m.id AND l."deletedAt" IS NULL
  ), shape AS (
    SELECT EXISTS (SELECT 1 FROM tokens) AS scanned,
      -- The words around the scans ("2 × " before a token is part of the scan), as mealScans.ts splits them.
      pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(coalesce(m.content, ''),
        '([0-9]+\s*[×xX]\s*)?\[barcode:\s*[0-9]{6,14}\]', ' ', 'gi'), '\s+', ' ', 'g')) AS words
  ), eaten AS (
    SELECT coalesce(m."consumedOn", m."createdAt")::timestamp AS utc
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'eatenAt', to_char(e.utc, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'localDate', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'YYYY-MM-DD'),
    'localTime', to_char((e.utc AT TIME ZONE 'UTC') AT TIME ZONE p_tz, 'HH24:MI'),
    'text', nullif(sh.words, ''),
    -- The products scanned for the meal, one entry per product, with the foods each resolved to.
    'scans', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('barcode', g.gtin, 'count', g.count,
        'food', (SELECT f.name FROM foods f WHERE f.barcode = g.gtin ORDER BY f.id LIMIT 1),
        'brand', (SELECT nullif(pg_catalog.btrim(f.brand), '') FROM foods f WHERE f.barcode = g.gtin ORDER BY f.id LIMIT 1),
        'itemIds', (SELECT jsonb_agg(f.id ORDER BY f.id) FROM foods f WHERE f.barcode = g.gtin))) ORDER BY g.first)
      FROM (SELECT t.gtin, sum(t.count)::int AS count, min(t.ord) AS first FROM tokens t GROUP BY t.gtin) g),
    'input', CASE WHEN m."agentClientId" IS NOT NULL THEN 'agent'
      WHEN NOT sh.scanned THEN CASE
        WHEN m.hasimages THEN CASE WHEN btrim(coalesce(m.content, '')) <> '' THEN 'photo+text' ELSE 'photo' END
        WHEN m."isAudio" THEN 'voice' ELSE 'text' END
      WHEN m.hasimages THEN CASE WHEN sh.words <> '' THEN 'photo+text+barcode' ELSE 'photo+barcode' END
      WHEN m."isAudio" THEN 'voice+barcode'
      WHEN sh.words <> '' THEN 'text+barcode' ELSE 'barcode' END,
    'loggedBy', CASE WHEN m."agentClientId" IS NOT NULL THEN coalesce(m."agentName", 'an AI agent') END,
    'status', CASE m.status::text WHEN 'RESOLVED' THEN 'logged' WHEN 'FAILED' THEN 'failed' ELSE 'processing' END,
    'totals', (SELECT jsonb_object_agg(t.key, t.total ORDER BY t.ord) FROM (
        SELECT k.key, k.ord, pg_catalog.trim_scale(round(sum((f.row->>k.key)::numeric), 2)) AS total
        FROM keys k CROSS JOIN foods f GROUP BY k.key, k.ord) t WHERE t.total IS NOT NULL),
    'items', coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f.id, 'foodId', f.food_id, 'food', f.name,
        'brand', f.brand, 'barcode', f.barcode, 'amount', f.amount, 'unit', f.unit,
        'grams', pg_catalog.trim_scale(round(f.grams::numeric, 1))))
        || coalesce((SELECT jsonb_object_agg(k.key, pg_catalog.trim_scale(round((f.row->>k.key)::numeric, 2))
          ORDER BY k.ord) FROM keys k WHERE f.row->>k.key IS NOT NULL), '{}'::jsonb)
        -- A recipe's values that only some of its ingredients record: lower bounds, not the food's amount.
        || coalesce((SELECT jsonb_build_object('partial', jsonb_object_agg(k.key,
            (f.partial->k.key->>0) || ' of ' || (f.partial->k.key->>1) || ' ingredients' ORDER BY k.ord))
          FROM keys k WHERE f.row->>k.key IS NOT NULL AND f.partial ? k.key HAVING count(*) > 0), '{}'::jsonb)
      ORDER BY f.id) FROM foods f), '[]'::jsonb),
    -- The meal's totals that only some of its foods (or their ingredients) record.
    'incomplete', (SELECT jsonb_object_agg(k.key, c.known || ' of ' || c.total || ' foods') FROM keys k
        CROSS JOIN LATERAL (SELECT count(*) AS total,
          count(*) FILTER (WHERE f.row->>k.key IS NOT NULL AND NOT coalesce(f.partial ? k.key, false)) AS known,
          count(*) FILTER (WHERE f.row->>k.key IS NOT NULL) AS shown FROM foods f) c
        WHERE c.shown > 0 AND c.known < c.total)))
  FROM eaten e, shape sh;
$function$;
