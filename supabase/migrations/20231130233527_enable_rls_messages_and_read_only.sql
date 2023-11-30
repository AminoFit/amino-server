alter table "public"."Message" enable row level security;

create policy "Enable read only access for users to only view their messages"
on "public"."Message"
as permissive
for select
to public
using ((auth.uid() = "userId"));



