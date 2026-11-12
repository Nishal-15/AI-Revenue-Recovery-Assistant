-- Phase 2: WhatsApp outreach.
--   * outreach_messages learns which automation step produced it, the template parameters, and
--     whether staff have handled an inbound message.
--   * Templates carry quick-reply buttons (Confirm, Reschedule, Book, Call me).
--   * automation_rules.steps format:
--       [{ "anchor": "due" | "detected", "offset_minutes": -2880, "template_id": "<uuid>" }, ...]
--     "due" = relative to the item's due_at (an appointment's start); "detected" = relative to when the leak was found.
--   * recovery.conversations: one row per phone number for the inbox.
--   * recovery.install_default_automations(clinic): starter templates and sequences for a new clinic.

alter table recovery.outreach_messages
  add column automation_rule_id uuid references recovery.automation_rules (id) on delete set null,
  add column step_index smallint check (step_index >= 0),
  add column template_params jsonb not null default '[]' check (jsonb_typeof(template_params) = 'array'),
  add column handled_at timestamptz,
  add column created_by uuid references auth.users (id) on delete set null;

-- An automation step is planned at most once per item, even if the planner runs twice at the same moment.
create unique index outreach_messages_step_once
  on recovery.outreach_messages (recovery_item_id, automation_rule_id, step_index)
  where automation_rule_id is not null;

create index outreach_messages_unhandled_idx
  on recovery.outreach_messages (clinic_id, contact_phone)
  where direction = 'inbound' and handled_at is null;

alter table recovery.message_templates
  add column buttons text[] not null default '{}' check (cardinality(buttons) <= 3);

-- One active sequence per leak type keeps "which reminders will this patient get" unambiguous.
create unique index automation_rules_one_active
  on recovery.automation_rules (clinic_id, leak_type)
  where is_active;

-- Digits only, so '+91 98450 12345', '919845012345' and '+919845012345' all match.
create or replace function recovery.phone_digits(p_phone text)
returns text
language sql immutable
as $$ select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') $$;

create index patients_phone_digits_idx on recovery.patients (clinic_id, recovery.phone_digits(phone));

create view recovery.conversations with (security_invoker = true) as
with last_message as (
  select distinct on (m.clinic_id, recovery.phone_digits(m.contact_phone))
         m.clinic_id, m.contact_phone, m.body, m.direction, m.status, m.created_at
  from recovery.outreach_messages m
  where m.status <> 'cancelled'
  order by m.clinic_id, recovery.phone_digits(m.contact_phone), m.created_at desc
)
select
  l.clinic_id,
  l.contact_phone,
  coalesce(
    (select p.full_name from recovery.patients p
      where p.clinic_id = l.clinic_id and recovery.phone_digits(p.phone) = recovery.phone_digits(l.contact_phone)
      order by p.created_at limit 1),
    (select e.contact_name from recovery.enquiries e
      where e.clinic_id = l.clinic_id and recovery.phone_digits(e.contact_phone) = recovery.phone_digits(l.contact_phone)
        and e.contact_name is not null
      order by e.received_at desc limit 1),
    l.contact_phone
  ) as contact_name,
  l.body as last_body,
  l.direction as last_direction,
  l.status as last_status,
  l.created_at as last_at,
  (select max(i.created_at) from recovery.outreach_messages i
    where i.clinic_id = l.clinic_id and i.direction = 'inbound'
      and recovery.phone_digits(i.contact_phone) = recovery.phone_digits(l.contact_phone)) as last_inbound_at,
  (select count(*) from recovery.outreach_messages u
    where u.clinic_id = l.clinic_id and u.direction = 'inbound' and u.handled_at is null
      and recovery.phone_digits(u.contact_phone) = recovery.phone_digits(l.contact_phone))::int as unhandled_count
from last_message l;

grant select on recovery.conversations to authenticated, service_role;

-- Starter templates and sequences. Template names must match templates approved in Meta Business Manager.
-- Body placeholders follow WhatsApp's {{1}}, {{2}} numbering; `variables` names what fills each one.
create or replace function recovery.install_default_automations(p_clinic_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_confirm uuid;
  v_final uuid;
  v_enquiry uuid;
  v_followup uuid;
begin
  insert into recovery.message_templates (clinic_id, leak_type, name, whatsapp_template_name, body, variables, buttons)
  values (p_clinic_id, 'unconfirmed_appointment', 'Appointment confirmation', 'appointment_confirmation',
          'Hi {{1}}, this is {{2}}. Your {{3}} is booked for {{4}}. Please tap Confirm, or Reschedule if the time no longer works for you.',
          array['patient_first_name', 'clinic_name', 'treatment', 'appointment_time'], array['Confirm', 'Reschedule'])
  on conflict (clinic_id, name) do update set body = excluded.body
  returning id into v_confirm;

  insert into recovery.message_templates (clinic_id, leak_type, name, whatsapp_template_name, body, variables, buttons)
  values (p_clinic_id, 'unconfirmed_appointment', 'Appointment final reminder', 'appointment_final_reminder',
          'Hi {{1}}, a quick reminder of your {{2}} at {{3}}. Tap Confirm so we can keep your slot ready.',
          array['patient_first_name', 'treatment', 'appointment_time'], array['Confirm', 'Reschedule'])
  on conflict (clinic_id, name) do update set body = excluded.body
  returning id into v_final;

  insert into recovery.message_templates (clinic_id, leak_type, name, whatsapp_template_name, body, variables, buttons)
  values (p_clinic_id, 'missed_enquiry', 'Enquiry follow-up', 'enquiry_followup',
          'Hi {{1}}, thank you for contacting {{2}}. We would be glad to help. Would you like us to book a consultation for you?',
          array['patient_first_name', 'clinic_name'], array['Book', 'Call me'])
  on conflict (clinic_id, name) do update set body = excluded.body
  returning id into v_enquiry;

  insert into recovery.message_templates (clinic_id, leak_type, name, whatsapp_template_name, body, variables, buttons)
  values (p_clinic_id, 'lapsed_patient', 'Follow-up due', 'followup_due',
          'Hi {{1}}, our records show your {{2}} is now due at {{3}}. Shall we find a time that suits you?',
          array['patient_first_name', 'procedure', 'clinic_name'], array['Book', 'Call me'])
  on conflict (clinic_id, name) do update set body = excluded.body
  returning id into v_followup;

  insert into recovery.automation_rules (clinic_id, leak_type, name, steps)
  select p_clinic_id, rule.leak_type::recovery.leak_type, rule.name, rule.steps
  from (values
    ('unconfirmed_appointment', 'Confirm upcoming appointments', jsonb_build_array(
      jsonb_build_object('anchor', 'due', 'offset_minutes', -2880, 'template_id', v_confirm),
      jsonb_build_object('anchor', 'due', 'offset_minutes', -1440, 'template_id', v_final))),
    ('missed_enquiry', 'Follow up unanswered enquiries', jsonb_build_array(
      jsonb_build_object('anchor', 'detected', 'offset_minutes', 0, 'template_id', v_enquiry),
      jsonb_build_object('anchor', 'detected', 'offset_minutes', 2880, 'template_id', v_enquiry))),
    ('lapsed_patient', 'Bring patients back for planned care', jsonb_build_array(
      jsonb_build_object('anchor', 'detected', 'offset_minutes', 0, 'template_id', v_followup),
      jsonb_build_object('anchor', 'detected', 'offset_minutes', 10080, 'template_id', v_followup)))
  ) as rule(leak_type, name, steps)
  where not exists (
    select 1 from recovery.automation_rules r
    where r.clinic_id = p_clinic_id and r.leak_type = rule.leak_type::recovery.leak_type and r.is_active
  );
end;
$$;

revoke execute on function recovery.install_default_automations(uuid) from public, authenticated;
grant execute on function recovery.install_default_automations(uuid) to service_role;

-- All messages with one phone number, however the number was formatted when stored.
create or replace function recovery.conversation_messages(p_clinic_id uuid, p_phone text)
returns setof recovery.outreach_messages
language sql stable security invoker
set search_path = ''
as $$
  select * from recovery.outreach_messages
  where clinic_id = p_clinic_id
    and recovery.phone_digits(contact_phone) = recovery.phone_digits(p_phone)
  order by created_at, id
$$;

grant execute on function recovery.conversation_messages(uuid, text) to authenticated;
