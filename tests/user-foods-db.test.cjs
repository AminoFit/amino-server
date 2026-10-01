const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {assertDisposable}=require('./helpers/mealTestDb.cjs');

// Custom foods and recipes (20261004000000) on a disposable local Postgres: the real catalogue migrations over a small
// fixture (pgvector stubbed as text, so the nearest-search body is not checked).
const connectionString=process.env.AMINO_USER_FOODS_TEST_DATABASE_URL;
const read=file=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8');
const migrations=['20260925205900_agent_estimate_food_source.sql','20260925210000_catalogue_food_creation.sql',
  '20260926010000_label_food_source.sql','20260926010100_catalogue_gtin_enrichment.sql','20260926020000_serving_units.sql',
  '20260926030000_serving_dedupe.sql','20260927010000_private_foods.sql','20260927020000_label_variants.sql']
const nutrients=['kcal','proteinG','carbG','totalFatG','satFatG','transFatG','unsatFatG','polyunsatFatG','monounsatFatG','fiberG',
  'sugarG','addedSugarG','waterMl','vitaminAMcg','vitaminCMg','vitaminDMcg','vitaminEMg','vitaminKMcg','vitaminB1Mg','vitaminB2Mg',
  'vitaminB3Mg','vitaminB5Mg','vitaminB6Mg','vitaminB7Mcg','vitaminB9Mcg','vitaminB12Mcg','calciumMg','ironMg','magnesiumMg',
  'phosphorusMg','potassiumMg','sodiumMg','zincMg','copperMg','manganeseMg','seleniumMcg','iodineMcg','cholesterolMg','omega3Mg',
  'omega6Mg','caffeineMg','alcoholG']
const fixture=`
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$BEGIN CREATE DOMAIN extensions.vector AS text; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE TYPE public."FoodInfoSource" AS ENUM ('User','Online','USDA');
CREATE TYPE public."MessageStatus" AS ENUM ('RECEIVED','PROCESSING','RESOLVED','FAILED');
CREATE TYPE public."MessageType" AS ENUM ('CONVERSATION','FOOD_LOG_REQUEST');
CREATE TYPE public."Role" AS ENUM ('Assistant','User');
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public."foodEmbeddingCache" (id serial PRIMARY KEY, "bgeBaseEmbedding" extensions.vector);
CREATE TABLE public."FoodItem" (id serial PRIMARY KEY, name text NOT NULL, brand text,
  "defaultServingWeightGram" float8, "defaultServingLiquidMl" float8, "kcalPerServing" float8 NOT NULL DEFAULT 0,
  "proteinPerServing" float8 NOT NULL DEFAULT 0, "carbPerServing" float8 NOT NULL DEFAULT 0,
  "totalFatPerServing" float8 NOT NULL DEFAULT 0, "fiberPerServing" float8, "sugarPerServing" float8,
  "addedSugarPerServing" float8, "satFatPerServing" float8, "transFatPerServing" float8,
  "isLiquid" boolean NOT NULL DEFAULT false, "userId" uuid, "messageId" integer,
  "foodInfoSource" public."FoodInfoSource" NOT NULL DEFAULT 'User', "externalId" text,
  "bgeBaseEmbedding" extensions.vector, description text, verified boolean NOT NULL DEFAULT false,
  "UPC" bigint, "knownAs" text[] DEFAULT ARRAY[]::text[], "weightUnknown" boolean NOT NULL DEFAULT false,
  "lastUpdated" timestamp NOT NULL DEFAULT now(), "createdAtDateTime" timestamptz NOT NULL DEFAULT now(), UNIQUE (name, brand), UNIQUE ("externalId", "foodInfoSource"));
CREATE TABLE public."Serving" (id serial PRIMARY KEY, "foodItemId" integer REFERENCES public."FoodItem"(id),
  "servingName" text NOT NULL, "servingWeightGram" float8, "defaultServingAmount" numeric(10,2) DEFAULT 1);
CREATE TABLE public."Nutrient" (id serial PRIMARY KEY, "nutrientName" text NOT NULL, "nutrientUnit" text NOT NULL,
  "nutrientAmountPerDefaultServing" float8 NOT NULL, "foodItemId" integer NOT NULL REFERENCES public."FoodItem"(id));
CREATE TABLE public."FoodItemImages" (id bigserial PRIMARY KEY, "foodItemId" integer REFERENCES public."FoodItem"(id) ON DELETE CASCADE,
  "foodImageId" integer, similarity real NOT NULL DEFAULT 1, UNIQUE ("foodItemId", "foodImageId"));
CREATE TABLE public."UserFavoriteFoodItem" (id bigserial PRIMARY KEY, "userId" uuid NOT NULL,
  "foodItemId" integer NOT NULL REFERENCES public."FoodItem"(id) ON DELETE CASCADE,
  "servingId" integer REFERENCES public."Serving"(id) ON DELETE CASCADE, "preferredAmount" float8 NOT NULL DEFAULT 1);
CREATE TABLE public."FeatureFlag" (name text PRIMARY KEY, value text NOT NULL);
CREATE TABLE public."CatalogueAuditBackup" (id serial PRIMARY KEY, audit text, "tableName" text, "rowId" bigint, before jsonb);
CREATE TABLE public."userSubmittedBug" (id serial PRIMARY KEY, food_item_id integer);
CREATE TABLE public."IconQueue" (id serial PRIMARY KEY, requested_food_item_id integer);
CREATE TABLE public."Message" (id serial PRIMARY KEY, "userId" uuid NOT NULL, content text, role public."Role",
  "messageType" public."MessageType", status public."MessageStatus", "consumedOn" timestamp, "createdAt" timestamp,
  "resolvedAt" timestamp, "deletedAt" timestamp, "itemsToProcess" integer, "itemsProcessed" integer,
  hasimages boolean, local_id varchar(255) UNIQUE, "publishedRevision" bigint NOT NULL DEFAULT 0,
  "operationOwned" boolean NOT NULL DEFAULT false, "activeOperationId" uuid);
CREATE TABLE public."LoggedFoodItem" (id serial PRIMARY KEY, "userId" uuid NOT NULL,
  "messageId" integer REFERENCES public."Message"(id), "foodItemId" integer REFERENCES public."FoodItem"(id) ON DELETE SET NULL,
  grams float8 NOT NULL, "servingId" integer, "servingAmount" float8, "loggedUnit" text, status text,
  "consumedOn" timestamp, "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now(),
  "deletedAt" timestamptz, local_id uuid UNIQUE, "logicalItemId" uuid, "publishedRevision" bigint DEFAULT 0,
  ${nutrients.map(k=>`"${k}" float8`).join(',')});`;

const alice='00000000-0000-4000-8000-00000000000a',bob='00000000-0000-4000-8000-00000000000b';
const food=(name,extra={})=>({name,brand:null,defaultServingWeightGram:100,kcal:200,proteinG:10,carbG:20,totalFatG:5,...extra});

test('custom foods and recipes: ownership, names, versions, search visibility, logging and merges',
  {skip:!connectionString&&'Set AMINO_USER_FOODS_TEST_DATABASE_URL for a disposable local database'},async()=>{
    assertDisposable(connectionString);
    const db=new Client({connectionString});
    await db.connect();
    try {
      await db.query(fixture);
      for (const file of migrations) await db.query(read(file));
      await db.query('SET check_function_bodies = off');
      await db.query(read('20261004000000_custom_foods_and_recipes.sql'))
      await db.query(read('20261004010000_drop_replace_meal_with_food.sql'))
      await db.query(read('20261004020000_user_food_versions_keep_created_date.sql'))
      await db.query(read('20261004040000_search_own_foods.sql'));
      await db.query('RESET check_function_bodies');
      const one=(sql,args)=>db.query(sql,args).then(r=>r.rows[0]);
      const save=(user,id,value,{servings=[{name:'portion',grams:value.defaultServingWeightGram,amount:1}],nutrients=[],ingredients=null}={})=>
        one('select * from public.save_user_food($1,$2,$3,$4,$5,$6)',[user,id,value,JSON.stringify(servings),JSON.stringify(nutrients),
          ingredients&&JSON.stringify(ingredients)])
      const search=(user,q)=>db.query('select id from public.search_meal_food_catalogue($1,20,0,$2)',[q,user]).then(r=>r.rows.map(x=>x.id))
      const item=(foodItemId,grams,kcal)=>({foodItemId,grams,servingId:null,servingAmount:grams,loggedUnit:'g',nutrition:{kcal,proteinG:1}})

      // A custom food: private to its creator, with servings and micronutrients per default serving.
      const shake=await save(alice,null,food('Protein shake',{defaultServingWeightGram:330,isLiquid:true}),
        {nutrients:[{name:'sodium',unit:'mg',amount:120}]})
      assert.deepEqual([shake.created,shake.versioned],[true,false])
      const shakeRow=await one('select "privateToUserId","foodInfoSource"::text src,"recipePortions" from public."FoodItem" where id=$1',[shake.food_id])
      assert.deepEqual(shakeRow,{privateToUserId:alice,src:'User',recipePortions:null})
      assert.equal((await one('select count(*)::int n from public."Nutrient" where "foodItemId"=$1',[shake.food_id])).n,1)

      // One name per owner across foods and recipes; another user may use it.
      await assert.rejects(save(alice,null,food('protein  SHAKE')),/name_taken/)
      assert.equal((await save(bob,null,food('Protein shake'))).created,true)

      // A recipe: ingredients are shared foods or the owner's own, never another user's, never a recipe.
      const rice=(await one(`insert into public."FoodItem"(name,"defaultServingWeightGram","kcalPerServing") values ('Jasmine rice',100,130) returning id`)).id
      const bobsFood=(await one('select id from public."FoodItem" where name=$1 and "privateToUserId"=$2',['Protein shake',bob])).id
      const pastaFood=food('Chicken pasta',{defaultServingWeightGram:250,recipePortions:4})
      const ingredients=[{foodItemId:rice,grams:600},{foodItemId:shake.food_id,grams:400}]
      await assert.rejects(save(alice,null,pastaFood,{ingredients:[...ingredients,{foodItemId:bobsFood,grams:10}]}),/ingredient_unavailable/)
      const pasta=await save(alice,null,pastaFood,{ingredients})
      assert.equal(pasta.created,true)
      await assert.rejects(save(alice,null,food('Pasta bake',{recipePortions:2}),{ingredients:[{foodItemId:pasta.food_id,grams:100}]}),
        /ingredient_unavailable/,'no nested recipes')
      assert.deepEqual((await db.query('select "foodItemId",position from public."RecipeIngredient" where "recipeFoodItemId"=$1 order by position',
        [pasta.food_id])).rows,[{foodItemId:rice,position:0},{foodItemId:shake.food_id,position:1}])
      await assert.rejects(save(alice,null,food('Recipe without portions'),{ingredients}),/Invalid food/)
      await assert.rejects(save(alice,pasta.food_id,food('Chicken pasta')),/food_unavailable/,'a recipe stays a recipe')
      await assert.rejects(save(bob,pasta.food_id,pastaFood,{ingredients}),/food_unavailable/,'only the owner edits')

      // Searches: the owner's custom food always; a recipe only behind recipes_in_agent; never another user's.
      assert.ok((await search(alice,'Protein shake')).includes(shake.food_id))
      assert.ok(!(await search(alice,'Chicken pasta')).includes(pasta.food_id),'recipes stay out of search while the flag is off')
      await db.query(`insert into public."FeatureFlag" values ('recipes_in_agent',$1) on conflict (name) do update set value=excluded.value`,[` ${alice.toUpperCase()} , x`])
      assert.ok((await search(alice,'Chicken pasta')).includes(pasta.food_id))
      assert.ok(!(await search(bob,'Chicken pasta')).includes(pasta.food_id))
      await db.query(`update public."FeatureFlag" set value='off' where name='recipes_in_agent'`)

      // Own foods named in a meal's text: only the owner's, recipes only behind the flag.
      const own=(user,text)=>db.query('select id,score from public.search_own_foods($1,$2,5)',[text,user]).then(r=>r.rows.map(x=>x.id))
      assert.ok((await own(alice,'a protein shake after the gym')).includes(shake.food_id))
      assert.deepEqual(await own(alice,'1.5 portions of my chicken pasta'),[],'recipes stay hidden while the flag is off')
      await db.query(`update public."FeatureFlag" set value=$1 where name='recipes_in_agent'`,[alice])
      assert.ok((await own(alice,'1.5 portions of my chicken pasta')).includes(pasta.food_id))
      assert.ok(!(await own(alice,'pasta at Olive Garden')).includes(pasta.food_id),'a shared word is not the recipe name')
      assert.deepEqual(await own(bob,'1.5 portions of my chicken pasta'),[],"never another user's")
      await db.query(`update public."FeatureFlag" set value='off' where name='recipes_in_agent'`)

      // The agent's private creations never reuse a recipe (or collide with its name).
      const estimate=await one('select * from public.create_catalogue_food($1,null,$2,$3,true)',
        [alice,food('Chicken pasta',{foodInfoSource:'User'}),JSON.stringify([])])
      assert.equal(estimate.created,true)
      assert.notEqual(estimate.food_id,pasta.food_id)

      // Not logged and in no recipe: an edit happens in place.
      const oats=await save(alice,null,food('Overnight oats'),{nutrients:[{name:'sodium',unit:'mg',amount:50}]})
      const edited=await save(alice,oats.food_id,food('Overnight oats',{kcal:180}))
      assert.deepEqual([edited.food_id,edited.versioned],[oats.food_id,false])
      assert.equal((await one('select "kcalPerServing" k from public."FoodItem" where id=$1',[oats.food_id])).k,180)
      assert.equal((await one('select count(*)::int n from public."Nutrient" where "foodItemId"=$1',[oats.food_id])).n,0)

      // Logging a portion creates a resolved meal; a retry returns the same meal.
      const local='11111111-1111-4111-8111-111111111111'
      const logged=await one('select * from public.log_food_as_meal($1,$2,$3,$4,$5)',[alice,local,'2026-09-30 23:12:00','1.5 portions of Chicken pasta',
        {...item(pasta.food_id,375,750),servingAmount:1.5,loggedUnit:'portion',nutrition:{kcal:750,proteinG:30,sodiumMg:400}}])
      assert.equal(logged.created,true)
      const retry=await one('select * from public.log_food_as_meal($1,$2,$3,$4,$5)',[alice,local,'2026-09-30 23:12:00','x',item(pasta.food_id,1,1)])
      assert.deepEqual(retry,{...logged,created:false})
      const row=await one('select grams,kcal,"sodiumMg","servingAmount","loggedUnit",status,"logicalItemId" is not null has_logical from public."LoggedFoodItem" where id=$1',
        [logged.logged_food_item_id])
      assert.deepEqual(row,{grams:375,kcal:750,sodiumMg:400,servingAmount:1.5,loggedUnit:'portion',status:'Processed',has_logical:true})
      const meal=await one('select status::text,"itemsToProcess",role::text,"messageType"::text from public."Message" where id=$1',[logged.message_id])
      assert.deepEqual(meal,{status:'RESOLVED',itemsToProcess:1,role:'User',messageType:'FOOD_LOG_REQUEST'})
      await assert.rejects(one('select * from public.log_food_as_meal($1,$2,$3,$4,$5)',[bob,'22222222-2222-4222-8222-222222222222',
        '2026-09-30 12:00:00','',item(pasta.food_id,100,100)]),/food_unavailable/)

      // With logs, an edit is a new version: past logs keep the old one, the icon and favourites move on.
      await db.query(`update public."FoodItem" set "createdAtDateTime"='2026-09-29 23:12:00+00' where id=$1`,[pasta.food_id])
      await db.query('insert into public."FoodItemImages"("foodItemId","foodImageId") values ($1,77)',[pasta.food_id])
      await db.query('insert into public."UserFavoriteFoodItem"("userId","foodItemId") values ($1,$2)',[alice,pasta.food_id])
      const v2=await save(alice,pasta.food_id,{...pastaFood,recipePortions:6},{ingredients:[{foodItemId:rice,grams:900}]})
      assert.equal(v2.versioned,true); assert.notEqual(v2.food_id,pasta.food_id); assert.equal(v2.previous_id,pasta.food_id)
      assert.equal((await one('select count(distinct "createdAtDateTime")::int n from public."FoodItem" where id = any($1)',
        [[pasta.food_id,v2.food_id]])).n,1,'a new version keeps the date the recipe was created')
      const versions=(await db.query('select id,"archivedAt" is not null archived,"previousVersionId" prev,"recipePortions"::float8 portions from public."FoodItem" where id = any($1) order by id',
        [[pasta.food_id,v2.food_id]])).rows
      assert.deepEqual(versions,[{id:pasta.food_id,archived:true,prev:null,portions:4},{id:v2.food_id,archived:false,prev:pasta.food_id,portions:6}])
      assert.equal((await one('select count(*)::int n from public."RecipeIngredient" where "recipeFoodItemId"=$1',[pasta.food_id])).n,2,'old ingredients kept')
      assert.equal((await one('select "foodItemId" f from public."LoggedFoodItem" where id=$1',[logged.logged_food_item_id])).f,pasta.food_id)
      assert.equal((await one('select "foodImageId" i from public."FoodItemImages" where "foodItemId"=$1',[v2.food_id])).i,77)
      assert.equal((await one('select "foodItemId" f from public."UserFavoriteFoodItem" where "userId"=$1',[alice])).f,v2.food_id)
      await assert.rejects(save(alice,pasta.food_id,pastaFood,{ingredients}),/food_unavailable/,'an archived version is read-only')
      await db.query(`update public."FeatureFlag" set value='all' where name='recipes_in_agent'`)
      const found=await search(alice,'Chicken pasta')
      assert.ok(found.includes(v2.food_id)&&!found.includes(pasta.food_id),'archived versions are never searched')
      // A food used as an ingredient is versioned too, so the recipe keeps the values it was saved with.
      await db.query(`update public."FoodItem" set gtin='00012345678905' where id=$1`,[shake.food_id])
      const shake2=await save(alice,shake.food_id,food('Protein shake',{defaultServingWeightGram:330,kcal:190}))
      assert.equal((await one('select gtin from public."FoodItem" where id=$1',[shake2.food_id])).gtin,'00012345678905','the barcode moves on')
      assert.equal(shake2.versioned,true)
      assert.equal((await one('select count(*)::int n from public."RecipeIngredient" where "foodItemId"=$1',[shake.food_id])).n,1)

      // Archiving: past logs still show it; nothing new can log it.
      assert.equal((await one('select public.archive_user_food($1,$2) ok',[bob,v2.food_id])).ok,false)
      assert.equal((await one('select public.archive_user_food($1,$2) ok',[alice,v2.food_id])).ok,true)
      await assert.rejects(one('select * from public.log_food_as_meal($1,$2,$3,$4,$5)',[alice,'33333333-3333-4333-8333-333333333333',
        '2026-09-30 12:00:00','',item(v2.food_id,100,100)]),/food_unavailable/)
      assert.ok(!(await search(alice,'Chicken pasta')).includes(v2.food_id))

      const recipe3=await save(alice,null,food('Chicken tomato pasta',{defaultServingWeightGram:200,recipePortions:12}),{ingredients:[{foodItemId:rice,grams:2400}]})

      // Catalogue merges move recipe ingredients, and never merge a recipe.
      const rice2=(await one(`insert into public."FoodItem"(name,"defaultServingWeightGram","kcalPerServing") values ('Rice, jasmine',100,130) returning id`)).id
      await db.query('select public.merge_catalogue_food($1,$2,$3)',[rice2,rice,'test'])
      assert.equal((await one('select count(*)::int n from public."RecipeIngredient" where "foodItemId"=$1',[rice2])).n,3,'both pasta versions and the tomato pasta')
      await assert.rejects(db.query('select public.merge_catalogue_food($1,$2,$3)',[rice2,recipe3.food_id,'test']),/never merged/)
    } finally {await db.end()}
  })
