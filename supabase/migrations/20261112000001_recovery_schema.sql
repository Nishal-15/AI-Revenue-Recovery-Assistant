-- Revenue Recovery: core schema.
-- Everything lives in the "recovery" schema so it can sit in the same Supabase project as the
-- Dental OS without colliding with its public tables.
--
-- Two groups of tables:
--   Practice data   clinics, patients, appointments, planned_followups, staff_tasks
--                   (what a practice-management system holds; the engine reads these to find leaks)
--   Recovery data   enquiries, recovery_items, outreach_messages, consents, recovered_bookings, ...
--                   (what this product creates)

create schema if not exists recovery;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type recovery.staff_role         as enum ('owner', 'manager', 'dentist', 'front_desk');
create type recovery.appointment_status as enum ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show');
create type recovery.booking_source     as enum ('front_desk', 'online', 'whatsapp', 'recovery_outreach');
create type recovery.followup_kind      as enum ('treatment_step', 'recall');
create type recovery.task_kind          as enum ('callback', 'follow_up', 'other');

create type recovery.leak_type as enum (
  'missed_enquiry', 'overdue_followup', 'unconfirmed_appointment', 'lapsed_patient'
);
create type recovery.item_status       as enum ('open', 'in_progress', 'recovered', 'lost', 'dismissed');
create type recovery.channel           as enum ('whatsapp', 'sms', 'email', 'call');
create type recovery.message_direction as enum ('outbound', 'inbound');
create type recovery.message_status    as enum (
  'queued', 'awaiting_approval', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'
);
create type recovery.enquiry_source    as enum ('whatsapp', 'phone', 'web_form', 'walk_in', 'other');
create type recovery.enquiry_status    as enum ('new', 'contacted', 'booked', 'lost');
create type recovery.consent_status    as enum ('opted_in', 'opted_out');

create or replace function recovery.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Practice data
-- ---------------------------------------------------------------------------
create table recovery.clinics (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  whatsapp_number text,                  -- E.164, the number patients message
  address         text,
  timezone        text not null default 'Asia/Kolkata',
  currency        char(3) not null default 'INR',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger clinics_touch before update on recovery.clinics
  for each row execute function recovery.touch_updated_at();

create table recovery.clinic_staff (
  clinic_id  uuid not null references recovery.clinics (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  full_name  text not null,
  role       recovery.staff_role not null default 'front_desk',
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index clinic_staff_user_idx on recovery.clinic_staff (user_id);

create table recovery.patients (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references recovery.clinics (id) on delete cascade,
  full_name     text not null,
  phone         text,                    -- E.164; families can share one, so not unique
  email         text,
  date_of_birth date,
  last_visit_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index patients_clinic_name_idx on recovery.patients (clinic_id, full_name);
create index patients_clinic_phone_idx on recovery.patients (clinic_id, phone);
create trigger patients_touch before update on recovery.patients
  for each row execute function recovery.touch_updated_at();

create table recovery.appointments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references recovery.clinics (id) on delete cascade,
  patient_id      uuid not null references recovery.patients (id) on delete cascade,
  dentist_id      uuid references auth.users (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  status          recovery.appointment_status not null default 'scheduled',
  treatment       text,
  estimated_value numeric(12, 2) not null default 0 check (estimated_value >= 0),
  source          recovery.booking_source not null default 'front_desk',
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index appointments_clinic_start_idx on recovery.appointments (clinic_id, starts_at);
create index appointments_patient_idx on recovery.appointments (patient_id, starts_at desc);
create trigger appointments_touch before update on recovery.appointments
  for each row execute function recovery.touch_updated_at();

-- Next steps a patient is expected to book: the crown after a root canal, a 6-month recall, ...
create table recovery.planned_followups (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references recovery.clinics (id) on delete cascade,
  patient_id            uuid not null references recovery.patients (id) on delete cascade,
  kind                  recovery.followup_kind not null,
  procedure             text not null,
  due_on                date not null,
  estimated_value       numeric(12, 2) not null default 0 check (estimated_value >= 0),
  booked_appointment_id uuid references recovery.appointments (id) on delete set null,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index planned_followups_due_idx on recovery.planned_followups (clinic_id, due_on)
  where completed_at is null and booked_appointment_id is null;
create trigger planned_followups_touch before update on recovery.planned_followups
  for each row execute function recovery.touch_updated_at();

-- Callbacks and to-dos staff promised a patient or enquirer.
create table recovery.staff_tasks (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references recovery.clinics (id) on delete cascade,
  patient_id  uuid references recovery.patients (id) on delete cascade,
  enquiry_id  uuid,                      -- FK added after enquiries exists
  kind        recovery.task_kind not null default 'callback',
  title       text not null,
  due_at      timestamptz not null,
  assigned_to uuid references auth.users (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index staff_tasks_open_idx on recovery.staff_tasks (clinic_id, due_at) where done_at is null;
create trigger staff_tasks_touch before update on recovery.staff_tasks
  for each row execute function recovery.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Recovery data
-- ---------------------------------------------------------------------------
create table recovery.clinic_settings (
  clinic_id                    uuid primary key references recovery.clinics (id) on delete cascade,
  quiet_hours_start            time not null default '21:00',
  quiet_hours_end              time not null default '09:00',
  max_messages_per_week        smallint not null default 3 check (max_messages_per_week between 0 and 14),
  attribution_window_days      smallint not null default 14 check (attribution_window_days between 1 and 90),
  enquiry_response_sla_minutes integer not null default 60 check (enquiry_response_sla_minutes > 0),
  unconfirmed_lookahead_hours  integer not null default 72 check (unconfirmed_lookahead_hours > 0),
  lapsed_grace_days            smallint not null default 7 check (lapsed_grace_days >= 0),
  require_staff_approval       boolean not null default true,
  whatsapp_phone_number_id     text,     -- Meta WhatsApp Cloud API sender id
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create trigger clinic_settings_touch before update on recovery.clinic_settings
  for each row execute function recovery.touch_updated_at();

-- Enquiries from people who may not be patients yet (WhatsApp, missed calls, web forms).
create table recovery.enquiries (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references recovery.clinics (id) on delete cascade,
  patient_id        uuid references recovery.patients (id) on delete set null,
  contact_name      text,
  contact_phone     text not null,
  source            recovery.enquiry_source not null,
  message           text,
  interest          text,                -- AI-classified, e.g. 'aligners', 'implant', 'pain'
  status            recovery.enquiry_status not null default 'new',
  received_at       timestamptz not null default now(),
  first_response_at timestamptz,
  booked_appointment_id uuid references recovery.appointments (id) on delete set null,
  assigned_to       uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index enquiries_clinic_status_idx on recovery.enquiries (clinic_id, status, received_at desc);
create trigger enquiries_touch before update on recovery.enquiries
  for each row execute function recovery.touch_updated_at();

alter table recovery.staff_tasks
  add constraint staff_tasks_enquiry_fk foreign key (enquiry_id) references recovery.enquiries (id) on delete cascade;

-- One row per detected revenue leak. The engine upserts on (clinic_id, leak_type, source_ref),
-- so re-running detection never creates duplicates.
create table recovery.recovery_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references recovery.clinics (id) on delete cascade,
  leak_type       recovery.leak_type not null,
  source_ref      text not null,         -- 'appointment:<id>', 'enquiry:<id>', 'followup:<id>', 'task:<id>'
  patient_id      uuid references recovery.patients (id) on delete cascade,
  enquiry_id      uuid references recovery.enquiries (id) on delete cascade,
  appointment_id  uuid references recovery.appointments (id) on delete cascade,
  followup_id     uuid references recovery.planned_followups (id) on delete cascade,
  task_id         uuid references recovery.staff_tasks (id) on delete cascade,
  patient_name    text,                  -- denormalised for the worklist
  contact_phone   text,
  reason          text,
  estimated_value numeric(12, 2) not null default 0 check (estimated_value >= 0),
  priority_score  numeric(5, 2) not null default 0 check (priority_score between 0 and 100),
  status          recovery.item_status not null default 'open',
  detected_at     timestamptz not null default now(),
  due_at          timestamptz,
  assigned_to     uuid references auth.users (id) on delete set null,
  snoozed_until   timestamptz,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (clinic_id, leak_type, source_ref)
);
create index recovery_items_worklist_idx on recovery.recovery_items (clinic_id, status, priority_score desc);
create trigger recovery_items_touch before update on recovery.recovery_items
  for each row execute function recovery.touch_updated_at();

-- WhatsApp only allows business-initiated messages through Meta-approved templates.
create table recovery.message_templates (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references recovery.clinics (id) on delete cascade,
  leak_type              recovery.leak_type,
  name                   text not null,
  channel                recovery.channel not null default 'whatsapp',
  whatsapp_template_name text,
  language               text not null default 'en',
  body                   text not null,
  variables              text[] not null default '{}',
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (clinic_id, name)
);
create trigger message_templates_touch before update on recovery.message_templates
  for each row execute function recovery.touch_updated_at();

-- steps: [{ "offset_minutes": -2880, "channel": "whatsapp", "template_id": "<uuid>" }, ...]
create table recovery.automation_rules (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references recovery.clinics (id) on delete cascade,
  leak_type  recovery.leak_type not null,
  name       text not null,
  is_active  boolean not null default true,
  steps      jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automation_rules_touch before update on recovery.automation_rules
  for each row execute function recovery.touch_updated_at();

create table recovery.outreach_messages (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references recovery.clinics (id) on delete cascade,
  recovery_item_id    uuid references recovery.recovery_items (id) on delete set null,
  enquiry_id          uuid references recovery.enquiries (id) on delete set null,
  patient_id          uuid references recovery.patients (id) on delete set null,
  direction           recovery.message_direction not null,
  channel             recovery.channel not null default 'whatsapp',
  template_id         uuid references recovery.message_templates (id) on delete set null,
  contact_phone       text not null,
  body                text,
  status              recovery.message_status not null default 'queued',
  ai_generated        boolean not null default false,
  approved_by         uuid references auth.users (id) on delete set null,
  provider_message_id text unique,
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);
create index outreach_messages_item_idx on recovery.outreach_messages (recovery_item_id, created_at desc);
create index outreach_messages_phone_idx on recovery.outreach_messages (clinic_id, contact_phone, created_at desc);
create index outreach_messages_due_idx on recovery.outreach_messages (scheduled_for) where status = 'queued';

-- Keyed by phone: WhatsApp consent belongs to the number, which may exist before a patient record does.
create table recovery.consents (
  clinic_id     uuid not null references recovery.clinics (id) on delete cascade,
  contact_phone text not null,
  channel       recovery.channel not null,
  status        recovery.consent_status not null,
  source        text not null,           -- 'registration_form', 'whatsapp_reply_stop', ...
  recorded_at   timestamptz not null default now(),
  primary key (clinic_id, contact_phone, channel)
);

-- A booking credited to outreach. One appointment can be credited only once.
create table recovery.recovered_bookings (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references recovery.clinics (id) on delete cascade,
  appointment_id        uuid not null unique references recovery.appointments (id) on delete cascade,
  recovery_item_id      uuid references recovery.recovery_items (id) on delete set null,
  attributed_message_id uuid references recovery.outreach_messages (id) on delete set null,
  patient_id            uuid references recovery.patients (id) on delete set null,
  value                 numeric(12, 2) not null default 0 check (value >= 0),
  booked_at             timestamptz not null,
  created_at            timestamptz not null default now()
);
create index recovered_bookings_clinic_idx on recovery.recovered_bookings (clinic_id, booked_at desc);

create table recovery.audit_log (
  id         bigint generated always as identity primary key,
  clinic_id  uuid not null references recovery.clinics (id) on delete cascade,
  actor_id   uuid,                       -- null = engine
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_clinic_idx on recovery.audit_log (clinic_id, created_at desc);
