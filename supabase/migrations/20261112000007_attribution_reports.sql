-- Phase 4: booking attribution and reports.
--   rule = 'new_booking'        a new appointment made within the attribution window after we contacted the patient
--          'saved_appointment'  an at-risk appointment confirmed or attended after a reminder or staff action
-- The engine writes these rows (app/attribution.py); staff only read them.

alter table recovery.recovered_bookings
  add column rule text not null default 'new_booking' check (rule in ('new_booking', 'saved_appointment')),
  add column leak_type recovery.leak_type;

create index recovered_bookings_item_idx on recovery.recovered_bookings (recovery_item_id);

-- Everything the Reports screen shows for a period, in one call.
create or replace function recovery.report_summary(p_clinic_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not recovery.is_clinic_member(p_clinic_id) then
    raise exception 'not a member of clinic %', p_clinic_id using errcode = '42501';
  end if;

  with
  bookings as (
    select rb.*, a.treatment, a.starts_at,
           coalesce(p.full_name, i.patient_name) as patient_name,
           t.name as template_name,
           m.automation_rule_id is not null as automated
    from recovery.recovered_bookings rb
    join recovery.appointments a on a.id = rb.appointment_id
    left join recovery.patients p on p.id = rb.patient_id
    left join recovery.recovery_items i on i.id = rb.recovery_item_id
    left join recovery.outreach_messages m on m.id = rb.attributed_message_id
    left join recovery.message_templates t on t.id = m.template_id
    where rb.clinic_id = p_clinic_id and rb.booked_at >= p_from and rb.booked_at < p_to
  ),
  found as (
    select leak_type, count(*) as n from recovery.recovery_items
    where clinic_id = p_clinic_id and detected_at >= p_from and detected_at < p_to
    group by leak_type
  ),
  resolved as (
    select leak_type, status from recovery.recovery_items
    where clinic_id = p_clinic_id and resolved_at >= p_from and resolved_at < p_to
      and status in ('recovered', 'lost')
  ),
  outbound as (
    select status, automation_rule_id is not null as automated from recovery.outreach_messages
    where clinic_id = p_clinic_id and direction = 'outbound' and sent_at >= p_from and sent_at < p_to
  ),
  inbound as (
    select handled_at, ai_intent from recovery.outreach_messages
    where clinic_id = p_clinic_id and direction = 'inbound' and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'recovered_value', (select coalesce(sum(value), 0) from bookings),
    'recovered_bookings', (select count(*) from bookings),
    'new_bookings', (select count(*) from bookings where rule = 'new_booking'),
    'saved_appointments', (select count(*) from bookings where rule = 'saved_appointment'),
    'items_found', (select coalesce(sum(n), 0) from found),
    'items_recovered', (select count(*) from resolved where status = 'recovered'),
    'items_lost', (select count(*) from resolved where status = 'lost'),
    'recovery_rate', (select coalesce(round(count(*) filter (where status = 'recovered')::numeric / nullif(count(*), 0), 4), 0)
                        from resolved),
    'auto_resolved', (select count(*) from recovery.recovery_items
                        where clinic_id = p_clinic_id and resolved_at >= p_from and resolved_at < p_to
                          and resolution_note like 'Confirmed on WhatsApp%'),
    'messages', jsonb_build_object(
      'sent', (select count(*) from outbound),
      'automated', (select count(*) from outbound where automated),
      'delivered', (select count(*) from outbound where status in ('delivered', 'read', 'replied')),
      'read', (select count(*) from outbound where status in ('read', 'replied')),
      'replied', (select count(*) from outbound where status = 'replied'),
      'failed', (select count(*) from outbound where status = 'failed'),
      'received', (select count(*) from inbound),
      'ai_read', (select count(*) from inbound where ai_intent is not null)
    ),
    'by_leak', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'leak_type', l.leak_type,
        'found', coalesce((select n from found f where f.leak_type = l.leak_type), 0),
        'recovered', (select count(*) from resolved r where r.leak_type = l.leak_type and r.status = 'recovered'),
        'lost', (select count(*) from resolved r where r.leak_type = l.leak_type and r.status = 'lost'),
        'bookings', (select count(*) from bookings b where b.leak_type = l.leak_type),
        'recovered_value', (select coalesce(sum(b.value), 0) from bookings b where b.leak_type = l.leak_type)
      ) order by l.ord), '[]'::jsonb)
      from unnest(enum_range(null::recovery.leak_type)) with ordinality as l(leak_type, ord)
    ),
    'bookings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'booked_at', b.booked_at, 'value', b.value, 'rule', b.rule, 'leak_type', b.leak_type,
        'patient_name', b.patient_name, 'treatment', b.treatment, 'starts_at', b.starts_at,
        'template_name', b.template_name, 'automated', b.automated
      ) order by b.booked_at desc), '[]'::jsonb)
      from (select * from bookings order by booked_at desc limit 500) b
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function recovery.report_summary(uuid, timestamptz, timestamptz) to authenticated;
