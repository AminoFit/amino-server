alter table "public"."LoggedFoodItem" add column "isBadFoodItemRequest" boolean default false;

alter table "public"."Message" add column "isBadFoodRequest" boolean;

alter table "public"."OpenAiUsage" add column "completionTimeMs" bigint;

alter table "public"."OpenAiUsage" add column "provider" text;


