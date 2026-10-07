const fs=require('node:fs');
const path=require('node:path');

// Custom foods and recipes (20261004000000) on a disposable local Postgres: the real catalogue migrations over a small
// fixture (pgvector stubbed as text, so the nearest-search body is not checked).
const read=file=>fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8');
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
CREATE TABLE public."userSubmittedBug" (id serial PRIMARY KEY, food_item_id integer, message_id integer, logged_food_id integer);
CREATE TABLE public."UserMessageImages" (id serial PRIMARY KEY, "userId" uuid, "messageId" integer);
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

// The catalogue fixture, then custom foods and recipes, the searches and the one visibility rule.
async function prepare(db){
  await db.query(fixture);
  for (const file of migrations) await db.query(read(file));
  await db.query('SET check_function_bodies = off');
  await db.query(read('20261004000000_custom_foods_and_recipes.sql'))
  await db.query(read('20261004070000_log_foods_as_meal.sql'))
  await db.query(read('20261004080000_no_builtin_unit_servings.sql'))
  await db.query(read('20261004010000_drop_replace_meal_with_food.sql'))
  await db.query(read('20261004020000_user_food_versions_keep_created_date.sql'))
  await db.query(read('20261004040000_search_own_foods.sql'));
  // The later searches, then one visibility rule (20261015000000): every check below runs through food_visible.
  for (const file of ['20261004050000_fast_food_search.sql','20261004060000_food_search_partial_words.sql',
    '20261014030000_search_words_across_brand.sql','20261014070000_search_alias_rank.sql',
    '20261015000000_food_lineage_and_visibility.sql']) await db.query(read(file).split('-- The food indexes stay in memory')[0])
  await db.query('RESET check_function_bodies');
}

module.exports={read,prepare,nutrients};
