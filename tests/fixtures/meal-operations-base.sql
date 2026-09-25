-- Minimal isolated fixture around the existing history-RPC test schema.
-- This is never applied to production.
CREATE TYPE public."MessageStatus" AS ENUM ('RECEIVED','PROCESSING','RESOLVED','FAILED');
CREATE TYPE public."MessageType" AS ENUM ('CONVERSATION','FOOD_LOG_REQUEST');
CREATE TYPE public."Role" AS ENUM ('Assistant','User');
CREATE TABLE public."User" (id uuid PRIMARY KEY);
CREATE TABLE public."FoodItem" (id integer PRIMARY KEY,"userId" uuid,name text,
  brand text,"knownAs" text[],"lastUpdated" timestamp DEFAULT now(),
  "defaultServingWeightGram" double precision,"kcalPerServing" double precision);
CREATE TABLE public."Serving" (id integer PRIMARY KEY,"foodItemId" integer REFERENCES public."FoodItem"(id),
  "servingName" text,"servingWeightGram" double precision,"defaultServingAmount" double precision);
CREATE TABLE public."UserMessageImages" (id integer PRIMARY KEY,"userId" uuid,
  "messageId" integer,"imagePath" text,"uploadedAt" timestamptz);
ALTER TABLE public."Message"
  ADD COLUMN role public."Role" NOT NULL DEFAULT 'User',
  ADD COLUMN "messageType" public."MessageType" NOT NULL DEFAULT 'FOOD_LOG_REQUEST',
  ADD COLUMN local_id text;
CREATE SEQUENCE public."Message_meal_test_seq";
SELECT setval('public."Message_meal_test_seq"',coalesce((SELECT max(id) FROM public."Message"),0)+1,false);
ALTER TABLE public."Message" ALTER COLUMN id SET DEFAULT nextval('public."Message_meal_test_seq"');
ALTER TABLE public."LoggedFoodItem"
  ADD COLUMN IF NOT EXISTS "satFatG" double precision,
  ADD COLUMN IF NOT EXISTS "transFatG" double precision,
  ADD COLUMN IF NOT EXISTS "unsatFatG" double precision,
  ADD COLUMN IF NOT EXISTS "polyunsatFatG" double precision,
  ADD COLUMN IF NOT EXISTS "monounsatFatG" double precision,
  ADD COLUMN IF NOT EXISTS "fiberG" double precision,
  ADD COLUMN IF NOT EXISTS "sugarG" double precision,
  ADD COLUMN IF NOT EXISTS "addedSugarG" double precision,
  ADD COLUMN IF NOT EXISTS "waterMl" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminAMcg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminCMg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminDMcg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminEMg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminKMcg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB1Mg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB2Mg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB3Mg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB5Mg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB6Mg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB7Mcg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB9Mcg" double precision,
  ADD COLUMN IF NOT EXISTS "vitaminB12Mcg" double precision,
  ADD COLUMN IF NOT EXISTS "calciumMg" double precision,
  ADD COLUMN IF NOT EXISTS "ironMg" double precision,
  ADD COLUMN IF NOT EXISTS "magnesiumMg" double precision,
  ADD COLUMN IF NOT EXISTS "phosphorusMg" double precision,
  ADD COLUMN IF NOT EXISTS "potassiumMg" double precision,
  ADD COLUMN IF NOT EXISTS "sodiumMg" double precision,
  ADD COLUMN IF NOT EXISTS "zincMg" double precision,
  ADD COLUMN IF NOT EXISTS "copperMg" double precision,
  ADD COLUMN IF NOT EXISTS "manganeseMg" double precision,
  ADD COLUMN IF NOT EXISTS "seleniumMcg" double precision,
  ADD COLUMN IF NOT EXISTS "iodineMcg" double precision,
  ADD COLUMN IF NOT EXISTS "cholesterolMg" double precision,
  ADD COLUMN IF NOT EXISTS "omega3Mg" double precision,
  ADD COLUMN IF NOT EXISTS "omega6Mg" double precision,
  ADD COLUMN IF NOT EXISTS "caffeineMg" double precision,
  ADD COLUMN IF NOT EXISTS "alcoholG" double precision;
