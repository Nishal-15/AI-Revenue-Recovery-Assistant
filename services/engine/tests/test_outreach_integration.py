"""WhatsApp outreach end to end against a real Postgres: detect -> plan -> approve -> send -> patient replies.

Needs TEST_DATABASE_URL (see test_detection_integration.py). Each test builds its own clinic.
"""

import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
import pytest
from psycopg.rows import dict_row

from app.detection.scan import scan_clinic
from app.outreach.dispatcher import dispatch_due
from app.outreach.inbound import handle_events
from app.outreach.planner import plan_clinic
from app.whatsapp.sender import OutgoingMessage
from app.whatsapp.webhook import InboundMessage, StatusUpdate

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL not set")

NOW = datetime(2037, 11, 12, 6, 0, tzinfo=UTC)  # 11:30 in Asia/Kolkata, outside quiet hours. A future date: rows the database stamps with the real
# clock must always look older than "now" in these tests (13 Nov 2037 is a Friday, like 13 Nov 2026).
IST = ZoneInfo("Asia/Kolkata")

Conn = psycopg.Connection[dict[str, Any]]


@pytest.fixture(scope="module")
def conn():
    assert DATABASE_URL
    with psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True, prepare_threshold=None) as connection:
        yield connection


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[OutgoingMessage] = []

    def send(self, message: OutgoingMessage) -> str:
        self.sent.append(message)
        return f"wamid.{uuid4().hex}"


def dispatch_for(clinic: "Clinic", sender: FakeSender, at: datetime):
    return dispatch_due(clinic.conn, sender, at, clinic_id=clinic.id)


def one(conn: Conn, sql: str, **params: Any) -> dict[str, Any]:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    assert row is not None, sql
    return row


def rows(conn: Conn, sql: str, **params: Any) -> list[dict[str, Any]]:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def run(conn: Conn, sql: str, **params: Any) -> None:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)


class Clinic:
    """A clinic with default automations and one patient whose implant consult is in 30 hours, unconfirmed."""

    def __init__(self, conn: Conn, *, require_approval: bool = False, max_per_week: int = 3) -> None:
        self.conn = conn
        self.id = uuid4()
        self.phone_number_id = f"PNID-{self.id.hex[:8]}"
        self.patient_phone = f"+9198{self.id.int % 10**8:08d}"
        run(conn, "insert into recovery.clinics (id, name, timezone) values (%(id)s, 'Smile Studio', 'Asia/Kolkata')", id=self.id)
        run(conn, """insert into recovery.clinic_settings
                       (clinic_id, require_staff_approval, max_messages_per_week, whatsapp_phone_number_id)
                     values (%(id)s, %(approval)s, %(max)s, %(pnid)s)""",
            id=self.id, approval=require_approval, max=max_per_week, pnid=self.phone_number_id)
        run(conn, "select recovery.install_default_automations(%(id)s)", id=self.id)
        self.patient = one(conn, """insert into recovery.patients (clinic_id, full_name, phone)
                                    values (%(c)s, 'Ananya Rao', %(phone)s) returning id""",
                           c=self.id, phone=self.patient_phone)["id"]
        self.appointment = one(conn, """insert into recovery.appointments
                                          (clinic_id, patient_id, starts_at, status, treatment, estimated_value)
                                        values (%(c)s, %(p)s, %(at)s, 'scheduled', 'Implant consultation', 45000)
                                        returning id""",
                               c=self.id, p=self.patient, at=NOW + timedelta(hours=30))["id"]

    def detect_and_plan(self, at: datetime = NOW):
        scan_clinic(self.conn, self.id, at)
        return plan_clinic(self.conn, self.id, at)

    def outbound(self) -> list[dict[str, Any]]:
        return rows(self.conn, """select *, status::text as status_text from recovery.outreach_messages
                                  where clinic_id = %(c)s and direction = 'outbound' order by created_at, step_index""",
                    c=self.id)

    def item(self) -> dict[str, Any]:
        return one(self.conn, "select *, status::text as status_text from recovery.recovery_items "
                              "where clinic_id = %(c)s and leak_type = 'unconfirmed_appointment'", c=self.id)

    def reply(self, *, text: str | None = None, payload: str | None = None, at: datetime = NOW, from_digits: str | None = None):
        event = InboundMessage(
            phone_number_id=self.phone_number_id, provider_message_id=f"wamid.in.{uuid4().hex}",
            from_digits=from_digits or self.patient_phone.lstrip("+"), profile_name="Ananya",
            received_at=at, text=text, button_payload=payload,
        )
        return handle_events(self.conn, [event], at), event


def test_plans_first_reminder_and_sends_it_with_buttons(conn):
    clinic = Clinic(conn)

    plan = clinic.detect_and_plan()

    assert (plan.planned, plan.awaiting_approval, plan.failed) == (1, 0, 0)
    [message] = clinic.outbound()
    assert message["status_text"] == "queued"
    assert message["step_index"] == 0  # 48 h-before step; the 24 h-before step is still in the future
    assert message["body"] == (
        "Hi Ananya, this is Smile Studio. Your Implant consultation is booked for Fri 13 Nov, 5:30 pm. "
        "Please tap Confirm, or Reschedule if the time no longer works for you."
    )

    sender = FakeSender()
    result = dispatch_for(clinic, sender, NOW)

    assert (result.sent, result.failed) == (1, 0)
    [sent] = sender.sent
    assert sent.phone_number_id == clinic.phone_number_id
    assert sent.to_digits == clinic.patient_phone.lstrip("+")
    assert sent.template is not None and sent.template.name == "appointment_confirmation"
    assert sent.template.params == ["Ananya", "Smile Studio", "Implant consultation", "Fri 13 Nov, 5:30 pm"]
    assert sent.template.button_payloads == [f"confirm:{message['id']}", f"reschedule:{message['id']}"]
    stored = clinic.outbound()[0]
    assert stored["status_text"] == "sent" and stored["provider_message_id"].startswith("wamid.")


def test_each_step_is_planned_once_and_in_order(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()

    assert clinic.detect_and_plan().planned == 0  # same moment: nothing new
    assert clinic.detect_and_plan(NOW + timedelta(hours=7)).planned == 1  # 24 h-before step now due
    assert clinic.detect_and_plan(NOW + timedelta(hours=8)).planned == 0
    assert [m["step_index"] for m in clinic.outbound()] == [0, 1]


def test_approval_gate(conn):
    clinic = Clinic(conn, require_approval=True)
    assert clinic.detect_and_plan().awaiting_approval == 1

    sender = FakeSender()
    assert dispatch_for(clinic, sender, NOW).sent == 0

    run(conn, "update recovery.outreach_messages set status = 'queued' where clinic_id = %(c)s", c=clinic.id)
    assert dispatch_for(clinic, sender, NOW).sent == 1


def test_quiet_hours_defer_until_morning(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    night = datetime(2037, 11, 12, 22, 0, tzinfo=IST)

    result = dispatch_for(clinic, FakeSender(), night)

    assert result.deferred == 1
    [message] = clinic.outbound()
    assert message["status_text"] == "queued"
    assert message["scheduled_for"] == datetime(2037, 11, 13, 9, 0, tzinfo=IST)
    assert dispatch_for(clinic, FakeSender(), night + timedelta(minutes=5)).deferred == 0  # not due again until 09:00
    assert dispatch_for(clinic, FakeSender(), datetime(2037, 11, 13, 9, 1, tzinfo=IST)).sent == 1


def test_opted_out_patients_are_never_messaged(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    run(conn, """insert into recovery.consents (clinic_id, contact_phone, channel, status, source)
                 values (%(c)s, %(phone)s, 'whatsapp', 'opted_out', 'front_desk')""",
        c=clinic.id, phone=clinic.patient_phone.replace("+", ""))

    sender = FakeSender()
    assert dispatch_for(clinic, sender, NOW).cancelled == 1
    assert sender.sent == []
    assert clinic.outbound()[0]["error"] == "Patient opted out of WhatsApp"


def test_weekly_limit_applies_to_automated_messages(conn):
    clinic = Clinic(conn, max_per_week=1)
    rule = one(conn, "select id from recovery.automation_rules where clinic_id = %(c)s limit 1", c=clinic.id)["id"]
    run(conn, """insert into recovery.outreach_messages
                   (clinic_id, direction, contact_phone, body, status, sent_at, automation_rule_id)
                 values (%(c)s, 'outbound', %(phone)s, 'earlier reminder', 'delivered', %(at)s, %(rule)s)""",
        c=clinic.id, phone=clinic.patient_phone, at=NOW - timedelta(days=1), rule=rule)
    clinic.detect_and_plan()

    assert dispatch_for(clinic, FakeSender(), NOW).cancelled == 1


def test_free_text_only_inside_24_hour_window(conn):
    clinic = Clinic(conn)
    insert_text = """insert into recovery.outreach_messages (clinic_id, direction, contact_phone, body, status)
                     values (%(c)s, 'outbound', %(phone)s, 'Hi Ananya, are you free tomorrow?', 'queued')"""
    run(conn, insert_text, c=clinic.id, phone=clinic.patient_phone)
    assert dispatch_for(clinic, FakeSender(), NOW).failed == 1

    clinic.reply(text="Hello, I had a question", at=NOW - timedelta(hours=2))
    run(conn, insert_text, c=clinic.id, phone=clinic.patient_phone)
    sender = FakeSender()
    assert dispatch_for(clinic, sender, NOW).sent == 1
    assert sender.sent[0].text == "Hi Ananya, are you free tomorrow?"
    inbound = one(conn, "select handled_at from recovery.outreach_messages "
                        "where clinic_id = %(c)s and direction = 'inbound'", c=clinic.id)
    assert inbound["handled_at"] == NOW  # replying dealt with the patient's question


def test_confirm_button_confirms_appointment_and_recovers_item(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    message_id = clinic.outbound()[0]["id"]

    result, _ = clinic.reply(text="Confirm", payload=f"confirm:{message_id}", at=NOW + timedelta(minutes=10))

    assert result.messages == 1
    appointment = one(conn, "select status::text as status, confirmed_at from recovery.appointments where id = %(id)s",
                      id=clinic.appointment)
    assert appointment["status"] == "confirmed" and appointment["confirmed_at"] is not None
    item = clinic.item()
    assert (item["status_text"], item["resolution_note"]) == ("recovered", "Confirmed on WhatsApp")
    assert clinic.outbound()[0]["status_text"] == "replied"
    inbound = one(conn, "select recovery_item_id, handled_at from recovery.outreach_messages "
                        "where clinic_id = %(c)s and direction = 'inbound'", c=clinic.id)
    assert inbound["recovery_item_id"] == item["id"] and inbound["handled_at"] is not None


def test_reschedule_button_creates_callback_task(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    message_id = clinic.outbound()[0]["id"]

    clinic.reply(text="Reschedule", payload=f"reschedule:{message_id}")

    task = one(conn, "select title, patient_id, due_at from recovery.staff_tasks where clinic_id = %(c)s", c=clinic.id)
    assert task["title"] == "Patient asked to reschedule (WhatsApp)"
    assert task["patient_id"] == clinic.patient
    assert task["due_at"] == NOW + timedelta(hours=2)
    assert clinic.item()["status_text"] == "in_progress"


def test_stop_opts_out_and_cancels_pending_messages(conn):
    clinic = Clinic(conn, require_approval=True)
    clinic.detect_and_plan()

    clinic.reply(text="  STOP ")

    consent = one(conn, "select status::text as status from recovery.consents where clinic_id = %(c)s", c=clinic.id)
    assert consent["status"] == "opted_out"
    assert clinic.outbound()[0]["status_text"] == "cancelled"


def test_unknown_number_becomes_an_enquiry_and_duplicates_are_ignored(conn):
    clinic = Clinic(conn)
    _, event = clinic.reply(text="Hi, do you do clear aligners?", from_digits="919111111111")

    enquiry = one(conn, "select contact_name, contact_phone, source::text as source, message "
                        "from recovery.enquiries where clinic_id = %(c)s", c=clinic.id)
    assert enquiry == {"contact_name": "Ananya", "contact_phone": "+919111111111", "source": "whatsapp",
                       "message": "Hi, do you do clear aligners?"}

    again = handle_events(conn, [event], NOW)  # WhatsApp retries webhooks
    assert (again.messages, again.ignored) == (0, 1)

    scan_clinic(conn, clinic.id, NOW + timedelta(hours=2))  # nobody replied within the 60-minute SLA
    leak = one(conn, "select reason from recovery.recovery_items "
                     "where clinic_id = %(c)s and leak_type = 'missed_enquiry'", c=clinic.id)
    assert leak["reason"] == "WhatsApp enquiry, no reply for 2 h"


def test_sending_to_an_enquirer_counts_as_first_response(conn):
    clinic = Clinic(conn)
    clinic.reply(text="Price for whitening?", from_digits="919222222222", at=NOW - timedelta(hours=3))
    clinic.detect_and_plan()

    dispatch_for(clinic, FakeSender(), NOW)

    enquiry = one(conn, "select status::text as status, first_response_at from recovery.enquiries "
                        "where clinic_id = %(c)s", c=clinic.id)
    assert enquiry == {"status": "contacted", "first_response_at": NOW}


def test_delivery_statuses_only_move_forward(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    provider_id = clinic.outbound()[0]["provider_message_id"]

    def status(state: str, error: str | None = None) -> None:
        handle_events(conn, [StatusUpdate(phone_number_id=clinic.phone_number_id, provider_message_id=provider_id,
                                          status=state, at=NOW, error=error)], NOW)  # type: ignore[arg-type]

    status("delivered")
    status("read")
    status("delivered")  # late, out-of-order receipt
    message = clinic.outbound()[0]
    assert message["status_text"] == "read"
    assert message["delivered_at"] == NOW and message["read_at"] == NOW


def test_events_for_unknown_numbers_are_ignored(conn):
    event = StatusUpdate(phone_number_id="not-ours", provider_message_id="x", status="read", at=NOW, error=None)
    assert handle_events(conn, [event], NOW).ignored == 1

