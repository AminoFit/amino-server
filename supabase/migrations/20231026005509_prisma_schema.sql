create extension if not exists "vector" with schema "public" version '0.5.1';

create type "public"."FoodInfoSource" as enum ('User', 'Online', 'GPT3', 'GPT4', 'LLAMA', 'LLAMA2', 'USDA', 'FATSECRET', 'NUTRITIONIX');

create type "public"."MessageDirection" as enum ('Inbound', 'Outbound');

create type "public"."MessageStatus" as enum ('RECEIVED', 'PROCESSING', 'RESOLVED', 'FAILED');

create type "public"."MessageType" as enum ('CONVERSATION', 'ASSISTANT', 'FOOD_LOG_REQUEST', 'SHOW_FOOD_LOG', 'LOG_EXERCISE', 'UPDATE_USER_INFO');

create type "public"."Role" as enum ('Assistant', 'User', 'System', 'Function');

create type "public"."UnitPreference" as enum ('IMPERIAL', 'METRIC');

create sequence "public"."ApiCalls_id_seq";

create sequence "public"."ApiTokens_id_seq";

create sequence "public"."FoodImage_id_seq";

create sequence "public"."FoodItem_id_seq";

create sequence "public"."LoggedFoodItem_id_seq";

create sequence "public"."Message_id_seq";

create sequence "public"."Nutrient_id_seq";

create sequence "public"."OpenAiUsage_id_seq";

create sequence "public"."Serving_id_seq";

create sequence "public"."SmsMessage_id_seq";

create sequence "public"."UsdaFoodItemEmbedding_id_seq";

create sequence "public"."foodEmbeddingCache_id_seq";

create table "public"."Account" (
    "id" text not null,
    "userId" uuid not null,
    "type" text not null,
    "provider" text not null,
    "providerAccountId" text not null,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text
);


create table "public"."ApiCalls" (
    "id" integer not null default nextval('"ApiCalls_id_seq"'::regclass),
    "timestamp" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "apiName" text not null,
    "queryType" text not null,
    "count" integer not null
);


create table "public"."ApiTokens" (
    "id" integer not null default nextval('"ApiTokens_id_seq"'::regclass),
    "timestamp" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "apiName" text not null,
    "token" text not null,
    "expires" timestamp(3) without time zone not null
);


create table "public"."FoodImage" (
    "id" integer not null default nextval('"FoodImage_id_seq"'::regclass),
    "pathToImage" text not null,
    "priority" integer not null default 10,
    "foodItemId" integer not null
);


create table "public"."FoodItem" (
    "id" integer not null default nextval('"FoodItem_id_seq"'::regclass),
    "name" text not null default ''::text,
    "brand" text,
    "knownAs" text[] default ARRAY[]::text[],
    "description" text,
    "defaultServingWeightGram" double precision,
    "kcalPerServing" double precision not null default 0,
    "totalFatPerServing" double precision not null default 0,
    "satFatPerServing" double precision,
    "transFatPerServing" double precision,
    "carbPerServing" double precision not null default 0,
    "sugarPerServing" double precision,
    "addedSugarPerServing" double precision,
    "proteinPerServing" double precision not null default 0,
    "lastUpdated" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "verified" boolean not null default false,
    "userId" uuid,
    "messageId" integer,
    "foodInfoSource" "FoodInfoSource" not null default 'User'::"FoodInfoSource",
    "adaEmbedding" vector(1536),
    "UPC" bigint,
    "defaultServingLiquidMl" double precision,
    "externalId" text,
    "fiberPerServing" double precision,
    "isLiquid" boolean not null default false,
    "weightUnknown" boolean not null default false,
    "bgeBaseEmbedding" vector(768)
);


create table "public"."LoggedFoodItem" (
    "id" integer not null default nextval('"LoggedFoodItem_id_seq"'::regclass),
    "createdAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "consumedOn" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "foodItemId" integer,
    "grams" double precision not null default 0,
    "servingId" integer,
    "servingAmount" double precision,
    "loggedUnit" text,
    "userId" uuid not null,
    "messageId" integer,
    "status" text,
    "extendedOpenAiData" jsonb,
    "embeddingId" integer
);


create table "public"."Message" (
    "id" integer not null default nextval('"Message_id_seq"'::regclass),
    "createdAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "content" text not null,
    "function_name" text,
    "role" "Role" not null,
    "userId" uuid not null,
    "itemsProcessed" integer default 0,
    "itemsToProcess" integer default 0,
    "messageType" "MessageType" not null default 'CONVERSATION'::"MessageType",
    "resolvedAt" timestamp(3) without time zone,
    "status" "MessageStatus" not null default 'RECEIVED'::"MessageStatus"
);


create table "public"."Nutrient" (
    "id" integer not null default nextval('"Nutrient_id_seq"'::regclass),
    "nutrientName" text not null,
    "nutrientUnit" text not null,
    "nutrientAmountPerDefaultServing" double precision not null,
    "foodItemId" integer not null
);


create table "public"."OpenAiUsage" (
    "id" integer not null default nextval('"OpenAiUsage_id_seq"'::regclass),
    "createdAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "modelName" text not null,
    "promptTokens" integer not null,
    "completionTokens" integer not null,
    "totalTokens" integer not null,
    "userId" uuid not null
);


create table "public"."Serving" (
    "id" integer not null default nextval('"Serving_id_seq"'::regclass),
    "servingWeightGram" double precision,
    "servingName" text not null,
    "foodItemId" integer not null,
    "servingAlternateAmount" double precision,
    "servingAlternateUnit" text
);


create table "public"."Session" (
    "id" text not null,
    "sessionToken" text not null,
    "userId" uuid not null,
    "expires" timestamp(3) without time zone not null
);


create table "public"."SmsAuthCode" (
    "id" text not null,
    "createdAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "expiresAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "code" character varying(64) not null,
    "userId" uuid not null
);


create table "public"."SmsMessage" (
    "id" integer not null default nextval('"SmsMessage_id_seq"'::regclass),
    "createdAt" timestamp(3) without time zone not null default CURRENT_TIMESTAMP,
    "content" text not null,
    "userId" uuid not null,
    "direction" "MessageDirection" not null
);


create table "public"."UsdaFoodItemEmbedding" (
    "id" integer not null default nextval('"UsdaFoodItemEmbedding_id_seq"'::regclass),
    "fdcId" integer not null,
    "foodName" text not null,
    "foodBrand" text,
    "brandOwner" text,
    "bgeLargeEmbedding" vector(1024),
    "bgeBaseEmbedding" vector(768)
);


create table "public"."User" (
    "id" uuid references "auth"."users" on delete cascade not null,
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
    "fitnessGoal" text,
    "unitPreference" "UnitPreference" default 'IMPERIAL'::"UnitPreference",
    "setupCompleted" boolean not null default false,
    "sentContact" boolean not null default false,
    "tzIdentifier" text not null default 'America/New_York'::text,
    "sendCheckins" boolean not null default false
);


create table "public"."VerificationToken" (
    "identifier" text not null,
    "token" text not null,
    "expires" timestamp(3) without time zone not null
);


create table "public"."_prisma_migrations" (
    "id" character varying(36) not null,
    "checksum" character varying(64) not null,
    "finished_at" timestamp with time zone,
    "migration_name" character varying(255) not null,
    "logs" text,
    "rolled_back_at" timestamp with time zone,
    "started_at" timestamp with time zone not null default now(),
    "applied_steps_count" integer not null default 0
);


create table "public"."foodEmbeddingCache" (
    "id" integer not null default nextval('"foodEmbeddingCache_id_seq"'::regclass),
    "textToEmbed" text not null,
    "adaEmbedding" vector(1536),
    "bgeBaseEmbedding" vector(768)
);


alter sequence "public"."ApiCalls_id_seq" owned by "public"."ApiCalls"."id";

alter sequence "public"."ApiTokens_id_seq" owned by "public"."ApiTokens"."id";

alter sequence "public"."FoodImage_id_seq" owned by "public"."FoodImage"."id";

alter sequence "public"."FoodItem_id_seq" owned by "public"."FoodItem"."id";

alter sequence "public"."LoggedFoodItem_id_seq" owned by "public"."LoggedFoodItem"."id";

alter sequence "public"."Message_id_seq" owned by "public"."Message"."id";

alter sequence "public"."Nutrient_id_seq" owned by "public"."Nutrient"."id";

alter sequence "public"."OpenAiUsage_id_seq" owned by "public"."OpenAiUsage"."id";

alter sequence "public"."Serving_id_seq" owned by "public"."Serving"."id";

alter sequence "public"."SmsMessage_id_seq" owned by "public"."SmsMessage"."id";

alter sequence "public"."UsdaFoodItemEmbedding_id_seq" owned by "public"."UsdaFoodItemEmbedding"."id";

alter sequence "public"."foodEmbeddingCache_id_seq" owned by "public"."foodEmbeddingCache"."id";

CREATE UNIQUE INDEX "Account_pkey" ON public."Account" USING btree (id);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");

CREATE UNIQUE INDEX "ApiCalls_pkey" ON public."ApiCalls" USING btree (id);

CREATE UNIQUE INDEX "ApiTokens_pkey" ON public."ApiTokens" USING btree (id);

CREATE UNIQUE INDEX "ApiTokens_token_key" ON public."ApiTokens" USING btree (token);

CREATE UNIQUE INDEX "FoodImage_pkey" ON public."FoodImage" USING btree (id);

CREATE UNIQUE INDEX "FoodItem_externalId_foodInfoSource_key" ON public."FoodItem" USING btree ("externalId", "foodInfoSource");

CREATE UNIQUE INDEX "FoodItem_name_brand_key" ON public."FoodItem" USING btree (name, brand);

CREATE UNIQUE INDEX "FoodItem_pkey" ON public."FoodItem" USING btree (id);

CREATE UNIQUE INDEX "LoggedFoodItem_pkey" ON public."LoggedFoodItem" USING btree (id);

CREATE UNIQUE INDEX "Message_pkey" ON public."Message" USING btree (id);

CREATE UNIQUE INDEX "Nutrient_pkey" ON public."Nutrient" USING btree (id);

CREATE UNIQUE INDEX "OpenAiUsage_pkey" ON public."OpenAiUsage" USING btree (id);

CREATE UNIQUE INDEX "Serving_pkey" ON public."Serving" USING btree (id);

CREATE UNIQUE INDEX "Session_pkey" ON public."Session" USING btree (id);

CREATE UNIQUE INDEX "Session_sessionToken_key" ON public."Session" USING btree ("sessionToken");

CREATE UNIQUE INDEX "SmsAuthCode_code_key" ON public."SmsAuthCode" USING btree (code);

CREATE UNIQUE INDEX "SmsAuthCode_pkey" ON public."SmsAuthCode" USING btree (id);

CREATE UNIQUE INDEX "SmsMessage_pkey" ON public."SmsMessage" USING btree (id);

CREATE INDEX "UsdaFoodItemEmbedding_bgeBaseEmbedding_idx" ON public."UsdaFoodItemEmbedding" USING hnsw ("bgeBaseEmbedding" vector_ip_ops) WITH (m='16', ef_construction='128');

CREATE UNIQUE INDEX "UsdaFoodItemEmbedding_fdcId_key" ON public."UsdaFoodItemEmbedding" USING btree ("fdcId");

CREATE UNIQUE INDEX "UsdaFoodItemEmbedding_pkey" ON public."UsdaFoodItemEmbedding" USING btree (id);

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

CREATE UNIQUE INDEX "User_phone_key" ON public."User" USING btree (phone);

CREATE UNIQUE INDEX "User_pkey" ON public."User" USING btree (id);

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON public."VerificationToken" USING btree (identifier, token);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON public."VerificationToken" USING btree (token);

CREATE UNIQUE INDEX _prisma_migrations_pkey ON public._prisma_migrations USING btree (id);

CREATE UNIQUE INDEX "foodEmbeddingCache_pkey" ON public."foodEmbeddingCache" USING btree (id);

CREATE UNIQUE INDEX "foodEmbeddingCache_textToEmbed_key" ON public."foodEmbeddingCache" USING btree ("textToEmbed");

alter table "public"."Account" add constraint "Account_pkey" PRIMARY KEY using index "Account_pkey";

alter table "public"."ApiCalls" add constraint "ApiCalls_pkey" PRIMARY KEY using index "ApiCalls_pkey";

alter table "public"."ApiTokens" add constraint "ApiTokens_pkey" PRIMARY KEY using index "ApiTokens_pkey";

alter table "public"."FoodImage" add constraint "FoodImage_pkey" PRIMARY KEY using index "FoodImage_pkey";

alter table "public"."FoodItem" add constraint "FoodItem_pkey" PRIMARY KEY using index "FoodItem_pkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_pkey" PRIMARY KEY using index "LoggedFoodItem_pkey";

alter table "public"."Message" add constraint "Message_pkey" PRIMARY KEY using index "Message_pkey";

alter table "public"."Nutrient" add constraint "Nutrient_pkey" PRIMARY KEY using index "Nutrient_pkey";

alter table "public"."OpenAiUsage" add constraint "OpenAiUsage_pkey" PRIMARY KEY using index "OpenAiUsage_pkey";

alter table "public"."Serving" add constraint "Serving_pkey" PRIMARY KEY using index "Serving_pkey";

alter table "public"."Session" add constraint "Session_pkey" PRIMARY KEY using index "Session_pkey";

alter table "public"."SmsAuthCode" add constraint "SmsAuthCode_pkey" PRIMARY KEY using index "SmsAuthCode_pkey";

alter table "public"."SmsMessage" add constraint "SmsMessage_pkey" PRIMARY KEY using index "SmsMessage_pkey";

alter table "public"."UsdaFoodItemEmbedding" add constraint "UsdaFoodItemEmbedding_pkey" PRIMARY KEY using index "UsdaFoodItemEmbedding_pkey";

alter table "public"."User" add constraint "User_pkey" PRIMARY KEY using index "User_pkey";

alter table "public"."_prisma_migrations" add constraint "_prisma_migrations_pkey" PRIMARY KEY using index "_prisma_migrations_pkey";

alter table "public"."foodEmbeddingCache" add constraint "foodEmbeddingCache_pkey" PRIMARY KEY using index "foodEmbeddingCache_pkey";

alter table "public"."Account" add constraint "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."Account" validate constraint "Account_userId_fkey";

alter table "public"."FoodImage" add constraint "FoodImage_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."FoodImage" validate constraint "FoodImage_foodItemId_fkey";

alter table "public"."FoodItem" add constraint "FoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE SET NULL not valid;

alter table "public"."FoodItem" validate constraint "FoodItem_messageId_fkey";

alter table "public"."FoodItem" add constraint "FoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE SET NULL not valid;

alter table "public"."FoodItem" validate constraint "FoodItem_userId_fkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "foodEmbeddingCache"(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."LoggedFoodItem" validate constraint "LoggedFoodItem_embeddingId_fkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."LoggedFoodItem" validate constraint "LoggedFoodItem_foodItemId_fkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE SET NULL not valid;

alter table "public"."LoggedFoodItem" validate constraint "LoggedFoodItem_messageId_fkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_servingId_fkey" FOREIGN KEY ("servingId") REFERENCES "Serving"(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."LoggedFoodItem" validate constraint "LoggedFoodItem_servingId_fkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."LoggedFoodItem" validate constraint "LoggedFoodItem_userId_fkey";

alter table "public"."Message" add constraint "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."Message" validate constraint "Message_userId_fkey";

alter table "public"."Nutrient" add constraint "Nutrient_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."Nutrient" validate constraint "Nutrient_foodItemId_fkey";

alter table "public"."OpenAiUsage" add constraint "OpenAiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."OpenAiUsage" validate constraint "OpenAiUsage_userId_fkey";

alter table "public"."Serving" add constraint "Serving_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."Serving" validate constraint "Serving_foodItemId_fkey";

alter table "public"."Session" add constraint "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."Session" validate constraint "Session_userId_fkey";

alter table "public"."SmsAuthCode" add constraint "SmsAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."SmsAuthCode" validate constraint "SmsAuthCode_userId_fkey";

alter table "public"."SmsMessage" add constraint "SmsMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) not valid;

alter table "public"."SmsMessage" validate constraint "SmsMessage_userId_fkey";




alter table "public"."User"
  enable row level security;

create policy "Public profiles are viewable by the owner of the profile." on "User"
  for select using (auth.uid() = id);

create policy "Users can insert their own profile." on "User"
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on "User"
  for update using (auth.uid() = id);


-- This trigger automatically creates a profile entry when a new user signs up via Supabase Auth.
-- See https://supabase.com/docs/guides/auth/managing-user-data#using-triggers for more details.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public."User" (id, "fullName", "avatarUrl")
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


