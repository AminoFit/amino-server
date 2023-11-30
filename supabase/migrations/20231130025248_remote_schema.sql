
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_created_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."createdAt" := NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$function$
;

create policy "DeleteLoggedFoodItem"
on "public"."LoggedFoodItem"
as permissive
for delete
to public
using ((auth.uid() = "userId"));


create policy "InsertLoggedFoodItem"
on "public"."LoggedFoodItem"
as permissive
for insert
to public
with check ((auth.uid() = "userId"));


create policy "UpdateLoggedFoodItem"
on "public"."LoggedFoodItem"
as permissive
for update
to public
using ((auth.uid() = "userId"));


CREATE TRIGGER trigger_set_created_at BEFORE INSERT ON public."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION set_created_at();

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON public."LoggedFoodItem" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


