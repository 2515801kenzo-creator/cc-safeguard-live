-- CC SafeGuard: ensure private photo uploads use the frontend's bucket name.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ccsg-report-photos','ccsg-report-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set name=excluded.name, public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "upload photos for accessible reports" on storage.objects;
create policy "upload photos for accessible reports" on storage.objects
for insert to authenticated
with check (
  bucket_id='ccsg-report-photos'
  and exists (
    select 1 from public.reports r
    where r.id::text=(storage.foldername(name))[1]
      and public.can_access_report(r.category,r.created_by)
  )
);

-- Legacy RPC can let users create misleading audit entries; the portal does not use it.
revoke all on function public.record_activity(text,text,text) from public, anon, authenticated;
