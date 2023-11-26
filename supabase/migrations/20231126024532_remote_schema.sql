
create policy "Enable read access for all users"
on "public"."FoodItem"
as permissive
for select
to public
using (true);



