alter table "public"."FoodItem" add column "createdAtDateTime" timestamp with time zone not null default (now() AT TIME ZONE 'utc'::text);

alter table "public"."FoodItem" enable row level security;

alter table "public"."LoggedFoodItem" enable row level security;

create policy "Enable read access for users to only view their logged items"
on "public"."LoggedFoodItem"
as permissive
for select
to public
using ((auth.uid() = "userId"));



