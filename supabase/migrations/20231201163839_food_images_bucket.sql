insert into "storage"."buckets" (id, name, public) 
    values('foodimages', 'foodimages', TRUE);

create policy "Give anon users access to PNG images in folder 3kf6ty_0"
on "storage"."objects"
as permissive
for select
to public
using (((bucket_id = 'foodimages'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));



