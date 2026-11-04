-- CC SafeGuard Live: Supabase foundation
-- Run this file in Supabase SQL Editor after creating a project.
-- Never put the service_role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','committee','clinic','marshal')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id,user_id)
);

create index if not exists event_members_user_idx on public.event_members(user_id);

create or replace function public.is_event_member(p_event uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.has_event_role(p_event uuid, p_roles text[])
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_members m
    where m.event_id = p_event and m.user_id = auth.uid()
      and m.active and m.role = any(p_roles)
  );
$$;

create table if not exists public.reports (
  id text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  report_type text not null check (report_type in ('medical','general')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'Perlu verifikasi',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_event_created_idx on public.reports(event_id,created_at desc);

create table if not exists public.report_evaluations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  report_id text not null references public.reports(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- Non-medical operational state only. Medical reports are kept in the reports
-- table so that RLS can separate them from general/committee data.
create table if not exists public.event_state (
  event_id uuid not null references public.events(id) on delete cascade,
  state_key text not null check (state_key in (
    'match','schedule','teams','cards','operations_audit','daily_archive'
  )),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_id,state_key)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid not null default auth.uid() references auth.users(id),
  action text not null,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_event_created_idx on public.audit_events(event_id,created_at desc);

create table if not exists public.notification_preferences (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sound_enabled boolean not null default false,
  vibration_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id,user_id)
);

create table if not exists public.sync_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  idempotency_key text not null,
  entity_type text not null,
  operation text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique(event_id,user_id,idempotency_key)
);

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.reports enable row level security;
alter table public.report_evaluations enable row level security;
alter table public.event_state enable row level security;
alter table public.audit_events enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.sync_queue enable row level security;

-- Event slug/name are non-sensitive routing metadata needed before sign-in.
-- Operational records remain protected by membership and table-specific RLS.
drop policy if exists "public can read event directory" on public.events;
create policy "public can read event directory" on public.events
for select to anon, authenticated using (true);

drop policy if exists "members can read own memberships" on public.event_members;
create policy "members can read own memberships" on public.event_members
for select to authenticated using (
  user_id = auth.uid() or public.has_event_role(event_id,array['admin'])
);

drop policy if exists "authorized users can read reports" on public.reports;
create policy "authorized users can read reports" on public.reports
for select to authenticated using (
  public.has_event_role(event_id,array['admin'])
  or (report_type='medical' and public.has_event_role(event_id,array['clinic']))
  or (report_type='general' and public.has_event_role(event_id,array['committee','marshal']))
);

drop policy if exists "members can create permitted reports" on public.reports;
create policy "members can create permitted reports" on public.reports
for insert to authenticated with check (
  created_by=auth.uid() and (
    public.has_event_role(event_id,array['admin'])
    or (report_type='medical' and public.has_event_role(event_id,array['clinic']))
    or (report_type='general' and public.has_event_role(event_id,array['committee','marshal']))
  )
);

drop policy if exists "authorized users can update reports" on public.reports;
create policy "authorized users can update reports" on public.reports
for update to authenticated using (
  public.has_event_role(event_id,array['admin'])
  or (report_type='medical' and public.has_event_role(event_id,array['clinic']))
  or (report_type='general' and public.has_event_role(event_id,array['committee','marshal']))
) with check (
  public.has_event_role(event_id,array['admin'])
  or (report_type='medical' and public.has_event_role(event_id,array['clinic']))
  or (report_type='general' and public.has_event_role(event_id,array['committee','marshal']))
);

drop policy if exists "report viewers can read evaluations" on public.report_evaluations;
create policy "report viewers can read evaluations" on public.report_evaluations
for select to authenticated using (
  exists (select 1 from public.reports r where r.id=report_id and r.event_id=report_evaluations.event_id)
);

drop policy if exists "admins can write evaluations" on public.report_evaluations;
create policy "admins can write evaluations" on public.report_evaluations
for all to authenticated using (public.has_event_role(event_id,array['admin']))
with check (public.has_event_role(event_id,array['admin']) and created_by=auth.uid());

drop policy if exists "members read operational state" on public.event_state;
create policy "members read operational state" on public.event_state
for select to authenticated using (
  public.has_event_role(event_id,array['admin','committee','marshal'])
  or (state_key='match' and public.has_event_role(event_id,array['clinic']))
);

drop policy if exists "authorized roles write operational state" on public.event_state;
create policy "authorized roles write operational state" on public.event_state
for all to authenticated using (
  public.has_event_role(event_id,array['admin'])
  or (state_key in ('match','schedule','teams','cards','operations_audit','daily_archive')
      and public.has_event_role(event_id,array['committee','marshal']))
) with check (
  updated_by=auth.uid() and (
    public.has_event_role(event_id,array['admin'])
    or public.has_event_role(event_id,array['committee','marshal'])
  )
);

drop policy if exists "members read audit events" on public.audit_events;
create policy "members read audit events" on public.audit_events
for select to authenticated using (
  public.has_event_role(event_id,array['admin']) or actor_id=auth.uid()
);

drop policy if exists "members append audit events" on public.audit_events;
create policy "members append audit events" on public.audit_events
for insert to authenticated with check (
  actor_id=auth.uid() and public.is_event_member(event_id)
);

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
for all to authenticated using (user_id=auth.uid() and public.is_event_member(event_id))
with check (user_id=auth.uid() and public.is_event_member(event_id));

drop policy if exists "users manage own sync queue" on public.sync_queue;
create policy "users manage own sync queue" on public.sync_queue
for all to authenticated using (user_id=auth.uid() and public.is_event_member(event_id))
with check (user_id=auth.uid() and public.is_event_member(event_id));

grant usage on schema public to authenticated;
grant select on public.events to anon, authenticated;
grant select on public.event_members to authenticated;
grant select,insert,update on public.reports to authenticated;
grant select,insert,update,delete on public.report_evaluations to authenticated;
grant select,insert,update on public.event_state to authenticated;
grant select,insert on public.audit_events to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select,insert,update on public.sync_queue to authenticated;

-- Realtime publication for cross-device updates.
do $$
begin
  alter publication supabase_realtime add table public.reports;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.event_state;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.audit_events;
exception when duplicate_object then null;
end $$;
