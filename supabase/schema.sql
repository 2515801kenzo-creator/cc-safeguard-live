-- CC SafeGuard Live: Supabase schema
-- Run in Supabase SQL Editor after creating a project.
-- Medical data is restricted by role. Keep the Storage bucket private.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('admin','committee','clinic')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  category text not null check (category in ('general','medical')),
  title text not null,
  reporter_name text not null,
  location text,
  priority text not null check (priority in ('Darurat','Tinggi','Sedang','Rendah')),
  status text not null default 'Perlu verifikasi'
    check (status in ('Baru','Perlu verifikasi','Diverifikasi','Sedang ditangani','Selesai','Ditolak')),
  description text not null,
  verification text not null default 'Menunggu',
  assignee text,
  handling_notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  report_id uuid references public.reports(id) on delete set null,
  report_code text,
  category text,
  created_at timestamptz not null default now()
);

create index if not exists reports_category_created_idx on public.reports(category, created_at desc);
create index if not exists reports_status_idx on public.reports(status);
create index if not exists photos_report_idx on public.report_photos(report_id);
create index if not exists activity_created_idx on public.activity_log(created_at desc);

create or replace function public.current_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.can_access_report(report_category text)
returns boolean language sql stable security definer
set search_path = public
as $$
  select case public.current_role()
    when 'admin' then true
    when 'clinic' then report_category = 'medical'
    when 'committee' then report_category = 'general'
    else false
  end;
$$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_photos enable row level security;
alter table public.activity_log enable row level security;

-- Users can read their own profile; Admin can read all profiles.
drop policy if exists "profile self or admin read" on public.profiles;
create policy "profile self or admin read" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_role() = 'admin');

-- Reports: role-limited visibility. Admin has full access.
drop policy if exists "read reports by role" on public.reports;
create policy "read reports by role" on public.reports
for select to authenticated
using (public.can_access_report(category));

drop policy if exists "insert reports by role" on public.reports;
create policy "insert reports by role" on public.reports
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_report(category)
  and public.current_role() in ('admin','clinic','committee')
);

-- Only Admin can edit/verify/assign/close reports. This keeps the audit trail controlled.
drop policy if exists "admin update reports" on public.reports;
create policy "admin update reports" on public.reports
for update to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "admin delete reports" on public.reports;
create policy "admin delete reports" on public.reports
for delete to authenticated
using (public.current_role() = 'admin');

-- Photo metadata follows the same report visibility rules.
drop policy if exists "read photos with report access" on public.report_photos;
create policy "read photos with report access" on public.report_photos
for select to authenticated
using (exists (
  select 1 from public.reports r
  where r.id = report_id and public.can_access_report(r.category)
));

drop policy if exists "upload photo to own report" on public.report_photos;
create policy "upload photo to own report" on public.report_photos
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.reports r
    where r.id = report_id
      and r.created_by = auth.uid()
      and public.can_access_report(r.category)
  )
);

drop policy if exists "admin delete photo metadata" on public.report_photos;
create policy "admin delete photo metadata" on public.report_photos
for delete to authenticated
using (public.current_role() = 'admin');

-- Activity logs: Admin can read; authenticated users can write only their own event.
drop policy if exists "admin read activity" on public.activity_log;
create policy "admin read activity" on public.activity_log
for select to authenticated
using (public.current_role() = 'admin');

drop policy if exists "write own activity" on public.activity_log;
create policy "write own activity" on public.activity_log
for insert to authenticated
with check (actor_id = auth.uid());

-- Trigger: record report creation/update without storing medical narrative in the audit log.
create or replace function public.log_report_activity()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.activity_log(actor_id, action, report_id, report_code, category)
    values (auth.uid(), 'Laporan dibuat', NEW.id, NEW.report_code, NEW.category);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.activity_log(actor_id, action, report_id, report_code, category)
    values (auth.uid(), 'Laporan diperbarui', NEW.id, NEW.report_code, NEW.category);
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists reports_activity_trigger on public.reports;
create trigger reports_activity_trigger
after insert or update on public.reports
for each row execute function public.log_report_activity();

-- Create a PRIVATE bucket named "ccsg-report-photos" in Storage.
-- Storage policies below allow only authorized users to access photo paths:
-- path convention: <report UUID>/<random filename.ext>
drop policy if exists "read photos with report access" on storage.objects;
create policy "read photos with report access" on storage.objects
for select to authenticated
using (
  bucket_id = 'ccsg-report-photos'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and public.can_access_report(r.category)
  )
);

drop policy if exists "upload photos to own reports" on storage.objects;
create policy "upload photos to own reports" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ccsg-report-photos'
  and exists (
    select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[1]
      and r.created_by = auth.uid()
      and public.can_access_report(r.category)
  )
);

drop policy if exists "admin delete report photos" on storage.objects;
create policy "admin delete report photos" on storage.objects
for delete to authenticated
using (bucket_id = 'ccsg-report-photos' and public.current_role() = 'admin');

-- IMPORTANT: create the first Admin account in Supabase Auth Dashboard,
-- then insert its matching profile manually:
-- insert into public.profiles(id, username, display_name, role)
-- values ('AUTH_USER_UUID', 'your-admin-username', 'Super Admin', 'admin');
