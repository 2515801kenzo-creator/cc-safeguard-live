-- Let each authenticated role attach evidence to reports visible under its RLS role.
-- Committee access remains limited by can_access_report() to its own general reports.

drop policy if exists "upload photos by report owner or admin" on public.report_photos;
create policy "upload photos for accessible reports"
on public.report_photos for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.reports r
    where r.id = report_photos.report_id
      and public.can_access_report(r.category, r.created_by)
  )
);

drop policy if exists "upload photos by report owner or admin" on storage.objects;
create policy "upload photos for accessible reports"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'CC-report-photo'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(objects.name))[1]
      and public.can_access_report(r.category, r.created_by)
  )
);
