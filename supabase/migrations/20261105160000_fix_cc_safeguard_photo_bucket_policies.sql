-- Correct private Storage policies for the bucket used by the website.
-- Keep the bucket private; only users who can access the related report may access its photo.
drop policy if exists "CC SafeGuard upload report photos" on storage.objects;
create policy "CC SafeGuard upload report photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'CC-report-photo'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and (r.created_by = (select auth.uid()) or public.current_role() = 'admin')
      and public.can_access_report(r.category, r.created_by)
  )
);

drop policy if exists "CC SafeGuard read report photos" on storage.objects;
create policy "CC SafeGuard read report photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'CC-report-photo'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and public.can_access_report(r.category, r.created_by)
  )
);

drop policy if exists "CC SafeGuard admin delete report photos" on storage.objects;
create policy "CC SafeGuard admin delete report photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'CC-report-photo'
  and public.current_role() = 'admin'
);
