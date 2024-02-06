alter table "public"."OpenAiUsage" alter column "completionTimeMs" set data type integer using "completionTimeMs"::integer;
