const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

// Runs the real migrations against a disposable Postgres (pgvector is stubbed).
const connectionString=process.env.AMINO_FOOD_TEST_DATABASE_URL;
const migrations=['20260925205900_agent_estimate_food_source.sql','20260925210000_catalogue_food_creation.sql']
  .map(file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
const fixture=`
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$BEGIN CREATE DOMAIN extensions.vector AS text; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE TYPE public."FoodInfoSource" AS ENUM ('User','Online','USDA'); EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE TABLE IF NOT EXISTS public."FoodItem" (id serial PRIMARY KEY, name text NOT NULL, brand text,
  "defaultServingWeightGram" float8, "kcalPerServing" float8 NOT NULL DEFAULT 0, "proteinPerServing" float8 NOT NULL DEFAULT 0,
  "carbPerServing" float8 NOT NULL DEFAULT 0, "totalFatPerServing" float8 NOT NULL DEFAULT 0, "fiberPerServing" float8,
  "sugarPerServing" float8, "satFatPerServing" float8, "isLiquid" boolean NOT NULL DEFAULT false, "userId" uuid,
  "messageId" integer, "foodInfoSource" public."FoodInfoSource" NOT NULL DEFAULT 'User', "externalId" text,
  "bgeBaseEmbedding" extensions.vector, description text, verified boolean NOT NULL DEFAULT false,
  UNIQUE (name, brand), UNIQUE ("externalId", "foodInfoSource"));
CREATE TABLE IF NOT EXISTS public."Serving" (id serial PRIMARY KEY, "foodItemId" integer REFERENCES public."FoodItem"(id),
  "servingName" text NOT NULL, "servingWeightGram" float8, "defaultServingAmount" numeric(10,2) DEFAULT 1);`;

const food=(name,brand,extra={})=>({name,brand,defaultServingWeightGram:100,kcal:130,proteinG:3,carbG:28,totalFatG:0.3,
  foodInfoSource:'Online',source:'https://example.test',bgeBaseEmbedding:'[0.1]',...extra});
const create=(client,value,servings=[{name:'cup',grams:158}])=>client.query(
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
    } finally {await Promise.all([a.end(),b.end()])}
  });
