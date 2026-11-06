alter table public.reports
  drop constraint if exists reports_clinic_call_status_check;
alter table public.reports
  add constraint reports_clinic_call_status_check
  check (clinic_call_status = any (array[
    'not_requested','requested','acknowledged','en_route','arrived',
    'in_treatment','completed'
  ]::text[]));

alter table public.clinic_call_assignments
  drop constraint if exists clinic_call_assignments_status_check;
alter table public.clinic_call_assignments
  add constraint clinic_call_assignments_status_check
  check (status = any (array[
    'acknowledged','en_route','arrived','in_treatment','completed'
  ]::text[]));

create or replace function public.guard_report_update_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_role text := public."current_role"();
begin
  if v_role = 'clinic' then
    if old.category = 'medical' and new.category = 'medical' then
      if (to_jsonb(new) - array['status','assignee','handling_notes','updated_at'])
         <> (to_jsonb(old) - array['status','assignee','handling_notes','updated_at']) then
        raise exception 'Klinik hanya boleh mengubah status dan informasi penanganan laporan medis.';
      end if;
      if new.status not in ('Sedang ditangani','Selesai') then
        raise exception 'Status penanganan Klinik tidak valid.';
      end if;
      if new.assignee is null or btrim(new.assignee) = '' then
        raise exception 'Nama petugas yang menangani wajib diisi.';
      end if;
    elsif old.category = 'general' and new.category = 'general' and old.needs_clinic = true and new.needs_clinic = true then
      if (to_jsonb(new) - array['clinic_call_status','clinic_call_updated_at','clinic_assigned_to','clinic_assigned_at','status','updated_at'])
         <> (to_jsonb(old) - array['clinic_call_status','clinic_call_updated_at','clinic_assigned_to','clinic_assigned_at','status','updated_at']) then
        raise exception 'P3K hanya boleh memperbarui status respons dan penugasan pada laporan umum yang memanggil P3K.';
      end if;

      if new.status is distinct from old.status
        and current_setting('app.ccsg_clinic_status_sync', true) is distinct from 'true' then
        raise exception 'Status laporan umum hanya dapat disinkronkan melalui alur tugas P3K.';
      end if;

      if old.clinic_assigned_to is null then
        if new.clinic_assigned_to is distinct from auth.uid()
          or new.clinic_assigned_at is null
          or new.clinic_call_status <> 'acknowledged' then
          raise exception 'Panggilan harus diterima dan dicatat oleh petugas P3K yang sedang login.';
        end if;
      else
        if new.clinic_assigned_to is distinct from old.clinic_assigned_to
          or new.clinic_assigned_at is distinct from old.clinic_assigned_at
          or not exists (
            select 1 from public.clinic_call_assignments a
            where a.report_id = old.id and a.clinic_user_id = auth.uid()
          ) then
          raise exception 'Hanya petugas yang memiliki tugas pada panggilan ini yang dapat memperbarui statusnya.';
        end if;
      end if;

      if new.clinic_call_status not in ('requested','acknowledged','en_route','arrived','in_treatment','completed') then
        raise exception 'Status respons P3K tidak valid.';
      end if;
      if new.clinic_call_updated_at is null then
        raise exception 'Waktu respons P3K wajib dicatat.';
      end if;
    else
      raise exception 'Klinik hanya dapat menangani laporan medis atau laporan umum yang memanggil P3K.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.ccsg_update_clinic_assignment(
  p_assignment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_role text;
  v_assignment public.clinic_call_assignments%rowtype;
  v_active integer;
  v_total integer;
  v_requested integer;
  v_summary text;
  v_previous_sync text := current_setting('app.ccsg_clinic_status_sync', true);
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;

  select role into v_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_role is distinct from 'clinic' then
    raise exception 'Hanya petugas Klinik/P3K yang dapat memperbarui tugas.';
  end if;

  select * into v_assignment
  from public.clinic_call_assignments
  where id = p_assignment_id and clinic_user_id = auth.uid()
  for update;

  if not found then raise exception 'Tugas tidak ditemukan untuk akun ini.'; end if;

  if not (
    (v_assignment.status = 'acknowledged' and p_status = 'en_route') or
    (v_assignment.status = 'en_route' and p_status = 'arrived') or
    (v_assignment.status = 'arrived' and p_status = 'in_treatment') or
    (v_assignment.status = 'in_treatment' and p_status = 'completed')
  ) then
    raise exception 'Urutan status tugas tidak valid.';
  end if;

  update public.clinic_call_assignments
  set status = p_status, updated_at = now()
  where id = p_assignment_id;

  select count(*) filter (
           where status in ('acknowledged','en_route','arrived','in_treatment')
         ),
         count(*)
    into v_active, v_total
  from public.clinic_call_assignments
  where report_id = v_assignment.report_id;

  select clinic_requested_count into v_requested
  from public.reports
  where id = v_assignment.report_id;

  if v_active > 0 then
    select status into v_summary
    from public.clinic_call_assignments
    where report_id = v_assignment.report_id
      and status in ('acknowledged','en_route','arrived','in_treatment')
    order by case status
      when 'in_treatment' then 4
      when 'arrived' then 3
      when 'en_route' then 2
      else 1
    end desc, updated_at desc
    limit 1;
  elsif v_total < v_requested then
    v_summary := 'requested';
  else
    v_summary := 'completed';
  end if;

  perform set_config('app.ccsg_clinic_status_sync', 'true', true);

  update public.reports
  set clinic_call_status = v_summary,
      clinic_call_updated_at = now(),
      status = case
        when v_summary = 'completed' then 'Selesai'
        when p_status in ('en_route','arrived','in_treatment')
          or v_summary in ('en_route','arrived','in_treatment')
          then 'Sedang ditangani'
        else status
      end,
      updated_at = now()
  where id = v_assignment.report_id;

  perform set_config('app.ccsg_clinic_status_sync', coalesce(v_previous_sync, ''), true);

  select count(*) into v_active
  from public.clinic_call_assignments
  where clinic_user_id = auth.uid()
    and status in ('acknowledged','en_route','arrived','in_treatment');

  update public.clinic_staff_directory
  set duty_status = case when v_active = 0 then 'available' else 'busy' end,
      updated_at = now()
  where user_id = auth.uid();
end;
$function$;

revoke all on function public.ccsg_update_clinic_assignment(uuid,text) from public, anon;
grant execute on function public.ccsg_update_clinic_assignment(uuid,text) to authenticated;
