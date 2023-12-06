
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

CREATE TYPE "public"."FoodInfoSource" AS ENUM (
    'User',
    'Online',
    'GPT3',
    'GPT4',
    'LLAMA',
    'LLAMA2',
    'USDA',
    'FATSECRET',
    'NUTRITIONIX'
);

ALTER TYPE "public"."FoodInfoSource" OWNER TO "postgres";

CREATE TYPE "public"."MessageDirection" AS ENUM (
    'Inbound',
    'Outbound'
);

ALTER TYPE "public"."MessageDirection" OWNER TO "postgres";

CREATE TYPE "public"."MessageStatus" AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'RESOLVED',
    'FAILED'
);

ALTER TYPE "public"."MessageStatus" OWNER TO "postgres";

CREATE TYPE "public"."MessageType" AS ENUM (
    'CONVERSATION',
    'ASSISTANT',
    'FOOD_LOG_REQUEST',
    'SHOW_FOOD_LOG',
    'LOG_EXERCISE',
    'UPDATE_USER_INFO'
);

ALTER TYPE "public"."MessageType" OWNER TO "postgres";

CREATE TYPE "public"."Role" AS ENUM (
    'Assistant',
    'User',
    'System',
    'Function'
);

ALTER TYPE "public"."Role" OWNER TO "postgres";

CREATE TYPE "public"."UnitPreference" AS ENUM (
    'IMPERIAL',
    'METRIC'
);

ALTER TYPE "public"."UnitPreference" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_branded_usda_embedding"("embeddingId" integer) RETURNS TABLE("fdcId" integer, "foodName" "text", "foodBrand" "text", "bgeBaseEmbedding" "text", "cosineSimilarity" double precision)
    LANGUAGE "sql"
    AS $$
    SELECT 
              "fdcId", 
              "foodName", 
              "foodBrand", 
              "bgeBaseEmbedding"::text, 
              1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = "embeddingId")) AS "cosineSimilarity" 
          FROM 
              "UsdaFoodItemEmbedding" 
          WHERE 
              "foodBrand" IS NOT NULL
              AND "bgeBaseEmbedding" is not null
          ORDER BY 
          ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" 
          WHERE id = "embeddingId")) ASC
          LIMIT 5
$$;

ALTER FUNCTION "public"."get_branded_usda_embedding"("embeddingId" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_cosine_results"("p_embedding_cache_id" integer) RETURNS TABLE("id" integer, "name" "text", "brand" "text", "embedding" "text", "cosine_similarity" double precision)
    LANGUAGE "sql"
    AS $$
    SELECT 
        id, 
        name, 
        brand, 
        "bgeBaseEmbedding"::text AS embedding,
        1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = p_embedding_cache_id)) AS cosine_similarity 
    FROM "FoodItem" 
    WHERE "bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$$;

ALTER FUNCTION "public"."get_cosine_results"("p_embedding_cache_id" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_timestamp"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_timestamp', (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT
  );
END; $$;

ALTER FUNCTION "public"."get_current_timestamp"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_top_foodimage_embedding_similarity"("p_embedding_cache_id" integer) RETURNS TABLE("food_image_id" integer, "image_description" "text", "cosine_similarity" double precision)
    LANGUAGE "sql"
    AS $$
    SELECT 
        fi.id AS food_image_id, 
        fi."imageDescription" AS image_description,
        1 - (fi."bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = p_embedding_cache_id)) AS cosine_similarity
    FROM "FoodImage" fi
    WHERE fi."bgeBaseEmbedding" IS NOT NULL 
    ORDER BY cosine_similarity DESC 
    LIMIT 5
$$;

ALTER FUNCTION "public"."get_top_foodimage_embedding_similarity"("p_embedding_cache_id" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_unbranded_usda_embedding"("embeddingId" integer) RETURNS TABLE("fdcId" integer, "foodName" "text", "foodBrand" "text", "bgeBaseEmbedding" "text", "cosineSimilarity" double precision)
    LANGUAGE "sql"
    AS $$
    SELECT 
              "fdcId", 
              "foodName", 
              "foodBrand", 
              "bgeBaseEmbedding"::text, 
              1 - ("bgeBaseEmbedding" <=> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" WHERE id = "embeddingId")) AS "cosineSimilarity" 
          FROM 
              "UsdaFoodItemEmbedding" 
          WHERE 
              "foodBrand" IS NULL OR "foodBrand" = ''
              AND "bgeBaseEmbedding" is not null
          ORDER BY 
          ("bgeBaseEmbedding" <#> (SELECT "bgeBaseEmbedding" FROM "foodEmbeddingCache" 
          WHERE id = "embeddingId")) ASC
          LIMIT 5
$$;

ALTER FUNCTION "public"."get_unbranded_usda_embedding"("embeddingId" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public."User" (id, "fullName", "avatarUrl", "email")
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'email');
  return new;
end;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_created_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW."createdAt" := NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_created_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."Account" (
    "id" "text" NOT NULL,
    "userId" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "providerAccountId" "text" NOT NULL,
    "refresh_token" "text",
    "access_token" "text",
    "expires_at" integer,
    "token_type" "text",
    "scope" "text",
    "id_token" "text",
    "session_state" "text"
);

ALTER TABLE "public"."Account" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."ApiCalls" (
    "id" integer NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "apiName" "text" NOT NULL,
    "queryType" "text" NOT NULL,
    "count" integer NOT NULL
);

ALTER TABLE "public"."ApiCalls" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."ApiCalls_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."ApiCalls_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."ApiCalls_id_seq" OWNED BY "public"."ApiCalls"."id";

CREATE TABLE IF NOT EXISTS "public"."ApiTokens" (
    "id" integer NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "apiName" "text" NOT NULL,
    "token" "text" NOT NULL,
    "expires" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "public"."ApiTokens" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."ApiTokens_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."ApiTokens_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."ApiTokens_id_seq" OWNED BY "public"."ApiTokens"."id";

CREATE TABLE IF NOT EXISTS "public"."FoodImage" (
    "id" integer NOT NULL,
    "pathToImage" "text" NOT NULL,
    "bgeBaseEmbedding" "public"."vector"(768),
    "imageDescription" "text",
    "downvotes" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."FoodImage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."FoodImage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."FoodImage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."FoodImage_id_seq" OWNED BY "public"."FoodImage"."id";

CREATE TABLE IF NOT EXISTS "public"."FoodItem" (
    "id" integer NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "brand" "text",
    "knownAs" "text"[] DEFAULT ARRAY[]::"text"[],
    "description" "text",
    "defaultServingWeightGram" double precision,
    "kcalPerServing" double precision DEFAULT 0 NOT NULL,
    "totalFatPerServing" double precision DEFAULT 0 NOT NULL,
    "satFatPerServing" double precision,
    "transFatPerServing" double precision,
    "carbPerServing" double precision DEFAULT 0 NOT NULL,
    "sugarPerServing" double precision,
    "addedSugarPerServing" double precision,
    "proteinPerServing" double precision DEFAULT 0 NOT NULL,
    "lastUpdated" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "userId" "uuid",
    "messageId" integer,
    "foodInfoSource" "public"."FoodInfoSource" DEFAULT 'User'::"public"."FoodInfoSource" NOT NULL,
    "adaEmbedding" "public"."vector"(1536),
    "UPC" bigint,
    "defaultServingLiquidMl" double precision,
    "externalId" "text",
    "fiberPerServing" double precision,
    "isLiquid" boolean DEFAULT false NOT NULL,
    "weightUnknown" boolean DEFAULT false NOT NULL,
    "bgeBaseEmbedding" "public"."vector"(768),
    "createdAtDateTime" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);

ALTER TABLE "public"."FoodItem" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."FoodItemImages" (
    "id" bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "foodImageId" integer,
    "foodItemId" integer
);

ALTER TABLE "public"."FoodItemImages" OWNER TO "postgres";

ALTER TABLE "public"."FoodItemImages" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."FoodItemImages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE SEQUENCE IF NOT EXISTS "public"."FoodItem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."FoodItem_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."FoodItem_id_seq" OWNED BY "public"."FoodItem"."id";

CREATE TABLE IF NOT EXISTS "public"."LoggedFoodItem" (
    "id" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "consumedOn" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "foodItemId" integer,
    "grams" double precision DEFAULT 0 NOT NULL,
    "servingId" integer,
    "servingAmount" double precision,
    "loggedUnit" "text",
    "userId" "uuid" NOT NULL,
    "messageId" integer,
    "status" "text",
    "extendedOpenAiData" "jsonb",
    "embeddingId" integer,
    "deletedAt" timestamp with time zone
);

ALTER TABLE "public"."LoggedFoodItem" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."LoggedFoodItem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."LoggedFoodItem_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."LoggedFoodItem_id_seq" OWNED BY "public"."LoggedFoodItem"."id";

CREATE TABLE IF NOT EXISTS "public"."Message" (
    "id" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "content" "text" NOT NULL,
    "function_name" "text",
    "role" "public"."Role" NOT NULL,
    "userId" "uuid" NOT NULL,
    "itemsProcessed" integer DEFAULT 0,
    "itemsToProcess" integer DEFAULT 0,
    "messageType" "public"."MessageType" DEFAULT 'CONVERSATION'::"public"."MessageType" NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "status" "public"."MessageStatus" DEFAULT 'RECEIVED'::"public"."MessageStatus" NOT NULL
);

ALTER TABLE "public"."Message" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."Message_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."Message_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Message_id_seq" OWNED BY "public"."Message"."id";

CREATE TABLE IF NOT EXISTS "public"."Nutrient" (
    "id" integer NOT NULL,
    "nutrientName" "text" NOT NULL,
    "nutrientUnit" "text" NOT NULL,
    "nutrientAmountPerDefaultServing" double precision NOT NULL,
    "foodItemId" integer NOT NULL
);

ALTER TABLE "public"."Nutrient" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."Nutrient_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."Nutrient_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Nutrient_id_seq" OWNED BY "public"."Nutrient"."id";

CREATE TABLE IF NOT EXISTS "public"."OpenAiUsage" (
    "id" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "modelName" "text" NOT NULL,
    "promptTokens" integer NOT NULL,
    "completionTokens" integer NOT NULL,
    "totalTokens" integer NOT NULL,
    "userId" "uuid" NOT NULL
);

ALTER TABLE "public"."OpenAiUsage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."OpenAiUsage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."OpenAiUsage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."OpenAiUsage_id_seq" OWNED BY "public"."OpenAiUsage"."id";

CREATE TABLE IF NOT EXISTS "public"."Serving" (
    "id" integer NOT NULL,
    "servingWeightGram" double precision,
    "servingName" "text" NOT NULL,
    "foodItemId" integer NOT NULL,
    "servingAlternateAmount" double precision,
    "servingAlternateUnit" "text"
);

ALTER TABLE "public"."Serving" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."Serving_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."Serving_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."Serving_id_seq" OWNED BY "public"."Serving"."id";

CREATE TABLE IF NOT EXISTS "public"."Session" (
    "id" "text" NOT NULL,
    "sessionToken" "text" NOT NULL,
    "userId" "uuid" NOT NULL,
    "expires" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "public"."Session" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."SmsAuthCode" (
    "id" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "code" character varying(64) NOT NULL,
    "userId" "uuid" NOT NULL
);

ALTER TABLE "public"."SmsAuthCode" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."SmsMessage" (
    "id" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "content" "text" NOT NULL,
    "userId" "uuid" NOT NULL,
    "direction" "public"."MessageDirection" NOT NULL
);

ALTER TABLE "public"."SmsMessage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."SmsMessage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."SmsMessage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."SmsMessage_id_seq" OWNED BY "public"."SmsMessage"."id";

CREATE TABLE IF NOT EXISTS "public"."UsdaFoodItemEmbedding" (
    "id" integer NOT NULL,
    "fdcId" integer NOT NULL,
    "foodName" "text" NOT NULL,
    "foodBrand" "text",
    "brandOwner" "text",
    "bgeLargeEmbedding" "public"."vector"(1024),
    "bgeBaseEmbedding" "public"."vector"(768)
);

ALTER TABLE "public"."UsdaFoodItemEmbedding" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."UsdaFoodItemEmbedding_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."UsdaFoodItemEmbedding_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."UsdaFoodItemEmbedding_id_seq" OWNED BY "public"."UsdaFoodItemEmbedding"."id";

CREATE TABLE IF NOT EXISTS "public"."User" (
    "id" "uuid" NOT NULL,
    "fullName" character varying(255),
    "avatarUrl" character varying(2048),
    "email" character varying(255),
    "emailVerified" timestamp(3) without time zone,
    "phone" character varying(255),
    "dateOfBirth" timestamp(3) without time zone,
    "weightKg" double precision,
    "heightCm" integer,
    "calorieGoal" integer,
    "proteinGoal" integer,
    "carbsGoal" integer,
    "fatGoal" integer,
    "fitnessGoal" "text",
    "unitPreference" "public"."UnitPreference" DEFAULT 'IMPERIAL'::"public"."UnitPreference",
    "setupCompleted" boolean DEFAULT false NOT NULL,
    "sentContact" boolean DEFAULT false NOT NULL,
    "tzIdentifier" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "sendCheckins" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."User" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."VerificationToken" (
    "identifier" "text" NOT NULL,
    "token" "text" NOT NULL,
    "expires" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "public"."VerificationToken" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
    "id" character varying(36) NOT NULL,
    "checksum" character varying(64) NOT NULL,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) NOT NULL,
    "logs" "text",
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_steps_count" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."_prisma_migrations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."foodEmbeddingCache" (
    "id" integer NOT NULL,
    "textToEmbed" "text" NOT NULL,
    "adaEmbedding" "public"."vector"(1536),
    "bgeBaseEmbedding" "public"."vector"(768)
);

ALTER TABLE "public"."foodEmbeddingCache" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."foodEmbeddingCache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."foodEmbeddingCache_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."foodEmbeddingCache_id_seq" OWNED BY "public"."foodEmbeddingCache"."id";

ALTER TABLE ONLY "public"."ApiCalls" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ApiCalls_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."ApiTokens" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ApiTokens_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."FoodImage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."FoodImage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."FoodItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."FoodItem_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."LoggedFoodItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."LoggedFoodItem_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Message" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Message_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Nutrient" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Nutrient_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."OpenAiUsage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."OpenAiUsage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Serving" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Serving_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."SmsMessage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."SmsMessage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."UsdaFoodItemEmbedding" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."UsdaFoodItemEmbedding_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."foodEmbeddingCache" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."foodEmbeddingCache_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ApiCalls"
    ADD CONSTRAINT "ApiCalls_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ApiTokens"
    ADD CONSTRAINT "ApiTokens_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."FoodImage"
    ADD CONSTRAINT "FoodImage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."FoodItemImages"
    ADD CONSTRAINT "FoodItemImages_foodItemId_imageId_key" UNIQUE ("foodItemId", "foodImageId");

ALTER TABLE ONLY "public"."FoodItemImages"
    ADD CONSTRAINT "FoodItemImages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."FoodItem"
    ADD CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Nutrient"
    ADD CONSTRAINT "Nutrient_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."OpenAiUsage"
    ADD CONSTRAINT "OpenAiUsage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Serving"
    ADD CONSTRAINT "Serving_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."SmsAuthCode"
    ADD CONSTRAINT "SmsAuthCode_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."SmsMessage"
    ADD CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."UsdaFoodItemEmbedding"
    ADD CONSTRAINT "UsdaFoodItemEmbedding_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."_prisma_migrations"
    ADD CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."foodEmbeddingCache"
    ADD CONSTRAINT "foodEmbeddingCache_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account" USING "btree" ("provider", "providerAccountId");

CREATE UNIQUE INDEX "ApiTokens_token_key" ON "public"."ApiTokens" USING "btree" ("token");

CREATE UNIQUE INDEX "FoodItem_externalId_foodInfoSource_key" ON "public"."FoodItem" USING "btree" ("externalId", "foodInfoSource");

CREATE UNIQUE INDEX "FoodItem_name_brand_key" ON "public"."FoodItem" USING "btree" ("name", "brand");

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session" USING "btree" ("sessionToken");

CREATE UNIQUE INDEX "SmsAuthCode_code_key" ON "public"."SmsAuthCode" USING "btree" ("code");

CREATE INDEX "UsdaFoodItemEmbedding_bgeBaseEmbedding_idx" ON "public"."UsdaFoodItemEmbedding" USING "hnsw" ("bgeBaseEmbedding" "public"."vector_ip_ops") WITH ("m"='16', "ef_construction"='128');

CREATE UNIQUE INDEX "UsdaFoodItemEmbedding_fdcId_key" ON "public"."UsdaFoodItemEmbedding" USING "btree" ("fdcId");

CREATE UNIQUE INDEX "User_email_key" ON "public"."User" USING "btree" ("email");

CREATE UNIQUE INDEX "User_phone_key" ON "public"."User" USING "btree" ("phone");

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken" USING "btree" ("identifier", "token");

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken" USING "btree" ("token");

CREATE UNIQUE INDEX "foodEmbeddingCache_textToEmbed_key" ON "public"."foodEmbeddingCache" USING "btree" ("textToEmbed");

CREATE OR REPLACE TRIGGER "trigger_set_created_at" BEFORE INSERT ON "public"."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_at"();

CREATE OR REPLACE TRIGGER "trigger_update_updated_at" BEFORE UPDATE ON "public"."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE ONLY "public"."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."FoodItemImages"
    ADD CONSTRAINT "FoodItemImages_foodImageId_fkey" FOREIGN KEY ("foodImageId") REFERENCES "public"."FoodImage"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."FoodItemImages"
    ADD CONSTRAINT "FoodItemImages_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "public"."FoodItem"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."FoodItem"
    ADD CONSTRAINT "FoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."FoodItem"
    ADD CONSTRAINT "FoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "public"."foodEmbeddingCache"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "public"."FoodItem"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "public"."Serving"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."LoggedFoodItem"
    ADD CONSTRAINT "LoggedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id");

ALTER TABLE ONLY "public"."Message"
    ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id");

ALTER TABLE ONLY "public"."Nutrient"
    ADD CONSTRAINT "Nutrient_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "public"."FoodItem"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."OpenAiUsage"
    ADD CONSTRAINT "OpenAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id");

ALTER TABLE ONLY "public"."Serving"
    ADD CONSTRAINT "Serving_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "public"."FoodItem"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."SmsAuthCode"
    ADD CONSTRAINT "SmsAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id");

ALTER TABLE ONLY "public"."SmsMessage"
    ADD CONSTRAINT "SmsMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id");

ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY "DeleteLoggedFoodItem" ON "public"."LoggedFoodItem" FOR DELETE USING (("auth"."uid"() = "userId"));

CREATE POLICY "Enable read access for all users" ON "public"."FoodImage" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."FoodItem" FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."FoodItemImages" FOR SELECT USING (true);

CREATE POLICY "Enable read access for users to only view their logged items" ON "public"."LoggedFoodItem" FOR SELECT USING (("auth"."uid"() = "userId"));

CREATE POLICY "Enable read only access for users to only view their messages" ON "public"."Message" FOR SELECT USING (("auth"."uid"() = "userId"));

ALTER TABLE "public"."FoodImage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."FoodItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."FoodItemImages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "InsertLoggedFoodItem" ON "public"."LoggedFoodItem" FOR INSERT WITH CHECK (("auth"."uid"() = "userId"));

ALTER TABLE "public"."LoggedFoodItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."Message" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by the owner of the profile." ON "public"."User" FOR SELECT USING (("auth"."uid"() = "id"));

CREATE POLICY "UpdateLoggedFoodItem" ON "public"."LoggedFoodItem" FOR UPDATE USING (("auth"."uid"() = "userId"));

ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own profile." ON "public"."User" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "Users can update own profile." ON "public"."User" FOR UPDATE USING (("auth"."uid"() = "id"));

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_branded_usda_embedding"("embeddingId" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_branded_usda_embedding"("embeddingId" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_branded_usda_embedding"("embeddingId" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_cosine_results"("p_embedding_cache_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_cosine_results"("p_embedding_cache_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cosine_results"("p_embedding_cache_id" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_timestamp"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_top_foodimage_embedding_similarity"("p_embedding_cache_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_foodimage_embedding_similarity"("p_embedding_cache_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_foodimage_embedding_similarity"("p_embedding_cache_id" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_unbranded_usda_embedding"("embeddingId" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_unbranded_usda_embedding"("embeddingId" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unbranded_usda_embedding"("embeddingId" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";

GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."set_created_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";

GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";

GRANT ALL ON TABLE "public"."Account" TO "anon";
GRANT ALL ON TABLE "public"."Account" TO "authenticated";
GRANT ALL ON TABLE "public"."Account" TO "service_role";

GRANT ALL ON TABLE "public"."ApiCalls" TO "anon";
GRANT ALL ON TABLE "public"."ApiCalls" TO "authenticated";
GRANT ALL ON TABLE "public"."ApiCalls" TO "service_role";

GRANT ALL ON SEQUENCE "public"."ApiCalls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ApiCalls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ApiCalls_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."ApiTokens" TO "anon";
GRANT ALL ON TABLE "public"."ApiTokens" TO "authenticated";
GRANT ALL ON TABLE "public"."ApiTokens" TO "service_role";

GRANT ALL ON SEQUENCE "public"."ApiTokens_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ApiTokens_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ApiTokens_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."FoodImage" TO "anon";
GRANT ALL ON TABLE "public"."FoodImage" TO "authenticated";
GRANT ALL ON TABLE "public"."FoodImage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."FoodImage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."FoodImage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."FoodImage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."FoodItem" TO "anon";
GRANT ALL ON TABLE "public"."FoodItem" TO "authenticated";
GRANT ALL ON TABLE "public"."FoodItem" TO "service_role";

GRANT ALL ON TABLE "public"."FoodItemImages" TO "anon";
GRANT ALL ON TABLE "public"."FoodItemImages" TO "authenticated";
GRANT ALL ON TABLE "public"."FoodItemImages" TO "service_role";

GRANT ALL ON SEQUENCE "public"."FoodItemImages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."FoodItemImages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."FoodItemImages_id_seq" TO "service_role";

GRANT ALL ON SEQUENCE "public"."FoodItem_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."FoodItem_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."FoodItem_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."LoggedFoodItem" TO "anon";
GRANT ALL ON TABLE "public"."LoggedFoodItem" TO "authenticated";
GRANT ALL ON TABLE "public"."LoggedFoodItem" TO "service_role";

GRANT ALL ON SEQUENCE "public"."LoggedFoodItem_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."LoggedFoodItem_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."LoggedFoodItem_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."Message" TO "anon";
GRANT ALL ON TABLE "public"."Message" TO "authenticated";
GRANT ALL ON TABLE "public"."Message" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Message_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Message_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Message_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."Nutrient" TO "anon";
GRANT ALL ON TABLE "public"."Nutrient" TO "authenticated";
GRANT ALL ON TABLE "public"."Nutrient" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Nutrient_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Nutrient_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Nutrient_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."OpenAiUsage" TO "anon";
GRANT ALL ON TABLE "public"."OpenAiUsage" TO "authenticated";
GRANT ALL ON TABLE "public"."OpenAiUsage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."OpenAiUsage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."OpenAiUsage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."OpenAiUsage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."Serving" TO "anon";
GRANT ALL ON TABLE "public"."Serving" TO "authenticated";
GRANT ALL ON TABLE "public"."Serving" TO "service_role";

GRANT ALL ON SEQUENCE "public"."Serving_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Serving_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Serving_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."Session" TO "anon";
GRANT ALL ON TABLE "public"."Session" TO "authenticated";
GRANT ALL ON TABLE "public"."Session" TO "service_role";

GRANT ALL ON TABLE "public"."SmsAuthCode" TO "anon";
GRANT ALL ON TABLE "public"."SmsAuthCode" TO "authenticated";
GRANT ALL ON TABLE "public"."SmsAuthCode" TO "service_role";

GRANT ALL ON TABLE "public"."SmsMessage" TO "anon";
GRANT ALL ON TABLE "public"."SmsMessage" TO "authenticated";
GRANT ALL ON TABLE "public"."SmsMessage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."SmsMessage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."SmsMessage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."SmsMessage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."UsdaFoodItemEmbedding" TO "anon";
GRANT ALL ON TABLE "public"."UsdaFoodItemEmbedding" TO "authenticated";
GRANT ALL ON TABLE "public"."UsdaFoodItemEmbedding" TO "service_role";

GRANT ALL ON SEQUENCE "public"."UsdaFoodItemEmbedding_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."UsdaFoodItemEmbedding_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."UsdaFoodItemEmbedding_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."User" TO "anon";
GRANT ALL ON TABLE "public"."User" TO "authenticated";
GRANT ALL ON TABLE "public"."User" TO "service_role";

GRANT ALL ON TABLE "public"."VerificationToken" TO "anon";
GRANT ALL ON TABLE "public"."VerificationToken" TO "authenticated";
GRANT ALL ON TABLE "public"."VerificationToken" TO "service_role";

GRANT ALL ON TABLE "public"."_prisma_migrations" TO "anon";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."_prisma_migrations" TO "service_role";

GRANT ALL ON TABLE "public"."foodEmbeddingCache" TO "anon";
GRANT ALL ON TABLE "public"."foodEmbeddingCache" TO "authenticated";
GRANT ALL ON TABLE "public"."foodEmbeddingCache" TO "service_role";

GRANT ALL ON SEQUENCE "public"."foodEmbeddingCache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."foodEmbeddingCache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."foodEmbeddingCache_id_seq" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";

RESET ALL;
