alter table "public"."FoodImage" add column "bgeBaseEmbedding" vector(768);

alter table "public"."FoodImage" add column "imageDescription" text;

alter table "public"."FoodImage" enable row level security;


create policy "Enable read access for all users"
on "public"."FoodImage"
as permissive
for select
to public
using (true);



