# AI Revenue Recovery Assistant for Clinics

Finds the bookings a dental clinic is losing (missed enquiries, overdue follow-ups, unconfirmed
appointments, patients who never came back for planned treatment), wins them back over WhatsApp,
and tracks the revenue recovered.

Built as a **section that plugs into the Dental OS**, sharing its Supabase project and login.

| Layer | Stack |
|---|---|
| UI | React 19, TypeScript, Vite, Tailwind CSS v4, Three.js (react-three-fiber), Recharts, TanStack Query |
| Data | Supabase: Postgres, Auth, Row Level Security, RPC |
| Engine | Python, FastAPI, psycopg |
| AI | Google Gemini (`gemini-3.5-flash-lite`) through the `google-genai` SDK |
| Hosting | Cloudflare Workers + Containers (engine), Cloudflare Pages (demo), Supabase (database) |
| Messaging | WhatsApp Cloud API (Meta) |

```
packages/revenue-recovery   <RevenueRecovery /> React component, Three.js visual, styles
apps/playground             Stand-in Dental OS layout for local development (demo data by default)
supabase/migrations         "recovery" schema, RLS policies, dashboard function
supabase/seed.sql           Demo clinic with patients, appointments, follow-ups and history
services/engine             Python FastAPI: detection, WhatsApp, Gemini, attribution
```

## Run locally

```bash
npm install
npm run dev                      # playground on http://localhost:5173 with demo data

cd services/engine
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
cp .env.example .env                                  # add GEMINI_API_KEY and ENGINE_API_TOKEN
.venv/Scripts/python -m pytest
.venv/Scripts/uvicorn app.main:app --reload
```

Try Gemini once the engine is running:

```bash
curl -X POST http://localhost:8000/ai/classify-enquiry \
  -H "Authorization: Bearer <ENGINE_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{"message": "Hi, my tooth is swollen and hurting a lot, can I come today?"}'
```

Run the engine's database tests against a real Postgres (PGlite, no Docker needed):

```bash
npm run db:test                  # terminal 1: Postgres on 127.0.0.1:54329 with all migrations applied
cd services/engine               # terminal 2
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres .venv/Scripts/python -m pytest
```

To show real data in the playground, copy `apps/playground/.env.example` to `.env` and fill in the Supabase URL and anon key.

## Database

Everything lives in the `recovery` schema so it can share a Supabase project with the Dental OS
without name clashes. In Supabase: **Settings → API → Exposed schemas**, add `recovery`.

**Practice data:** what the engine scans for leaks.

| Table | Purpose |
|---|---|
| `clinics` | Clinic profile, timezone, currency, WhatsApp number |
| `clinic_staff` | Which login belongs to which clinic, and their role (owner, manager, dentist, front_desk) |
| `patients` | Patient records |
| `appointments` | Bookings with status (scheduled, confirmed, cancelled, completed, no_show) and value |
| `planned_followups` | Next steps a patient should book: treatment steps and recalls |
| `staff_tasks` | Callbacks and follow-ups staff promised |

**Recovery data:** what this product creates.

| Table | Purpose |
|---|---|
| `clinic_settings` | Quiet hours, message limits, attribution window, detection thresholds |
| `enquiries` | WhatsApp, phone and web enquiries, with the Gemini-classified interest |
| `recovery_items` | One row per detected leak: type, value, priority, status |
| `message_templates`, `automation_rules` | WhatsApp templates and reminder sequences |
| `outreach_messages` | Every message in and out, with delivery status |
| `consents` | WhatsApp opt-in and opt-out per phone number |
| `recovered_bookings` | Appointments credited to outreach (each one at most once) |
| `audit_log` | Who did what |

Staff only ever see rows for clinics they belong to. Attribution and the audit log are written only by the engine.

When the Dental OS is ready, either it adopts these tables directly, or its tables sync into them.
Nothing else in the module has to change.

## How detection works

`POST /jobs/scan` (or the built-in scheduler, `ENABLE_SCHEDULER=true`, every 15 minutes) checks each clinic:

| Leak | Flagged when | Clears itself when |
|---|---|---|
| Missed enquiry | No reply within the clinic's response time (default 60 min), or replied but not booked after 3 days | Enquiry is booked (recovered) or marked lost |
| Overdue follow-up | A staff callback or task is past its due time | Task is done or rescheduled |
| Unconfirmed appointment | Still "scheduled" within the next 72 hours | Confirmed or attended (recovered), cancelled or no-show (lost), time passes |
| Not returned | A planned treatment step or recall is overdue by more than 7 days and not booked | Booked or completed (recovered) |

Each item gets a 0–100 priority from its value (log-scaled) and urgency, plus a boost for pain or emergency
enquiries. Rescanning never duplicates items, never reopens resolved ones, and keeps staff's
"in progress" and snooze state. Every status change is written to `audit_log`.

## WhatsApp

Without Meta credentials the engine runs in **dry-run mode**: every message goes through planning,
approval, quiet hours, consent and weekly-limit checks, and is logged instead of sent
(`GET /health` shows `"whatsapp": "dry-run"`).

**How a reminder flows**

1. The scan finds a leak, e.g. an appointment in 30 hours that is not confirmed.
2. The planner picks the sequence step that is due (e.g. "2 days before the appointment") and queues the template.
   With *Staff approval* on (the default), it waits in the WhatsApp inbox until someone approves it.
3. The dispatcher sends it, unless the patient opted out, it is quiet hours (it waits until morning), the
   weekly limit is reached, or it is free text outside WhatsApp's 24-hour reply window.
4. The patient taps a button: **Confirm** confirms the appointment and recovers the item; **Reschedule**,
   **Call me** or **Book** create a callback for the front desk. **STOP** opts them out and cancels anything pending.
   A message from an unknown number becomes a new enquiry.

**Going live**

1. In Meta Business Manager create a WhatsApp Business app and note the **phone number ID**, a **permanent
   access token** and the **app secret**.
2. In WhatsApp Manager create these templates (category *Utility*, language *English*). Names must match exactly:

   | Template name | Body | Quick-reply buttons |
   |---|---|---|
   | `appointment_confirmation` | Hi {{1}}, this is {{2}}. Your {{3}} is booked for {{4}}. Please tap Confirm, or Reschedule if the time no longer works for you. | Confirm, Reschedule |
   | `appointment_final_reminder` | Hi {{1}}, a quick reminder of your {{2}} at {{3}}. Tap Confirm so we can keep your slot ready. | Confirm, Reschedule |
   | `enquiry_followup` | Hi {{1}}, thank you for contacting {{2}}. We would be glad to help. Would you like us to book a consultation for you? | Book, Call me |
   | `followup_due` | Hi {{1}}, our records show your {{2}} is now due at {{3}}. Shall we find a time that suits you? | Book, Call me |

3. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and a `WHATSAPP_VERIFY_TOKEN` of your choice in the engine's `.env`.
4. Register the webhook `https://<engine-host>/webhooks/whatsapp` with that verify token and subscribe to **messages**.
5. In the module's **Settings**, enter the clinic's phone number ID.
6. Collect WhatsApp opt-in from patients (for example on the registration form). Business-initiated messages
   need it under WhatsApp policy and data-protection law.

New clinics get these templates and sequences with `select recovery.install_default_automations('<clinic id>');`.

| Endpoint | Purpose |
|---|---|
| `POST /jobs/scan` | Detect leaks and plan reminders (all clinics, or `?clinic_id=`) |
| `POST /jobs/dispatch` | Send due messages |
| `GET/POST /webhooks/whatsapp` | Meta webhook: verification, replies, button taps, delivery receipts |
| `POST /ai/classify-enquiry` | Gemini enquiry classification |

With `ENABLE_SCHEDULER=true` the engine dispatches every minute and scans every `SCAN_INTERVAL_MINUTES`.

## AI assistance (Gemini)

With `GEMINI_API_KEY` set, every few minutes the engine:

- **Classifies new enquiries**: treatment interest (aligners, implant, pain/emergency, …), urgency and a one-line
  summary. Interest sets the estimated value; an emergency gets the top priority on the worklist.
- **Reads patients' free-text replies**: confirm, reschedule, cancel, question, opt out or other, with a confidence
  score, a short summary ("Wants to reschedule (Thursday evening)") and a **drafted reply** that staff can use, edit or ignore.

What the AI may change on its own is deliberately narrow:

| AI reading | Confidence needed | Automatic action |
|---|---|---|
| Confirm (reply to an appointment reminder) | 85% | Appointment confirmed, item recovered |
| Opt out ("please stop messaging me") | 90% | Opt-out recorded, pending messages cancelled |
| Reschedule / cancel | 70% | Item marked in progress |
| Anything else | – | Label and draft only |

Drafted replies are never sent automatically. The prompts forbid medical advice and invented prices, treat patient
text as untrusted input, and reply in the patient's language. Each enquiry and message is analysed once, only recent
ones (7 days / 2 days), at most `AI_BATCH_SIZE` per run, so cost is predictable. Without a key, everything else works.

Check your key and model:

```bash
cd services/engine && .venv/Scripts/python -m scripts.check_gemini
```

## Deploy on Cloudflare

```
Dental OS app ─┐                         ┌─> Supabase Postgres (data, auth, RLS)
               ├─ supabase-js ───────────┤
Demo (Pages) ──┘                         │
Meta webhook ──> Worker ──> Container (Python engine) ──┬─> Supabase (pooler)
Cron */5 min ──> Worker ─┘                              ├─> WhatsApp Cloud API
                                                        └─> Gemini API
```

The Python engine runs unchanged in a **Cloudflare Container**; a small Worker (`deploy/cloudflare/engine`)
forwards webhooks to it and replaces the in-process scheduler with a **Cron Trigger**: every 5 minutes it runs
`/jobs/ai` and `/jobs/dispatch`, and every 15 minutes `/jobs/scan`. The container sleeps 2 minutes after its
last request, so you pay mostly for the minutes it works.

**You need:** a Cloudflare account on **Workers Paid** (containers are not on the free plan), **Docker Desktop
running** (wrangler builds the image), and a Supabase project.

1. **Database (Supabase).** Run the files in `supabase/migrations/` in order (SQL editor, or `npx supabase db push`).
   Add `recovery` under Settings → API → Exposed schemas. Create the clinic and give staff access:

   ```sql
   insert into recovery.clinics (name, whatsapp_number) values ('Your Clinic', '+91…') returning id;
   select recovery.install_default_automations('<clinic id>');
   insert into recovery.clinic_staff (clinic_id, user_id, full_name, role) values ('<clinic id>', '<auth user id>', 'Name', 'owner');
   ```

2. **Engine secrets.** Use the Supabase **connection pooler** URL (Settings → Database → Connection string → Transaction
   pooler, port 6543); the direct connection is IPv6-only.

   ```bash
   cd deploy/cloudflare/engine && npm install
   npx wrangler login
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put ENGINE_API_TOKEN        # any long random string
   npx wrangler secret put GEMINI_API_KEY
   # when WhatsApp is ready:
   npx wrangler secret put WHATSAPP_ACCESS_TOKEN
   npx wrangler secret put WHATSAPP_APP_SECRET
   npx wrangler secret put WHATSAPP_VERIFY_TOKEN
   ```

3. **Deploy the engine:** `npm run deploy:engine` (from the repo root). Open
   `https://revenue-recovery-engine.<your-subdomain>.workers.dev/health`; it should show `"ai": "on"`.
   The first deploy takes a few minutes before the container answers.
4. **WhatsApp webhook:** in Meta, set the callback URL to `…workers.dev/webhooks/whatsapp` with your verify token.
5. **Demo site:** `npm run deploy:demo` publishes the playground to `https://revenue-recovery-demo.pages.dev`
   (demo data, no login). The real screens live inside the Dental OS, which can also be hosted on Pages.

Logs: `npm run tail --prefix deploy/cloudflare/engine`.

## Mounting inside the Dental OS

```tsx
import { RevenueRecovery } from "@dental-os/revenue-recovery";
import "@dental-os/revenue-recovery/style.css";

<RevenueRecovery supabase={supabase} clinicId={currentClinic.id} />
```

- Requires React 19. Pass the Dental OS's existing Supabase client so the login and RLS carry over.
- Styles are isolated: no global CSS reset, classes scoped under `.rr-root`, brand tokens prefixed `rr-`.
- Load the fonts (Inter, Plus Jakarta Sans) in the host; system fonts are the fallback.
- Optional `section` / `onSectionChange` props let the host router own the active tab.

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo, schema and RLS, design system, dashboard, engine skeleton, Gemini client | done |
| 1 | Detection scan for the 4 leak types, worklist, confirmations, recalls | done |
| 2 | WhatsApp Cloud API: templates, sending, inbound webhook, consent, quiet hours, automations | done |
| 3 | Gemini: enquiry classification, reply intent, drafted replies, AI-informed priority | done |
| – | Cloudflare deployment: Worker + Container engine, Pages demo | ready (needs your account) |
| 4 | Booking attribution, reports, polish | next |
| 5 | Connect to the Dental OS, pilot with one clinic | |
