-- Give every staff account a private report workspace.
-- Admin remains the shared oversight role and can read every report.
-- Panitia can access only its own general reports.
-- Klinik/P3K can access only its own medical reports.
-- Photo metadata and private Storage object policies reuse can_access_report.

begin;

create or replace function public.can_access_report(report_category text, report_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select case public.current_role()
    when 'admin' then true
    when 'clinic' then report_category = 'medical' and report_owner = auth.uid()
    when 'committee' then report_category = 'general' and report_owner = auth.uid()
    else false
  end;
$function$;

drop policy if exists "clinic update medical handling" on public.reports;
drop policy if exists "clinic update own medical handling" on public.reports;
create policy "clinic update own medical handling"
on public.reports
for update
to authenticated
using (
  public.current_role() = 'clinic'
  and category = 'medical'
  and created_by = auth.uid()
)
with check (
  public.current_role() = 'clinic'
  and category = 'medical'
  and created_by = auth.uid()
);

commit;
