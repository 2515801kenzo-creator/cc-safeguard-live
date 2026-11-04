-- CC SafeGuard Live: expand Admin activity audit log.
-- Run this once in Supabase SQL Editor for projects that already ran the earlier schema.
alter table public.activity_log add column if not exists actor_name text;
alter table public.activity_log add column if not exists target_username text;
alter table public.activity_log add column if not exists result text not null default 'success';
alter table public.activity_log add column if not exists details text;

create or replace function public.log_report_activity()
returns trigger
language plpgsql security definer
set search_path = public
as $function$
declare
  actor_label text;
begin
  select display_name into actor_label from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.activity_log(actor_id,actor_name,action,report_id,report_code,category,result)
    values (auth.uid(),actor_label,'Laporan dibuat',new.id,new.report_code,new.category,'success');
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log(actor_id,actor_name,action,report_id,report_code,category,result)
    values (auth.uid(),actor_label,'Laporan diperbarui',new.id,new.report_code,new.category,'success');
  end if;
  return new;
end;
$function$;
