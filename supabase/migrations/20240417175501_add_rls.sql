alter table "public"."Account" enable row level security;

alter table "public"."ApiCalls" enable row level security;

alter table "public"."ApiTokens" enable row level security;

alter table "public"."Nutrient" enable row level security;

alter table "public"."OpenAiUsage" enable row level security;

alter table "public"."Serving" enable row level security;

alter table "public"."Session" enable row level security;

alter table "public"."SmsAuthCode" enable row level security;

alter table "public"."SmsMessage" enable row level security;

alter table "public"."UsdaFoodItemEmbedding" enable row level security;

alter table "public"."UserMessageImages" enable row level security;

alter table "public"."VerificationToken" enable row level security;

alter table "public"."_prisma_migrations" enable row level security;

alter table "public"."foodEmbeddingCache" enable row level security;

create policy "Enable read access for all users"
on "public"."Nutrient"
as permissive
for select
to public
using (true);


create policy "Enable read access for all users"
on "public"."Serving"
as permissive
for select
to public
using (true);


create policy "Enable read access for all users"
on "public"."UsdaFoodItemEmbedding"
as permissive
for select
to public
using (true);


create policy "Enable read access for users to only view their message images"
on "public"."UserMessageImages"
as permissive
for select
to public
using ((auth.uid() = "userId"));


create policy "Insert user message image"
on "public"."UserMessageImages"
as permissive
for insert
to public
with check ((auth.uid() = "userId"));


create policy "Update user message image"
on "public"."UserMessageImages"
as permissive
for update
to public
using ((auth.uid() = "userId"));


create policy "UserCanEditUploadedImages"
on "public"."UserMessageImages"
as permissive
for all
to public
using ((auth.uid() = "userId"));


create policy "Enable read access for all users"
on "public"."foodEmbeddingCache"
as permissive
for select
to public
using (true);