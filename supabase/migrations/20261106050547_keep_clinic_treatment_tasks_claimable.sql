create or replace function public.ccsg_claim_clinic_call(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_role text;
  v_duty text;
  v_report public.reports%rowtype;
  v_assigned integer;
  v_assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;

  select role into v_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_role is distinct from 'clinic' then
    raise exception 'Hanya akun Klinik/P3K yang dapat mengambil tugas.';
  end if;

  select duty_status into v_duty
  from public.clinic_staff_directory
  where user_id = auth.uid() and is_active = true
  for update;

  if v_duty is distinct from 'available' then
    raise exception 'Status petugas harus Siap bertugas untuk mengambil panggilan.';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id
  for update;

  if not found
     or v_report.category <> 'general'
     or v_report.needs_clinic is distinct from true
     or v_report.clinic_call_status not in ('requested','acknowledged','en_route','arrived','in_treatment') then
    raise exception 'Panggilan P3K tidak tersedia.';
  end if;

  select count(*) into v_assigned
  from public.clinic_call_assignments
  where report_id = p_report_id;

  if v_assigned >= v_report.clinic_requested_count then
    raise exception 'Semua slot petugas untuk panggilan ini sudah diambil.';
  end if;

  insert into public.clinic_call_assignments(report_id, clinic_user_id, status)
  values (p_report_id, auth.uid(), 'acknowledged')
  on conflict (report_id, clinic_user_id) do nothing
  returning id into v_assignment_id;

  if v_assignment_id is null then
    raise exception 'Akun ini sudah mengambil tugas pada laporan tersebut.';
  end if;

  update public.clinic_staff_directory
  set duty_status = 'busy', updated_at = now()
  where user_id = auth.uid();

  if v_report.clinic_assigned_to is null then
    update public.reports
    set clinic_assigned_to = auth.uid(),
        clinic_assigned_at = now(),
        clinic_call_status = 'acknowledged',
        clinic_call_updated_at = now(),
        updated_at = now()
    where id = p_report_id;
  end if;

  return v_assignment_id;
end;
$function$;

create or replace function public.guard_clinic_staff_duty_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.duty_status <> 'busy' and (
    exists (
      select 1 from public.reports r
      where r.clinic_assigned_to = new.user_id
        and r.clinic_call_status in ('acknowledged','en_route','arrived','in_treatment')
        and not exists (
          select 1 from public.clinic_call_assignments a
          where a.report_id = r.id and a.clinic_user_id = new.user_id
        )
    )
    or exists (
      select 1 from public.clinic_call_assignments a
      where a.clinic_user_id = new.user_id
        and a.status in ('acknowledged','en_route','arrived','in_treatment')
    )
  ) then
    raise exception 'Petugas masih menangani panggilan aktif. Selesaikan penanganan sebelum mengubah status.';
  end if;
  return new;
end;
$function$;

create or replace function public.ccsg_dispatch_report_push()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'vault', 'extensions', 'net'
as $function$
declare
  v_vapid_jwk text;
  v_token text;
  v_event text;
begin
  if TG_OP = 'INSERT' then
    v_event := 'new_report';
  elsif TG_OP = 'UPDATE' then
    if OLD.clinic_call_status is not distinct from NEW.clinic_call_status then
      return NEW;
    elsif NEW.clinic_call_status = 'requested' then
      v_event := 'clinic_call';
    elsif NEW.clinic_call_status in ('acknowledged','en_route','arrived','in_treatment','completed') then
      if exists (select 1 from public.clinic_call_assignments a where a.report_id = NEW.id) then
        return NEW;
      end if;
      v_event := 'clinic_update';
    else
      return NEW;
    end if;
  else
    return NEW;
  end if;

  select decrypted_secret into v_vapid_jwk
  from vault.decrypted_secrets
  where name = 'ccsg_vapid_keys_jwk'
  limit 1;

  if v_vapid_jwk is null or length(v_vapid_jwk) < 40 then
    raise warning 'CC SafeGuard Web Push is not configured; no push request was sent.';
    return NEW;
  end if;

  v_token := encode(extensions.digest(convert_to(v_vapid_jwk, 'UTF8'), 'sha256'), 'hex');

  begin
    perform net.http_post(
      url := 'https://vhovzyzktrzenuulznzv.supabase.co/functions/v1/send-web-push',
      body := jsonb_build_object(
        'event_type', v_event,
        'report_id', NEW.id,
        'category', NEW.category,
        'needs_clinic', coalesce(NEW.needs_clinic, false),
        'author_id', NEW.created_by,
        'clinic_call_status', NEW.clinic_call_status
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_PO48R3IsPnzH6ccOiafxWA_CTvZ_DVe',
        'x-ccsg-push-token', v_token
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'CC SafeGuard Web Push dispatch could not be queued.';
  end;
  return NEW;
end;
$function$;
