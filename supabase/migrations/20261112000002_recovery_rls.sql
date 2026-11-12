-- Row Level Security: staff see only the clinics they belong to.
-- The Python engine connects with the service role / postgres user, which bypasses RLS.

create or replace function recovery.is_clinic_member(p_clinic_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from recovery.clinic_staff s
    where s.clinic_id = p_clinic_id and s.user_id = auth.uid()
  );
$$;

create or replace function recovery.is_clinic_manager(p_clinic_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from recovery.clinic_staff s
    where s.clinic_id = p_clinic_id and s.user_id = auth.uid() and s.role in ('owner', 'manager')
  );
$$;

grant usage on schema recovery to authenticated, service_role;
grant all on all tables in schema recovery to service_role;
grant all on all sequences in schema recovery to service_role;
grant execute on all functions in schema recovery to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'clinics', 'clinic_staff', 'patients', 'appointments', 'planned_followups', 'staff_tasks',
    'clinic_settings', 'enquiries', 'recovery_items', 'message_templates', 'automation_rules',
    'outreach_messages', 'consents', 'recovered_bookings', 'audit_log'
  ] loop
    execute format('alter table recovery.%I enable row level security', t);
  end loop;
end;
$$;

-- Clinic record: members read it, managers edit it. Creating clinics is done by the engine / onboarding.
grant select, update on recovery.clinics to authenticated;
create policy clinics_read on recovery.clinics for select to authenticated
  using (recovery.is_clinic_member(id));
create policy clinics_manage on recovery.clinics for update to authenticated
  using (recovery.is_clinic_manager(id)) with check (recovery.is_clinic_manager(id));

-- Staff membership: members see colleagues; managers add and remove them.
grant select, insert, update, delete on recovery.clinic_staff to authenticated;
create policy clinic_staff_read on recovery.clinic_staff for select to authenticated
  using (recovery.is_clinic_member(clinic_id));
create policy clinic_staff_manage on recovery.clinic_staff for all to authenticated
  using (recovery.is_clinic_manager(clinic_id)) with check (recovery.is_clinic_manager(clinic_id));

-- Practice data and day-to-day recovery work: any member reads and writes; only managers delete.
do $$
declare t text;
begin
  foreach t in array array[
    'patients', 'appointments', 'planned_followups', 'staff_tasks',
    'enquiries', 'recovery_items', 'outreach_messages', 'consents'
  ] loop
    execute format('grant select, insert, update, delete on recovery.%I to authenticated', t);
    execute format(
      'create policy %I on recovery.%I for select to authenticated using (recovery.is_clinic_member(clinic_id))',
      t || '_read', t);
    execute format(
      'create policy %I on recovery.%I for insert to authenticated with check (recovery.is_clinic_member(clinic_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on recovery.%I for update to authenticated using (recovery.is_clinic_member(clinic_id)) with check (recovery.is_clinic_member(clinic_id))',
      t || '_update', t);
    execute format(
      'create policy %I on recovery.%I for delete to authenticated using (recovery.is_clinic_manager(clinic_id))',
      t || '_delete', t);
  end loop;
end;
$$;

-- Configuration: everyone reads, managers edit.
do $$
declare t text;
begin
  foreach t in array array['clinic_settings', 'message_templates', 'automation_rules'] loop
    execute format('grant select, insert, update, delete on recovery.%I to authenticated', t);
    execute format(
      'create policy %I on recovery.%I for select to authenticated using (recovery.is_clinic_member(clinic_id))',
      t || '_read', t);
    execute format(
      'create policy %I on recovery.%I for all to authenticated using (recovery.is_clinic_manager(clinic_id)) with check (recovery.is_clinic_manager(clinic_id))',
      t || '_manage', t);
  end loop;
end;
$$;

-- Attribution and the audit trail are written only by the engine; staff read them.
grant select on recovery.recovered_bookings, recovery.audit_log to authenticated;
create policy recovered_bookings_read on recovery.recovered_bookings for select to authenticated
  using (recovery.is_clinic_member(clinic_id));
create policy audit_log_read on recovery.audit_log for select to authenticated
  using (recovery.is_clinic_member(clinic_id));
