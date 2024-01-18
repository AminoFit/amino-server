create policy "Give users access to own folder 1ppdm03_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'userUploadedImages'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


create policy "Give users access to own folder 1ppdm03_1"
on "storage"."objects"
as permissive
for insert
to public
with check (((bucket_id = 'userUploadedImages'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


create policy "Give users access to own folder 1ppdm03_2"
on "storage"."objects"
as permissive
for delete
to public
using (((bucket_id = 'userUploadedImages'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


create policy "Give users access to own folder 1ppdm03_3"
on "storage"."objects"
as permissive
for update
to public
using (((bucket_id = 'userUploadedImages'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



