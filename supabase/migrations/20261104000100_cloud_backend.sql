-- CC SafeGuard Live: shared cloud backend
-- Apply in Supabase SQL Editor or with Supabase CLI.
-- Roles are assigned by a trusted administrator; public users cannot choose their own role.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin','clinic','committee')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  category text not null check (category in ('medical','general')),
  title text not null check (char_length(title) between 1 and 100),
  priority text not null default 'Sedang' check (priority in ('Darurat','Tinggi','Sedang','Rendah')),
  status text not null default 'Perlu verifikasi' check (status in ('Baru','Perlu verifikasi','Diverifikasi','Sedang ditangani','Selesai','Ditolak')),
  verification text not null default 'Menunggu',
  reporter_name text not null,
  location text not null default '',
  description text not null check (char_length(description) between 1 and 5000),
  assignee text not null default '',
  handling_notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete restrict,
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists reports_category_created_idx on public.reports(category, created_at desc);
create index if not exists reports_status_priority_idx on public.reports(status, priority);
create index if not exists reports_created_by_idx on public.reports(created_by);
create index if not exists report_events_report_created_idx on public.report_events(report_id, created_at desc);
create index if not exists report_attachments_report_idx on public.report_attachments(report_id);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
  limit 1
$$;

create or replace function public.can_access_report(p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role() = 'admin'
    or (public.current_app_role() = 'clinic' and p_category = 'medical')
    or (public.current_app_role() = 'committee' and p_category = 'general'),
    false
  )
$$;

create or replace function public.set_report_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_report_updated_at();

create or replace function public.write_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
  v_action text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    v_report_id := new.id;
    v_action := 'Laporan dibuat';
    v_details := jsonb_build_object('category', new.category, 'status', new.status, 'priority', new.priority);
  else
    v_report_id := new.id;
    v_action := 'Laporan diperbarui';
    v_details := jsonb_build_object(
      'changed_fields', (
        select coalesce(jsonb_agg(key), '[]'::jsonb)
        from jsonb_each(to_jsonb(new)) n
        where to_jsonb(old) -> key is distinct from n.value
      ),
      'status', new.status,
      'priority', new.priority,
      'verification', new.verification
    );
  end if;

  insert into public.report_events(report_id, actor_id, action, details)
  values (v_report_id, auth.uid(), v_action, v_details);

  return new;
end;
$$;

drop trigger if exists reports_write_event on public.reports;
create trigger reports_write_event
after insert or update on public.reports
for each row execute function public.write_report_event();

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_events enable row level security;
alter table public.report_attachments enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.report_events from anon, authenticated;
revoke all on public.report_attachments from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.report_events to authenticated;
grant select, insert on public.report_attachments to authenticated;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.current_app_role() = 'admin');

drop policy if exists "reports_read_by_role" on public.reports;
create policy "reports_read_by_role"
on public.reports for select to authenticated
using (public.can_access_report(category));

drop policy if exists "reports_insert_by_role" on public.reports;
create policy "reports_insert_by_role"
on public.reports for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_access_report(category)
);

drop policy if exists "reports_update_by_role" on public.reports;
create policy "reports_update_by_role"
on public.reports for update to authenticated
using (public.can_access_report(category))
with check (public.can_access_report(category));

drop policy if exists "report_events_admin_read" on public.report_events;
create policy "report_events_admin_read"
on public.report_events for select to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists "attachments_read_by_report_access" on public.report_attachments;
create policy "attachments_read_by_report_access"
on public.report_attachments for select to authenticated
using (
  exists (
    select 1 from public.reports r
    where r.id = report_id and public.can_access_report(r.category)
  )
);

drop policy if exists "attachments_insert_for_own_report" on public.report_attachments;
create policy "attachments_insert_for_own_report"
on public.report_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.reports r
    where r.id = report_id
      and r.created_by = (select auth.uid())
      and public.can_access_report(r.category)
  )
);

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.can_access_report(text) to authenticated;

-- Private evidence bucket. Uploads are limited to image/PDF files and 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "report_evidence_read" on storage.objects;
create policy "report_evidence_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'report-evidence'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and public.can_access_report(r.category)
  )
);

drop policy if exists "report_evidence_insert" on storage.objects;
create policy "report_evidence_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-evidence'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and r.created_by = (select auth.uid())
      and public.can_access_report(r.category)
  )
);

drop policy if exists "report_evidence_delete_admin" on storage.objects;
create policy "report_evidence_delete_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-evidence'
  and public.current_app_role() = 'admin'
);
