-- Phase 3: Gemini assistance. AI output is stored next to what it describes, so each message or
-- enquiry is analysed once (predictable cost) and staff can always see what the AI concluded.

alter table recovery.enquiries
  add column urgency text check (urgency in ('emergency', 'soon', 'routine')),
  add column ai_summary text,
  add column ai_classified_at timestamptz;

create index enquiries_needs_ai_idx on recovery.enquiries (received_at)
  where ai_classified_at is null and message is not null;

alter table recovery.outreach_messages
  add column ai_intent text check (ai_intent in ('confirm', 'reschedule', 'cancel', 'question', 'opt_out', 'other')),
  add column ai_confidence numeric(3, 2) check (ai_confidence between 0 and 1),
  add column ai_summary text,
  add column ai_suggested_reply text,
  add column ai_processed_at timestamptz;

create index outreach_messages_needs_ai_idx on recovery.outreach_messages (created_at)
  where direction = 'inbound' and ai_processed_at is null;
