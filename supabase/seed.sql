-- Local demo data for one clinic. Never run against production.
-- After signing up locally, give yourself access:
--   insert into recovery.clinic_staff (clinic_id, user_id, full_name, role)
--   values ('00000000-0000-0000-0000-00000000c001', '<your auth.users id>', 'Your Name', 'owner');

insert into recovery.clinics (id, name, phone, whatsapp_number, address) values
  ('00000000-0000-0000-0000-00000000c001', 'Smile Studio Dental', '+918000000000', '+918000000000', 'Indiranagar, Bengaluru');

insert into recovery.clinic_settings (clinic_id) values ('00000000-0000-0000-0000-00000000c001');

insert into recovery.patients (id, clinic_id, full_name, phone, last_visit_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c001', 'Ananya Rao',   '+919800000001', now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000c001', 'Vikram Shah',  '+919800000002', now() - interval '45 days'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000c001', 'Rahul Menon',  '+919800000003', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c001', 'Fatima Khan',  '+919800000004', now() - interval '200 days'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000c001', 'Arjun Pillai', '+919800000005', now() - interval '5 days');

insert into recovery.appointments (id, clinic_id, patient_id, starts_at, ends_at, status, treatment, estimated_value) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1',
   now() + interval '20 hours', now() + interval '21 hours', 'scheduled', 'Implant consultation', 45000),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a5',
   now() + interval '50 hours', now() + interval '51 hours', 'scheduled', 'Scaling', 2500),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a3',
   now() + interval '30 hours', now() + interval '31 hours', 'confirmed', 'Filling', 3500);

insert into recovery.planned_followups (id, clinic_id, patient_id, kind, procedure, due_on, estimated_value) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a2',
   'treatment_step', 'Crown after root canal', current_date - 12, 18000),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a4',
   'recall', '6-month hygiene recall', current_date - 21, 2500);

insert into recovery.staff_tasks (id, clinic_id, patient_id, kind, title, due_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a3',
   'callback', 'Call back about treatment quote', now() - interval '30 hours');

insert into recovery.enquiries (id, clinic_id, contact_name, contact_phone, source, message, interest, received_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', 'Meera Iyer', '+919800000010',
   'whatsapp', 'Hi, how much do clear aligners cost?', 'aligners', now() - interval '3 hours');

insert into recovery.recovery_items
  (clinic_id, leak_type, source_ref, patient_id, enquiry_id, appointment_id, followup_id, task_id,
   patient_name, contact_phone, reason, estimated_value, priority_score, due_at)
values
  ('00000000-0000-0000-0000-00000000c001', 'unconfirmed_appointment', 'appointment:00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-0000000000b1', null, null,
   'Ananya Rao', '+919800000001', 'Implant consult tomorrow, no reply to 2 reminders', 45000, 92, now() + interval '5 hours'),
  ('00000000-0000-0000-0000-00000000c001', 'lapsed_patient', 'followup:00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000a2', null, null, '00000000-0000-0000-0000-0000000000f1', null,
   'Vikram Shah', '+919800000002', 'Crown after root canal planned, not booked', 18000, 87, now() - interval '12 days'),
  ('00000000-0000-0000-0000-00000000c001', 'missed_enquiry', 'enquiry:00000000-0000-0000-0000-0000000000e1',
   null, '00000000-0000-0000-0000-0000000000e1', null, null, null,
   'Meera Iyer', '+919800000010', 'WhatsApp enquiry about aligners, unanswered for 3 h', 65000, 84, now() - interval '3 hours'),
  ('00000000-0000-0000-0000-00000000c001', 'overdue_followup', 'task:00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000a3', null, null, null, '00000000-0000-0000-0000-0000000000d1',
   'Rahul Menon', '+919800000003', 'Callback promised after treatment quote', 12500, 71, now() - interval '30 hours'),
  ('00000000-0000-0000-0000-00000000c001', 'lapsed_patient', 'followup:00000000-0000-0000-0000-0000000000f2',
   '00000000-0000-0000-0000-0000000000a4', null, null, '00000000-0000-0000-0000-0000000000f2', null,
   'Fatima Khan', '+919800000004', '6-month hygiene recall overdue by 3 weeks', 2500, 58, now() - interval '21 days');

-- Eight weeks of resolved history so the trend chart and recovery rate have something to show.
insert into recovery.recovery_items
  (clinic_id, leak_type, source_ref, patient_id, patient_name, estimated_value, priority_score, status, detected_at, resolved_at)
select
  '00000000-0000-0000-0000-00000000c001',
  (array['missed_enquiry', 'overdue_followup', 'unconfirmed_appointment', 'lapsed_patient'])[1 + n % 4]::recovery.leak_type,
  'history:' || n,
  ('00000000-0000-0000-0000-0000000000a' || (1 + n % 5))::uuid,
  'Past patient ' || n,
  1500 + (n * 977) % 20000,
  50,
  case when n % 5 < 2 then 'lost' else 'recovered' end::recovery.item_status,
  now() - (n || ' days')::interval - interval '2 days',
  now() - (n || ' days')::interval
from generate_series(1, 56) as n;

-- Each recovered item gets the completed appointment it produced, and the attribution row.
with recovered as (
  select id, patient_id, estimated_value, resolved_at, gen_random_uuid() as appointment_id
  from recovery.recovery_items
  where status = 'recovered'
),
booked as (
  insert into recovery.appointments (id, clinic_id, patient_id, starts_at, status, treatment, estimated_value, source, created_at)
  select appointment_id, '00000000-0000-0000-0000-00000000c001', patient_id, resolved_at + interval '3 days',
         'completed', 'Recovered visit', estimated_value, 'recovery_outreach', resolved_at
  from recovered
  returning id
)
insert into recovery.recovered_bookings (clinic_id, appointment_id, recovery_item_id, patient_id, value, booked_at)
select '00000000-0000-0000-0000-00000000c001', r.appointment_id, r.id, r.patient_id, r.estimated_value, r.resolved_at
from recovered r
join booked b on b.id = r.appointment_id;

-- Starter WhatsApp templates and reminder sequences.
select recovery.install_default_automations('00000000-0000-0000-0000-00000000c001');
