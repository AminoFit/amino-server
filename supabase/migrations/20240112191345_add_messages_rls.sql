create policy "InsertMessage"
on "public"."Message"
as permissive
for insert
to public
with check ((auth.uid() = "userId"));


create policy "UpdateMessage"
on "public"."Message"
as permissive
for update
to public
using ((auth.uid() = "userId"));



