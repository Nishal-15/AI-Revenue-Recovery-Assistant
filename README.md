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
| 2 | WhatsApp Cloud API: templates, sending, inbound webhook, consent, quiet hours, automations | next |
| 3 | Gemini: message drafting, reply intent (confirm / reschedule / stop), priority scoring | |
| 4 | Booking attribution, reports, polish | |
| 5 | Connect to the Dental OS, pilot with one clinic | |
