-- Additive integration migration for the pre-existing CC SafeGuard schema.
-- Existing project schema uses profiles.username/is_active, report_photos, and activity_log.

create index if not exists activity_log_actor_created_idx
  on public.activity_log(actor_id, created_at desc);
create index if not exists activity_log_created_idx
  on public.activity_log(created_at desc);
create index if not exists report_photos_uploaded_by_idx
  on public.report_photos(uploaded_by);

drop policy if exists "committee update own general reports" on public.reports;
create policy "committee update own general reports"
on public.reports for update to authenticated
using (public.current_role() = 'committee' and category = 'general' and created_by = (select auth.uid()))
with check (public.current_role() = 'committee' and category = 'general' and created_by = (select auth.uid()));

drop policy if exists "upload photo to own report" on public.report_photos;
drop policy if exists "upload photos by report owner or admin" on public.report_photos;
create policy "upload photos by report owner or admin"
on public.report_photos for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.reports r
    where r.id = report_photos.report_id
      and (r.created_by = (select auth.uid()) or public.current_role() = 'admin')
      and public.can_access_report(r.category, r.created_by)
  )
);

drop policy if exists "upload photos to own reports" on storage.objects;
drop policy if exists "upload photos by report owner or admin" on storage.objects;
create policy "upload photos by report owner or admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'CC-report-photo'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(objects.name))[1]
      and (r.created_by = (select auth.uid()) or public.current_role() = 'admin')
      and public.can_access_report(r.category, r.created_by)
  )
);

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'CC-report-photo';

create or replace function public.record_activity(
  p_action text,
  p_report_code text default null,
  p_category text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.is_active = true) then
    raise exception 'Active profile required';
  end if;
  if p_action is null or char_length(trim(p_action)) < 1 or char_length(p_action) > 100 then
    raise exception 'Invalid activity action';
  end if;
  insert into public.activity_log(actor_id, action, report_code, category)
  values (v_actor, trim(p_action), nullif(p_report_code, ''), nullif(p_category, ''));
end;
$$;

revoke all on function public.record_activity(text, text, text) from public, anon;
grant execute on function public.record_activity(text, text, text) to authenticated;
revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;
revoke all on function public.can_access_report(text, uuid) from public, anon;
grant execute on function public.can_access_report(text, uuid) to authenticated;
revoke all on function public.log_report_activity() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.reports;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.report_photos;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.activity_log;
  exception when duplicate_object then null; end;
end
$$;
