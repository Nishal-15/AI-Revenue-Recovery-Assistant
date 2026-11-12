-- Privacy and integrity hardening.
--   1. Anonymous visitors cannot call any function in the recovery schema.
--   2. Staff change only workflow fields on worklist items; leaks and their values come from the engine.
--   3. Staff can queue outbound messages and approve or cancel them, but cannot forge delivery status,
--      inbound messages or AI output (those feed recovered revenue and reports).
--   4. Per-clinic switches: Gemini on/off and how long message text is kept.
--   5. recovery.forget_contact(): erase a person's messaging data on request, keeping only an opt-out.

-- 1 ---------------------------------------------------------------------------
revoke execute on all functions in schema recovery from public, anon;
grant execute on all functions in schema recovery to authenticated, service_role;
revoke execute on function recovery.install_default_automations(uuid) from authenticated;

-- 2 ---------------------------------------------------------------------------
revoke insert, update on recovery.recovery_items from authenticated;
grant update (status, snoozed_until, resolution_note, assigned_to) on recovery.recovery_items to authenticated;
drop policy if exists recovery_items_insert on recovery.recovery_items;

-- 3 ---------------------------------------------------------------------------
revoke insert, update on recovery.outreach_messages from authenticated;
grant insert (clinic_id, direction, channel, contact_phone, body, template_id, recovery_item_id,
              status, scheduled_for, created_by)
  on recovery.outreach_messages to authenticated;
grant update (status, approved_by, scheduled_for, error, handled_at) on recovery.outreach_messages to authenticated;

-- The engine connects without a user (auth.uid() is null) and is trusted; everyone else is checked here.
create or replace function recovery.guard_staff_outreach()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.direction <> 'outbound' or new.status <> 'queued' then
      raise exception 'staff can only queue outbound messages' using errcode = '42501';
    end if;
    if new.template_id is not null and not exists (
      select 1 from recovery.message_templates t where t.id = new.template_id and t.clinic_id = new.clinic_id
    ) then
      raise exception 'template belongs to another clinic' using errcode = '42501';
    end if;
    if new.recovery_item_id is not null and not exists (
      select 1 from recovery.recovery_items i where i.id = new.recovery_item_id and i.clinic_id = new.clinic_id
    ) then
      raise exception 'worklist item belongs to another clinic' using errcode = '42501';
    end if;
    new.created_by := v_user;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not ((old.status = 'awaiting_approval' and new.status in ('queued', 'cancelled'))
            or (old.status = 'queued' and new.status = 'cancelled')) then
      raise exception 'staff cannot change a message from % to %', old.status, new.status using errcode = '42501';
    end if;
    if new.status = 'queued' then
      new.approved_by := v_user;   -- the approver is always the person who approved
    end if;
  else
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

create trigger outreach_messages_staff_guard
  before insert or update on recovery.outreach_messages
  for each row execute function recovery.guard_staff_outreach();

-- 4 ---------------------------------------------------------------------------
alter table recovery.clinic_settings
  add column ai_enabled boolean not null default true,
  add column message_retention_days smallint not null default 365
    check (message_retention_days between 30 and 3650);

-- 5 ---------------------------------------------------------------------------
-- Deletes a phone number's messages, enquiries and enquiry-only worklist items. Patient records and their
-- appointments belong to the Dental OS (clinical record-keeping rules apply there) and are not touched.
-- An opt-out is kept so the number is never contacted again; the audit entry records counts, not the number.
create or replace function recovery.forget_contact(p_clinic_id uuid, p_phone text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_digits text := recovery.phone_digits(p_phone);
  v_messages int;
  v_items int;
  v_enquiries int;
begin
  if auth.uid() is not null and not recovery.is_clinic_manager(p_clinic_id) then
    raise exception 'only owners and managers can erase contact data' using errcode = '42501';
  end if;
  if length(v_digits) < 6 then
    raise exception 'not a valid phone number' using errcode = '22023';
  end if;

  delete from recovery.outreach_messages
  where clinic_id = p_clinic_id and recovery.phone_digits(contact_phone) = v_digits;
  get diagnostics v_messages = row_count;

  delete from recovery.recovery_items
  where clinic_id = p_clinic_id and patient_id is null and recovery.phone_digits(contact_phone) = v_digits;
  get diagnostics v_items = row_count;

  delete from recovery.enquiries
  where clinic_id = p_clinic_id and recovery.phone_digits(contact_phone) = v_digits;
  get diagnostics v_enquiries = row_count;

  delete from recovery.consents
  where clinic_id = p_clinic_id and recovery.phone_digits(contact_phone) = v_digits;
  insert into recovery.consents (clinic_id, contact_phone, channel, status, source)
  values (p_clinic_id, '+' || v_digits, 'whatsapp', 'opted_out', 'erasure_request');

  insert into recovery.audit_log (clinic_id, actor_id, action, entity, details)
  values (p_clinic_id, auth.uid(), 'contact.erased', 'contact',
          jsonb_build_object('messages', v_messages, 'enquiries', v_enquiries, 'items', v_items));

  return jsonb_build_object('messages', v_messages, 'enquiries', v_enquiries, 'items', v_items);
end;
$$;

revoke execute on function recovery.forget_contact(uuid, text) from public, anon;
grant execute on function recovery.forget_contact(uuid, text) to authenticated, service_role;
revoke execute on function recovery.guard_staff_outreach() from public, anon;
