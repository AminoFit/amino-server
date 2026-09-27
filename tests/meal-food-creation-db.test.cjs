const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

// Runs the real migrations against a disposable Postgres (pgvector is stubbed).
const connectionString=process.env.AMINO_FOOD_TEST_DATABASE_URL;
const migrations=['20260925205900_agent_estimate_food_source.sql','20260925210000_catalogue_food_creation.sql',
  '20260926010000_label_food_source.sql','20260926010100_catalogue_gtin_enrichment.sql','20260926020000_serving_units.sql','20260926030000_serving_dedupe.sql',
  '20260927010000_private_foods.sql']
  .map(file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
const fixture=`
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$BEGIN CREATE DOMAIN extensions.vector AS text; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE TYPE public."FoodInfoSource" AS ENUM ('User','Online','USDA'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE IF NOT EXISTS public."foodEmbeddingCache" (id serial PRIMARY KEY, "bgeBaseEmbedding" extensions.vector);
CREATE TABLE IF NOT EXISTS public."FoodItem" (id serial PRIMARY KEY, name text NOT NULL, brand text,
  "defaultServingWeightGram" float8, "kcalPerServing" float8 NOT NULL DEFAULT 0, "proteinPerServing" float8 NOT NULL DEFAULT 0,
  "carbPerServing" float8 NOT NULL DEFAULT 0, "totalFatPerServing" float8 NOT NULL DEFAULT 0, "fiberPerServing" float8,
  "sugarPerServing" float8, "satFatPerServing" float8, "isLiquid" boolean NOT NULL DEFAULT false, "userId" uuid,
  "messageId" integer, "foodInfoSource" public."FoodInfoSource" NOT NULL DEFAULT 'User', "externalId" text,
  "bgeBaseEmbedding" extensions.vector, description text, verified boolean NOT NULL DEFAULT false,
  "UPC" bigint, "knownAs" text[] DEFAULT ARRAY[]::text[],
  UNIQUE (name, brand), UNIQUE ("externalId", "foodInfoSource"));
CREATE TABLE IF NOT EXISTS public."Serving" (id serial PRIMARY KEY, "foodItemId" integer REFERENCES public."FoodItem"(id),
  "servingName" text NOT NULL, "servingWeightGram" float8, "defaultServingAmount" numeric(10,2) DEFAULT 1);`;

const food=(name,brand,extra={})=>({name,brand,defaultServingWeightGram:100,kcal:130,proteinG:3,carbG:28,totalFatG:0.3,
  foodInfoSource:'Online',source:'https://example.test',bgeBaseEmbedding:'[0.1]',...extra});
const create=(client,value,servings=[{name:'cup',grams:158}])=>client.query(
  'select food_id,created from public.create_catalogue_food($1,$2,$3,$4)',[null,null,value,JSON.stringify(servings)]).then(r=>r.rows[0]);
const createFull=(client,value,servings=[])=>client.query(
  'select * from public.create_catalogue_food($1,$2,$3,$4)',[null,null,value,JSON.stringify(servings)]).then(r=>r.rows[0]);

test('catalogue food creation never duplicates an existing identity or source',
  {skip:!connectionString&&'Set AMINO_FOOD_TEST_DATABASE_URL for a disposable test database'},async()=>{
    const a=new Client({connectionString}),b=new Client({connectionString});
    await Promise.all([a.connect(),b.connect()]);
    try {
      await a.query(fixture);
      for (const sql of migrations) await a.query(sql);
      const tag=`t${Date.now()}`;
      const first=await create(a,food(`Tuna Ceviche ${tag}`,null));
      assert.equal(first.created,true);
      assert.equal((await a.query('select count(*)::int n from public."Serving" where "foodItemId"=$1',[first.food_id])).rows[0].n,1);
      // Case, accents, punctuation, spacing and empty-vs-null brand are the same identity.
      for (const [name,brand] of [[`tuna  ceviché ${tag}`,null],[`TUNA-CEVICHE ${tag}!`,''],[` Tuna Ceviche ${tag} `,'  ']]) {
        assert.deepEqual(await create(a,food(name,brand)),{food_id:first.food_id,created:false},name);
      }
      // A different brand or preparation is a different food.
      assert.equal((await create(a,food(`Tuna Ceviche ${tag}`,'Ocean Co'))).created,true);
      assert.equal((await create(a,food(`Tuna Ceviche in oil ${tag}`,null))).created,true);
      // The same external source record is never imported twice, even under another name.
      const usda=await create(a,food(`Brown Rice ${tag}`,'Acme',{foodInfoSource:'USDA',externalId:`fdc-${tag}`}));
      assert.equal(usda.created,true);
      assert.deepEqual(await create(a,food(`Acme Wholegrain Rice ${tag}`,'Acme',{foodInfoSource:'USDA',externalId:`fdc-${tag}`})),
        {food_id:usda.food_id,created:false});
      assert.equal((await a.query('select verified from public."FoodItem" where id=$1',[usda.food_id])).rows[0].verified,true);
      // Two workers racing on spelling variants of one new food produce exactly one row.
      const racers=await Promise.all([create(a,food(`Poke Bowl ${tag}`,null)),create(b,food(`poké bowl ${tag}`,null))]);
      assert.equal(racers[0].food_id,racers[1].food_id);
      assert.deepEqual(racers.map(r=>r.created).sort(),[false,true]);
      assert.equal((await a.query(`select count(*)::int n from public."FoodItem" where public.food_identity_key(name,brand)=public.food_identity_key($1,null)`,
        [`Poke Bowl ${tag}`])).rows[0].n,1);
      await assert.rejects(create(a,food('x',null)),/Invalid catalogue food/);
      await assert.rejects(create(a,food(`No weight ${tag}`,null,{defaultServingWeightGram:0})),/Invalid catalogue food/);
      const estimate=await create(a,food(`Grandma lasagna ${tag}`,null,{foodInfoSource:'AgentEstimate'}));
      assert.equal((await a.query('select "foodInfoSource"::text s, verified from public."FoodItem" where id=$1',[estimate.food_id])).rows[0].s,'AgentEstimate');
      // Barcodes are normalised GTIN-14 and survive a lost leading zero.
      assert.equal((await a.query("select public.gtin14('16000229969') g")).rows[0].g,'00016000229969');
      assert.equal((await a.query("select public.gtin14('016000229968') g")).rows[0].g,null);

      // The same barcode under another name is the existing food, enriched rather than duplicated.
      const cereal=await create(a,food(`Cheerios Protein Cookies Creme ${tag}`,'Cheerios',
        {gtin:'00016000229969',defaultServingWeightGram:37,kcal:150,proteinG:8,carbG:24,totalFatG:2.5}),[{name:'cup',grams:37,amount:1}]);
      const half=await create(a,food(`Oat Flakes ${tag}`,null,{defaultServingWeightGram:20}),[{name:'cup',grams:20,amount:0.5}]);
      assert.deepEqual((await a.query('select "servingName","defaultServingAmount"::float8 amount from public."Serving" where "foodItemId"=$1',[half.food_id])).rows,
        [{servingName:'cup',amount:0.5}],'the unit and its amount are stored separately');
      const again=await createFull(a,food(`General Mills Protein Cookies & Creme Cereal ${tag}`,'General Mills',
        {gtin:'16000229969',defaultServingWeightGram:55,kcal:223,proteinG:11.9,carbG:35.7,totalFatG:3.7,fiberG:3}),
        [{name:'Cup',grams:37},{name:'bowl',grams:55}]);
      assert.deepEqual([again.food_id,again.created],[cereal.food_id,false]);
      assert.deepEqual(again.enrichment.added,['nutrients','serving:bowl','alias']);
      const enriched=(await a.query('select "fiberPerServing","kcalPerServing","knownAs" from public."FoodItem" where id=$1',[cereal.food_id])).rows[0];
      assert.equal(Math.round(enriched.fiberPerServing*100)/100,2.02,'filled at this food\'s 37 g basis');
      assert.equal(enriched.kcalPerServing,150,'existing calories are never overwritten');
      assert.equal(enriched.knownAs.length,1);
      assert.equal((await a.query('select count(*)::int n from public."Serving" where "foodItemId"=$1',[cereal.food_id])).rows[0].n,2);

      // The same weight under another name is a serving the food already has.
      const renamed=await a.query('select public.enrich_catalogue_food($1,$2,$3) r',[cereal.food_id,
        JSON.stringify(food('x',null,{defaultServingWeightGram:37,kcal:150})),JSON.stringify([{name:'1 cup (37 g)',grams:37,amount:1}])]);
      assert.ok(!renamed.rows[0].r.added.some(entry=>entry.startsWith('serving:')));
      // A disagreeing energy density records a conflict and changes nothing.
      const conflict=await createFull(a,food(`Cheerios Protein Cookies Creme ${tag}`,'Cheerios',
        {defaultServingWeightGram:37,kcal:250,proteinG:8,carbG:24,totalFatG:2.5,sugarG:12}),[{name:'box',grams:500}]);
      assert.equal(conflict.enrichment.conflict,true);
      assert.equal((await a.query('select count(*)::int n from public."FoodItemConflict" where "foodItemId"=$1',[cereal.food_id])).rows[0].n,1);
      assert.equal((await a.query('select "sugarPerServing" from public."FoodItem" where id=$1',[cereal.food_id])).rows[0].sugarPerServing,null);

      // A barcode owned by another food is never attached a second time.
      const other=await create(a,food(`Plain Oats ${tag}`,null,{gtin:'04006381333931'}));
      const stolen=await a.query('select public.enrich_catalogue_food($1,$2,$3) r',[cereal.food_id,
        JSON.stringify(food('x',null,{gtin:'4006381333931',defaultServingWeightGram:37,kcal:150})),'[]']);
      assert.ok(!stolen.rows[0].r.added.includes('gtin'));
      assert.equal((await a.query('select gtin from public."FoodItem" where id=$1',[other.food_id])).rows[0].gtin,'04006381333931');
    } finally {await Promise.all([a.end(),b.end()])}
  });

test('private foods belong to their owner: per-owner names, no cross-user reuse, and hidden from other users',
  {skip:!connectionString&&'Set AMINO_FOOD_TEST_DATABASE_URL for a disposable test database'},async()=>{
    const client=new Client({connectionString});
    await client.connect();
    try {
      await client.query(fixture);
      for (const sql of migrations) await client.query(sql);
      const tag=`p${Date.now()}`,alice='00000000-0000-4000-8000-00000000000a',bob='00000000-0000-4000-8000-00000000000b';
      const make=(user,value,priv)=>client.query('select * from public.create_catalogue_food($1,$2,$3,$4,$5)',
        [user,null,value,JSON.stringify([{name:'slice',grams:250}]),priv]).then(r=>r.rows[0]);
      const lasagna=food(`Grandma's lasagna ${tag}`,null,{foodInfoSource:'User'});
      const a=await make(alice,lasagna,true), b=await make(bob,lasagna,true);
      assert.equal(a.created,true); assert.equal(b.created,true);
      assert.notEqual(a.food_id,b.food_id,'each user has their own');
      assert.deepEqual((await make(alice,lasagna,true)).food_id,a.food_id,'the owner reuses their own private food');
      const shared=await make(alice,lasagna,false);
      assert.equal(shared.created,true,'a shared creation never returns a private food');
      const rice=food(`Jasmine rice ${tag}`,null);
      const riceShared=await make(null,rice,false);
      assert.deepEqual(await make(bob,rice,true),{food_id:riceShared.food_id,created:false,enrichment:(await make(bob,rice,true)).enrichment},
        'a private creation reuses the shared food that already exists');
      const owners=(await client.query('select id,"privateToUserId" from public."FoodItem" where id = any($1)',[[a.food_id,b.food_id,shared.food_id]])).rows;
      assert.deepEqual(Object.fromEntries(owners.map(r=>[r.id,r.privateToUserId])),{[a.food_id]:alice,[b.food_id]:bob,[shared.food_id]:null});
      await assert.rejects(make(null,food(`Nobody's dish ${tag}`,null),true),/needs its owner/);
      // Row security: a signed-in user sees shared foods and their own, never another user's.
      await client.query('ALTER TABLE public."FoodItem" ENABLE ROW LEVEL SECURITY; ALTER TABLE public."Serving" ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public."FoodItem", public."Serving" TO authenticated');
      await client.query('BEGIN');
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`,[bob]);
      const seen=(await client.query('select id from public."FoodItem" where id = any($1)',[[a.food_id,b.food_id,shared.food_id]])).rows.map(r=>r.id).sort((x,y)=>x-y);
      const servingsOf=(await client.query('select distinct "foodItemId" from public."Serving" where "foodItemId" = any($1)',[[a.food_id,b.food_id]])).rows.map(r=>r.foodItemId);
      await client.query('ROLLBACK');
      assert.deepEqual(seen,[b.food_id,shared.food_id].sort((x,y)=>x-y));
      assert.deepEqual(servingsOf,[b.food_id],'servings of another user\'s private food are hidden too');
    } finally { await client.end() }
  });
