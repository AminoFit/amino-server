alter table "public"."Message" alter column "local_id" set data type character varying(255) using "local_id"::character varying(255);


