create type "public"."bug_type_enum" as enum ('bad_match', 'bad_food_icon', 'bad_food_info');

create sequence "public"."userSubmittedBug_id_seq";

create table "public"."userSubmittedBug" (
    "id" integer not null default nextval('"userSubmittedBug_id_seq"'::regclass),
    "created_at" timestamp with time zone not null default now(),
    "created_by_user" uuid not null default auth.uid(),
    "bug_type" bug_type_enum,
    "extra_details" text,
    "message_id" bigint,
    "logged_food_id" bigint,
    "food_item_id" bigint
);

alter table "public"."userSubmittedBug" enable row level security;

create policy "Enable insert for authenticated users only"
on "public"."userSubmittedBug"
as permissive
for insert
to authenticated
with check (true);

alter table "public"."LoggedFoodItem" add column "local_id" uuid;

alter table "public"."Message" add column "local_id" uuid;

alter sequence "public"."userSubmittedBug_id_seq" owned by "public"."userSubmittedBug"."id";

CREATE UNIQUE INDEX "LoggedFoodItem_local_id_key" ON public."LoggedFoodItem" USING btree (local_id);

CREATE UNIQUE INDEX "Message_local_id_key" ON public."Message" USING btree (local_id);

CREATE UNIQUE INDEX "userSubmittedBug_pkey" ON public."userSubmittedBug" USING btree (id);

alter table "public"."userSubmittedBug" add constraint "userSubmittedBug_pkey" PRIMARY KEY using index "userSubmittedBug_pkey";

alter table "public"."LoggedFoodItem" add constraint "LoggedFoodItem_local_id_key" UNIQUE using index "LoggedFoodItem_local_id_key";

alter table "public"."Message" add constraint "Message_local_id_key" UNIQUE using index "Message_local_id_key";

alter table "public"."userSubmittedBug" add constraint "userSubmittedBug_food_item_id_fkey" FOREIGN KEY (food_item_id) REFERENCES "FoodItem"(id) not valid;

alter table "public"."userSubmittedBug" validate constraint "userSubmittedBug_food_item_id_fkey";

alter table "public"."userSubmittedBug" add constraint "userSubmittedBug_logged_food_id_fkey" FOREIGN KEY (logged_food_id) REFERENCES "LoggedFoodItem"(id) not valid;

alter table "public"."userSubmittedBug" validate constraint "userSubmittedBug_logged_food_id_fkey";

alter table "public"."userSubmittedBug" add constraint "userSubmittedBug_message_id_fkey" FOREIGN KEY (message_id) REFERENCES "Message"(id) not valid;

alter table "public"."userSubmittedBug" validate constraint "userSubmittedBug_message_id_fkey";

