"""Adds one real patient to your clinic by asking a few questions, then shows what the system does with them.

    .venv/Scripts/python -m scripts.add_patient

Everything you type stays on this computer and goes straight into your Supabase database.
Only the last 4 digits of the phone number are ever printed.
"""

import sys
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.jobs import run_clinic_cycle

Conn = psycopg.Connection[dict[str, Any]]

SITUATIONS = {
    "1": "Has an appointment that is not confirmed yet",
    "2": "Is due to come back (next treatment or check-up not booked)",
    "3": "Was promised a call back that hasn't happened",
    "4": "Sent a question that nobody has answered",
}


def ask(question: str, *, default: str | None = None, required: bool = True) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        answer = input(f"{question}{suffix}: ").strip()
        if not answer and default is not None:
            return default
        if answer or not required:
            return answer
        print("  Please type an answer.")


def ask_number(question: str, *, default: int) -> int:
    while True:
        answer = ask(question, default=str(default))
        if answer.replace(",", "").isdigit():
            return int(answer.replace(",", ""))
        print("  Please type a whole number, for example 2500.")


def ask_phone() -> str:
    while True:
        raw = ask("WhatsApp number with country code (for example +91 98765 43210)")
        digits = "".join(ch for ch in raw if ch.isdigit())
        if len(digits) == 10:  # an Indian mobile typed without the country code
            digits = "91" + digits
        if 11 <= len(digits) <= 15:
            return "+" + digits
        print("  That doesn't look like a full mobile number. Include the country code, e.g. +91.")


def ask_datetime(timezone: ZoneInfo) -> datetime:
    tomorrow = (datetime.now(timezone) + timedelta(days=1)).date()
    while True:
        day = ask("Appointment date (YYYY-MM-DD)", default=tomorrow.isoformat())
        clock = ask("Appointment time (24-hour, HH:MM)", default="11:00")
        try:
            starts = datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=timezone)
        except ValueError:
            print("  Please use the format 2026-11-20 and 14:30.")
            continue
        if starts <= datetime.now(timezone):
            print("  That time has already passed. Choose a future date and time.")
            continue
        return starts


def masked(phone: str) -> str:
    return f"…{phone[-4:]}"


def one(conn: Conn, sql: str, **params: Any) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    assert row is not None
    return row


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set in services/engine/.env")
        return 1

    with psycopg.connect(settings.database_url.get_secret_value(), row_factory=dict_row, autocommit=True,
                         prepare_threshold=None, connect_timeout=15) as conn:
        clinic = one(conn, "select id, name, timezone from recovery.clinics order by created_at limit 1")
        timezone = ZoneInfo(clinic["timezone"])
        print(f"\nAdding a patient to {clinic['name']}.\n")

        name = ask("Patient's full name")
        phone = ask_phone()
        print("\nWhat is this patient's situation?")
        for key, label in SITUATIONS.items():
            print(f"  {key}. {label}")
        situation = ask("Type 1, 2, 3 or 4", default="1")
        while situation not in SITUATIONS:
            situation = ask("Please type 1, 2, 3 or 4")

        now_local = datetime.now(timezone)
        summary: str
        with conn.transaction():
            patient = one(conn, """insert into recovery.patients (clinic_id, full_name, phone, last_visit_at)
                                   values (%(c)s, %(n)s, %(p)s, %(v)s) returning id""",
                          c=clinic["id"], n=name, p=phone, v=datetime.now(UTC) - timedelta(days=30))

            if situation == "1":
                treatment = ask("Treatment", default="Check-up and cleaning")
                starts = ask_datetime(timezone)
                value = ask_number("Treatment value in ₹", default=1500)
                one(conn, """insert into recovery.appointments
                               (clinic_id, patient_id, starts_at, ends_at, treatment, estimated_value)
                             values (%(c)s, %(p)s, %(s)s, %(e)s, %(t)s, %(v)s) returning id""",
                    c=clinic["id"], p=patient["id"], s=starts, e=starts + timedelta(hours=1), t=treatment, v=value)
                summary = f"{treatment} on {starts:%a %d %b at %H:%M}, not confirmed"
            elif situation == "2":
                procedure = ask("What is due", default="6-month check-up and cleaning")
                days_late = ask_number("How many days late is it", default=14)
                value = ask_number("Treatment value in ₹", default=1500)
                kind = "recall" if "check" in procedure.lower() or "recall" in procedure.lower() else "treatment_step"
                one(conn, """insert into recovery.planned_followups
                               (clinic_id, patient_id, kind, procedure, due_on, estimated_value)
                             values (%(c)s, %(p)s, %(k)s, %(pr)s, %(d)s, %(v)s) returning id""",
                    c=clinic["id"], p=patient["id"], k=kind, pr=procedure,
                    d=now_local.date() - timedelta(days=days_late), v=value)
                summary = f"{procedure}, {days_late} days late"
            elif situation == "3":
                about = ask("What was the call about", default="Treatment quote")
                hours_late = ask_number("How many hours late is the call", default=24)
                one(conn, """insert into recovery.staff_tasks (clinic_id, patient_id, kind, title, due_at)
                             values (%(c)s, %(p)s, 'callback', %(t)s, %(d)s) returning id""",
                    c=clinic["id"], p=patient["id"], t=f"Call back: {about}",
                    d=datetime.now(UTC) - timedelta(hours=hours_late))
                summary = f"call back about {about.lower()}, {hours_late} hours late"
            else:
                message = ask("What did they ask", default="Hi, how much does teeth cleaning cost?")
                hours_ago = ask_number("How many hours ago did they ask", default=2)
                one(conn, """insert into recovery.enquiries
                               (clinic_id, patient_id, contact_name, contact_phone, source, message, received_at)
                             values (%(c)s, %(p)s, %(n)s, %(ph)s, 'whatsapp', %(m)s, %(r)s) returning id""",
                    c=clinic["id"], p=patient["id"], n=name, ph=phone, m=message,
                    r=datetime.now(UTC) - timedelta(hours=hours_ago))
                summary = f"asked \"{message}\" {hours_ago} hours ago"

            if ask("\nSave this patient? (y/n)", default="y").lower() not in ("y", "yes"):
                raise KeyboardInterrupt

        print(f"\nSaved {name} ({masked(phone)}): {summary}.")
        cycle = run_clinic_cycle(conn, clinic["id"], datetime.now(UTC))
        print(f"The system checked the clinic: {cycle.scan.created} new patient(s) to follow up, "
              f"{cycle.plan.planned + cycle.plan.awaiting_approval} WhatsApp reminder(s) prepared.\n")

        with conn.cursor() as cursor:
            cursor.execute("""select reason, estimated_value, priority_score from recovery.recovery_items
                              where patient_id = %(p)s or enquiry_id in (select id from recovery.enquiries where patient_id = %(p)s)""",
                           {"p": patient["id"]})
            items = cursor.fetchall()
            cursor.execute("""select status::text as status, body from recovery.outreach_messages
                              where clinic_id = %(c)s and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(ph)s)
                              order by created_at desc limit 1""", {"c": clinic["id"], "ph": phone})
            message_row = cursor.fetchone()

        if items:
            for item in items:
                level = "Urgent" if item["priority_score"] >= 80 else "Soon" if item["priority_score"] >= 60 else "When you can"
                print(f"On Today:  {name} · {level} · about ₹{item['estimated_value']:,.0f}")
                print(f"           {item['reason']}")
        else:
            print("Not on Today yet: it is not late enough. (For example, an appointment more than 3 days away.)")
        if message_row:
            waiting = "waiting for your OK under Messages" if message_row["status"] == "awaiting_approval" else message_row["status"]
            print(f"\nWhatsApp reminder ({waiting}):\n  {message_row['body']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelled. Nothing was saved.")
        sys.exit(1)
