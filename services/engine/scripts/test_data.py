"""Adds or removes clearly marked test data in your real Supabase database, then runs the engine on it.

    .venv/Scripts/python -m scripts.test_data add       add test patients and run one cycle
    .venv/Scripts/python -m scripts.test_data status    show what the engine found and planned
    .venv/Scripts/python -m scripts.test_data send      approve and send ONLY the message to your number
    .venv/Scripts/python -m scripts.test_data link      open that message in your own WhatsApp, ready to send
    .venv/Scripts/python -m scripts.test_data remove    delete every test row

Only the "Test · You" patient gets a phone number: TEST_WHATSAPP_NUMBER from .env (your own number).
The other test patients have no number, so nothing can ever be sent to a stranger. The test enquiry uses an
impossible number (+91 00000 00000) that is also marked opted out.
Never prints your phone number.
"""

import sys
import webbrowser
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.jobs import run_clinic_cycle
from app.main import build_sender
from app.outreach.dispatcher import dispatch_due

MARK = "test-data"
PREFIX = "Test · "
IMPOSSIBLE_NUMBER = "+910000000000"

Conn = psycopg.Connection[dict[str, Any]]


def connect() -> Conn:
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is not set in services/engine/.env")
    return psycopg.connect(
        settings.database_url.get_secret_value(), row_factory=dict_row, autocommit=True,
        prepare_threshold=None, connect_timeout=15,
    )


def first_clinic(conn: Conn) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute("select id, name from recovery.clinics order by created_at limit 1")
        clinic = cursor.fetchone()
    if clinic is None:
        raise SystemExit("No clinic yet: create one in the Supabase SQL Editor first.")
    return clinic


def masked(phone: str | None) -> str:
    digits = "".join(ch for ch in phone or "" if ch.isdigit())
    return f"…{digits[-4:]}" if digits else "no number"


def one(conn: Conn, sql: str, **params: Any) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    assert row is not None
    return row


def add(conn: Conn) -> None:
    clinic = first_clinic(conn)
    clinic_id: UUID = clinic["id"]
    with conn.cursor() as cursor:
        cursor.execute("select count(*) as n from recovery.patients where clinic_id = %(c)s and notes = %(m)s",
                       {"c": clinic_id, "m": MARK})
        existing = cursor.fetchone()
    if existing and existing["n"]:
        raise SystemExit("Test data is already there. Run 'remove' first to start fresh.")

    your_number = get_settings().test_whatsapp_number
    now = datetime.now(UTC)
    today = date.today()

    with conn.transaction():
        you = one(conn, """insert into recovery.patients (clinic_id, full_name, phone, notes, last_visit_at)
                           values (%(c)s, %(n)s, %(p)s, %(m)s, %(v)s) returning id""",
                  c=clinic_id, n=f"{PREFIX}You", p=your_number, m=MARK, v=now - timedelta(days=60))
        # 30 hours away: the "2 days before" confirmation reminder is due straight away.
        one(conn, """insert into recovery.appointments (clinic_id, patient_id, starts_at, ends_at, treatment, estimated_value)
                     values (%(c)s, %(p)s, %(s)s, %(e)s, 'Check-up and cleaning', 1500) returning id""",
            c=clinic_id, p=you["id"], s=now + timedelta(hours=30), e=now + timedelta(hours=31))

        ananya = one(conn, """insert into recovery.patients (clinic_id, full_name, notes, last_visit_at)
                              values (%(c)s, %(n)s, %(m)s, %(v)s) returning id""",
                     c=clinic_id, n=f"{PREFIX}Ananya Rao", m=MARK, v=now - timedelta(days=45))
        one(conn, """insert into recovery.planned_followups (clinic_id, patient_id, kind, procedure, due_on, estimated_value)
                     values (%(c)s, %(p)s, 'treatment_step', 'Crown after root canal', %(d)s, 18000) returning id""",
            c=clinic_id, p=ananya["id"], d=today - timedelta(days=12))

        rahul = one(conn, """insert into recovery.patients (clinic_id, full_name, notes, last_visit_at)
                             values (%(c)s, %(n)s, %(m)s, %(v)s) returning id""",
                    c=clinic_id, n=f"{PREFIX}Rahul Menon", m=MARK, v=now - timedelta(days=10))
        one(conn, """insert into recovery.staff_tasks (clinic_id, patient_id, kind, title, due_at)
                     values (%(c)s, %(p)s, 'callback', %(t)s, %(d)s) returning id""",
            c=clinic_id, p=rahul["id"], t=f"{PREFIX}Call back about treatment quote", d=now - timedelta(hours=30))

        one(conn, """insert into recovery.enquiries (clinic_id, contact_name, contact_phone, source, message, received_at)
                     values (%(c)s, %(n)s, %(p)s, 'web_form', 'Hi, how much do clear aligners cost?', %(r)s) returning id""",
            c=clinic_id, n=f"{PREFIX}Meera Iyer", p=IMPOSSIBLE_NUMBER, r=now - timedelta(hours=3))
        with conn.cursor() as cursor:
            cursor.execute("""insert into recovery.consents (clinic_id, contact_phone, channel, status, source)
                              values (%(c)s, %(p)s, 'whatsapp', 'opted_out', %(m)s)
                              on conflict (clinic_id, contact_phone, channel) do nothing""",
                           {"c": clinic_id, "p": IMPOSSIBLE_NUMBER, "m": MARK})

    print(f"Added test data to '{clinic['name']}':")
    print(f"  {PREFIX}You            appointment in 30 h, not confirmed  -> WhatsApp to {masked(your_number)}")
    print(f"  {PREFIX}Ananya Rao     crown overdue 12 days                -> no phone, worklist only")
    print(f"  {PREFIX}Rahul Menon    callback overdue 30 h                -> worklist only")
    print(f"  {PREFIX}Meera Iyer     web enquiry, no reply for 3 h        -> impossible number, opted out")
    if not your_number:
        print("  (TEST_WHATSAPP_NUMBER is not set in .env, so 'Test · You' has no number and nothing will be sent)")
    cycle = run_clinic_cycle(conn, clinic_id, now)
    print(f"\nEngine cycle: {cycle.scan.created} leaks found, "
          f"{cycle.plan.planned + cycle.plan.awaiting_approval} reminders planned "
          f"({cycle.plan.awaiting_approval} waiting for approval)")
    status(conn)


def status(conn: Conn) -> None:
    clinic = first_clinic(conn)
    with conn.cursor() as cursor:
        cursor.execute("""select leak_type::text as leak, patient_name, reason, estimated_value, priority_score,
                                 status::text as status
                          from recovery.recovery_items where clinic_id = %(c)s and patient_name like %(p)s
                          order by priority_score desc""", {"c": clinic["id"], "p": f"{PREFIX}%"})
        items = cursor.fetchall()
        cursor.execute("""select m.status::text as status, m.contact_phone, m.body, m.error, t.whatsapp_template_name
                          from recovery.outreach_messages m
                          left join recovery.message_templates t on t.id = m.template_id
                          join recovery.recovery_items i on i.id = m.recovery_item_id
                          where m.clinic_id = %(c)s and i.patient_name like %(p)s
                          order by m.created_at""", {"c": clinic["id"], "p": f"{PREFIX}%"})
        messages = cursor.fetchall()

    print("\nWorklist (test patients):")
    for item in items:
        print(f"  [{item['priority_score']:>5}] {item['leak']:<24} {item['patient_name']:<20} "
              f"₹{item['estimated_value']:>8,.0f}  {item['status']:<12} {item['reason']}")
    print("\nWhatsApp messages:")
    if not messages:
        print("  none")
    for message in messages:
        print(f"  {message['status']:<18} to {masked(message['contact_phone'])}  template "
              f"{message['whatsapp_template_name']}: {message['body']}")
        if message["error"]:
            print(f"  {'':<18} note: {message['error']}")


def send(conn: Conn) -> None:
    settings = get_settings()
    your_number = settings.test_whatsapp_number
    if not your_number:
        raise SystemExit("Set TEST_WHATSAPP_NUMBER in .env first (your own WhatsApp number).")
    clinic = first_clinic(conn)
    params = {"c": clinic["id"], "your": your_number, "p": f"{PREFIX}%"}

    if settings.whatsapp_phone_number_id:
        with conn.cursor() as cursor:
            cursor.execute("""insert into recovery.clinic_settings (clinic_id, whatsapp_phone_number_id)
                              values (%(c)s, %(id)s)
                              on conflict (clinic_id) do update
                              set whatsapp_phone_number_id = coalesce(recovery.clinic_settings.whatsapp_phone_number_id,
                                                                      excluded.whatsapp_phone_number_id)""",
                           {"c": clinic["id"], "id": settings.whatsapp_phone_number_id})

    with conn.cursor() as cursor:
        # Approve only test messages going to your own number; anything else stays untouched.
        cursor.execute("""update recovery.outreach_messages m set status = 'queued', scheduled_for = now()
                          where m.clinic_id = %(c)s and m.status = 'awaiting_approval'
                            and recovery.phone_digits(m.contact_phone) = recovery.phone_digits(%(your)s)
                            and m.recovery_item_id in (select id from recovery.recovery_items
                                                       where clinic_id = %(c)s and patient_name like %(p)s)""",
                       params)
        approved = cursor.rowcount

    live = bool(settings.whatsapp_access_token)
    print(f"Approved {approved} message(s) to {masked(your_number)}. Mode: {'LIVE WhatsApp' if live else 'dry-run (no Meta token in .env)'}")
    result = dispatch_due(conn, build_sender(settings), datetime.now(UTC), clinic_id=clinic["id"])
    print(f"Dispatch: {result.sent} sent, {result.deferred} waiting for quiet hours to end, "
          f"{result.cancelled} cancelled, {result.failed} failed")
    status(conn)
    if live and result.sent:
        print()
        print("Check WhatsApp on your phone.")


def link(conn: Conn) -> None:
    """Opens WhatsApp's official click-to-chat link with the prepared reminder text. You press Send yourself."""
    your_number = get_settings().test_whatsapp_number
    if not your_number:
        raise SystemExit("Set TEST_WHATSAPP_NUMBER in .env first (your own WhatsApp number).")
    clinic = first_clinic(conn)
    with conn.cursor() as cursor:
        cursor.execute("""select m.body from recovery.outreach_messages m
                          join recovery.recovery_items i on i.id = m.recovery_item_id
                          where m.clinic_id = %(c)s and m.direction = 'outbound' and m.body is not null
                            and i.patient_name like %(p)s
                            and recovery.phone_digits(m.contact_phone) = recovery.phone_digits(%(your)s)
                          order by m.created_at desc limit 1""",
                       {"c": clinic["id"], "p": f"{PREFIX}%", "your": your_number})
        row = cursor.fetchone()
    if row is None:
        raise SystemExit("No test message for your number yet: run 'add' first.")
    digits = "".join(ch for ch in your_number if ch.isdigit())
    url = f"https://wa.me/{digits}?text={quote(row['body'])}"
    webbrowser.open(url)  # the number is in the link, so it is opened, never printed
    print(f"Opened WhatsApp with the reminder for {masked(your_number)}:")
    print(f"  {row['body']}")
    print("Press Send in WhatsApp. Buttons (Confirm / Reschedule) only appear when sent through the Meta API.")


def remove(conn: Conn) -> None:
    clinic = first_clinic(conn)
    params = {"c": clinic["id"], "m": MARK, "p": f"{PREFIX}%", "your": get_settings().test_whatsapp_number or ""}
    with conn.transaction(), conn.cursor() as cursor:
        cursor.execute("""delete from recovery.outreach_messages m where m.clinic_id = %(c)s and (
                            m.recovery_item_id in (select id from recovery.recovery_items
                                                   where clinic_id = %(c)s and patient_name like %(p)s)
                            or (%(your)s <> '' and recovery.phone_digits(m.contact_phone) = recovery.phone_digits(%(your)s)))""",
                       params)
        messages = cursor.rowcount
        cursor.execute("delete from recovery.enquiries where clinic_id = %(c)s and contact_name like %(p)s", params)
        enquiries = cursor.rowcount
        # Deleting the patients removes their appointments, follow-ups, tasks, worklist items and credited bookings.
        cursor.execute("delete from recovery.patients where clinic_id = %(c)s and notes = %(m)s", params)
        patients = cursor.rowcount
        cursor.execute("delete from recovery.consents where clinic_id = %(c)s and source = %(m)s", params)
    print(f"Removed test data: {patients} patients, {enquiries} enquiries, {messages} messages.")


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    if command not in ("add", "status", "send", "link", "remove"):
        print(__doc__)
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    with connect() as conn:
        {"add": add, "status": status, "send": send, "link": link, "remove": remove}[command](conn)
    return 0


if __name__ == "__main__":
    sys.exit(main())
