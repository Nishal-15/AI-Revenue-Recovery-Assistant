"""Rehearses the whole automation on your real database with the test patient "Test · You".

    .venv/Scripts/python -m scripts.test_data add        (once, if the test data is not there)
    .venv/Scripts/python -m scripts.rehearsal

What it does, in the order it happens in real life:
  1. finds patients who need a follow-up and prepares reminders
  2. approves and sends the reminder to YOUR test number (logged only, until Meta is connected)
  3. pretends you replied "Can I come at 6 pm instead?" and lets Gemini read it
  4. pretends you tapped Confirm on WhatsApp
  5. counts the saved appointment in Results

Only test data and your own TEST_WHATSAPP_NUMBER are touched. Clean up with: scripts.test_data remove
"""

import sys
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.ai.assist import run_ai_assist
from app.attribution import attribute_bookings
from app.config import get_settings
from app.jobs import build_llm, run_clinic_cycle
from app.main import build_sender
from app.outreach.dispatcher import dispatch_due
from app.outreach.inbound import _handle_message
from app.whatsapp.webhook import InboundMessage
from scripts.test_data import PREFIX, masked

Conn = psycopg.Connection[dict[str, Any]]


def step(number: int, title: str) -> None:
    print(f"\n{number}. {title}")


def one(conn: Conn, sql: str, **params: Any) -> dict[str, Any] | None:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    settings = get_settings()
    your_number = settings.test_whatsapp_number
    if not settings.database_url or not your_number:
        print("Needs DATABASE_URL and TEST_WHATSAPP_NUMBER in services/engine/.env")
        return 1

    with psycopg.connect(settings.database_url.get_secret_value(), row_factory=dict_row, autocommit=True,
                         prepare_threshold=None, connect_timeout=15) as conn:
        clinic = one(conn, "select id, name from recovery.clinics order by created_at limit 1")
        assert clinic is not None
        you = one(conn, """select p.id, a.id as appointment_id, a.status::text as status from recovery.patients p
                           join recovery.appointments a on a.patient_id = p.id
                           where p.clinic_id = %(c)s and p.full_name = %(n)s order by a.starts_at desc limit 1""",
                  c=clinic["id"], n=f"{PREFIX}You")
        if you is None:
            print("No test patient yet. Run: .venv/Scripts/python -m scripts.test_data add")
            return 1

        now = datetime.now(UTC)
        step(1, "Finding patients who need a follow-up")
        cycle = run_clinic_cycle(conn, clinic["id"], now)
        print(f"   {cycle.scan.created} new, {cycle.scan.updated} refreshed, "
              f"{cycle.plan.planned + cycle.plan.awaiting_approval} reminder(s) prepared")

        step(2, f"Sending the reminder to your test number {masked(your_number)}")
        with conn.cursor() as cursor:
            cursor.execute("""update recovery.outreach_messages set status = 'queued'
                              where clinic_id = %(c)s and status = 'awaiting_approval'
                                and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(y)s)""",
                           {"c": clinic["id"], "y": your_number})
        sent = dispatch_due(conn, build_sender(settings), now, clinic_id=clinic["id"])
        reminder = one(conn, """select id, status::text as status, body from recovery.outreach_messages
                                where clinic_id = %(c)s and direction = 'outbound'
                                  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(y)s)
                                order by created_at desc limit 1""", c=clinic["id"], y=your_number)
        mode = "really sent on WhatsApp" if settings.whatsapp_access_token else "dry run: checked and logged, not sent (no Meta token yet)"
        print(f"   {sent.sent} sent ({mode})")
        if reminder:
            print(f"   \"{reminder['body']}\"")

        step(3, "You reply: \"Can I come at 6 pm instead?\"  (Gemini reads it)")
        reply = InboundMessage(
            phone_number_id="rehearsal", provider_message_id=f"rehearsal.{uuid4().hex}",
            from_digits="".join(ch for ch in your_number if ch.isdigit()), profile_name="You",
            received_at=now + timedelta(minutes=5), text="Can I come at 6 pm instead?", button_payload=None,
        )
        with conn.transaction():
            _handle_message(conn, clinic["id"], reply, now + timedelta(minutes=5))
        llm = build_llm(settings)
        if llm is None:
            print("   Skipped: GEMINI_API_KEY is not set")
        else:
            ai = run_ai_assist(conn, llm, now + timedelta(minutes=6), clinic_id=clinic["id"])
            reading = one(conn, """select ai_intent, ai_confidence, ai_summary, ai_suggested_reply from recovery.outreach_messages
                                   where provider_message_id = %(p)s""", p=reply.provider_message_id)
            if ai.failed or not reading or not reading["ai_intent"]:
                print("   Gemini was busy; the engine would simply try again on the next run.")
            else:
                print(f"   Gemini says: {reading['ai_intent']} ({float(reading['ai_confidence']):.0%} sure): {reading['ai_summary']}")
                print(f"   Suggested reply for staff: \"{reading['ai_suggested_reply']}\"")

        step(4, "You tap Confirm on WhatsApp")
        if reminder and you["status"] == "scheduled":
            tap = InboundMessage(
                phone_number_id="rehearsal", provider_message_id=f"rehearsal.{uuid4().hex}",
                from_digits=reply.from_digits, profile_name="You", received_at=now + timedelta(minutes=10),
                text="Confirm", button_payload=f"confirm:{reminder['id']}",
            )
            with conn.transaction():
                _handle_message(conn, clinic["id"], tap, now + timedelta(minutes=10))
            appointment = one(conn, "select status::text as status from recovery.appointments where id = %(a)s",
                              a=you["appointment_id"])
            print(f"   Appointment is now: {appointment['status'] if appointment else '?'} (nobody at the clinic did anything)")
        else:
            print("   Already confirmed earlier. Run 'scripts.test_data remove' then 'add' to rehearse again.")

        step(5, "Counting it in Results")
        credited = attribute_bookings(conn, clinic["id"], now + timedelta(minutes=15))
        booking = one(conn, """select rule, value from recovery.recovered_bookings
                               where appointment_id = %(a)s""", a=you["appointment_id"])
        if booking:
            print(f"   Counted as a {booking['rule'].replace('_', ' ')} worth ₹{booking['value']:,.0f} "
                  f"({credited.saved_appointments + credited.new_bookings} new this run)")
        else:
            print("   Not counted (nothing was confirmed).")

    print("\nRehearsal finished. Remove the test data with: .venv/Scripts/python -m scripts.test_data remove")
    return 0


if __name__ == "__main__":
    sys.exit(main())
