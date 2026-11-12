"""Privacy and integrity rules against a real Postgres, acting as logged-in staff where it matters.

Needs TEST_DATABASE_URL (see test_detection_integration.py).
"""

import os
from contextlib import contextmanager
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest

from app.ai.assist import run_ai_assist
from app.outreach.planner import plan_clinic
from app.privacy import apply_retention
from tests.test_ai_assist_integration import FakeLlm, reply
from tests.test_outreach_integration import (  # noqa: F401 (conn is a fixture)
    NOW,
    Clinic,
    FakeSender,
    conn,
    dispatch_for,
    one,
    run,
)

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")

Denied = psycopg.errors.InsufficientPrivilege


def add_staff(conn, clinic: Clinic, role: str) -> UUID:
    user_id = uuid4()
    run(conn, "insert into auth.users (id) values (%(u)s)", u=user_id)
    run(conn, "insert into recovery.clinic_staff (clinic_id, user_id, full_name, role) "
              "values (%(c)s, %(u)s, 'Staff', %(r)s)", c=clinic.id, u=user_id, r=role)
    return user_id


@contextmanager
def as_user(conn, user_id: UUID):
    """Runs statements the way Supabase runs them for a logged-in user: role authenticated + JWT subject."""
    with conn.transaction():
        run(conn, "set local role authenticated")
        run(conn, "select set_config('request.jwt.claim.sub', %(u)s, true)", u=str(user_id))
        yield


def queue_as(conn, user_id: UUID, clinic: Clinic, **overrides: Any) -> dict[str, Any]:
    values = {"clinic_id": clinic.id, "direction": "outbound", "contact_phone": clinic.patient_phone,
              "body": "Hi Ananya, see you tomorrow", "status": "queued", "created_by": uuid4(), **overrides}
    columns = ", ".join(values)
    placeholders = ", ".join(f"%({name})s" for name in values)
    with as_user(conn, user_id):
        return one(conn, f"insert into recovery.outreach_messages ({columns}) values ({placeholders}) "
                         "returning id, created_by", **values)


# --- staff cannot forge what reports and attribution rely on --------------------------------

def test_staff_queue_messages_as_themselves_only(conn):
    clinic = Clinic(conn)
    staff = add_staff(conn, clinic, "front_desk")

    queued = queue_as(conn, staff, clinic)

    assert queued["created_by"] == staff  # whatever the browser sent, the database records who it was


@pytest.mark.parametrize("forged", [{"direction": "inbound"}, {"status": "sent"}, {"status": "delivered"}])
def test_staff_cannot_insert_fake_sent_or_inbound_messages(conn, forged):
    clinic = Clinic(conn)
    staff = add_staff(conn, clinic, "front_desk")
    with pytest.raises(Denied):
        queue_as(conn, staff, clinic, **forged)


def test_staff_cannot_set_engine_only_columns(conn):
    clinic = Clinic(conn)
    staff = add_staff(conn, clinic, "front_desk")
    with pytest.raises(Denied):
        queue_as(conn, staff, clinic, sent_at=NOW)  # would count as a "touch" for recovered revenue
    with pytest.raises(Denied):
        queue_as(conn, staff, clinic, automation_rule_id=uuid4())


def test_staff_cannot_use_another_clinics_template(conn):
    clinic, other = Clinic(conn), Clinic(conn)
    staff = add_staff(conn, clinic, "front_desk")
    other_template = one(conn, "select id from recovery.message_templates where clinic_id = %(c)s limit 1", c=other.id)
    with pytest.raises(Denied):
        queue_as(conn, staff, clinic, body=None, template_id=other_template["id"])


def test_approval_records_the_real_approver_and_only_allowed_transitions(conn):
    clinic = Clinic(conn, require_approval=True)
    clinic.detect_and_plan()
    message_id = clinic.outbound()[0]["id"]
    staff = add_staff(conn, clinic, "front_desk")

    with pytest.raises(Denied), as_user(conn, staff):
        run(conn, "update recovery.outreach_messages set status = 'sent' where id = %(id)s", id=message_id)
    with pytest.raises(Denied), as_user(conn, staff):
        run(conn, "update recovery.outreach_messages set body = 'changed' where id = %(id)s", id=message_id)

    with as_user(conn, staff):
        run(conn, "update recovery.outreach_messages set status = 'queued', approved_by = %(fake)s where id = %(id)s",
            id=message_id, fake=uuid4())
    approved = one(conn, "select status::text as status, approved_by from recovery.outreach_messages where id = %(id)s",
                   id=message_id)
    assert approved == {"status": "queued", "approved_by": staff}


def test_staff_change_worklist_status_but_not_values(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    item = clinic.item()
    staff = add_staff(conn, clinic, "front_desk")

    with as_user(conn, staff):
        run(conn, "update recovery.recovery_items set status = 'in_progress', resolution_note = 'Calling' "
                  "where id = %(id)s", id=item["id"])
    assert clinic.item()["status_text"] == "in_progress"

    with pytest.raises(Denied), as_user(conn, staff):
        run(conn, "update recovery.recovery_items set estimated_value = 999999 where id = %(id)s", id=item["id"])
    with pytest.raises(Denied), as_user(conn, staff):
        run(conn, "insert into recovery.recovery_items (clinic_id, leak_type, source_ref, estimated_value) "
                  "values (%(c)s, 'lapsed_patient', 'fake:1', 50000)", c=clinic.id)


def test_anonymous_visitors_cannot_call_functions(conn):
    with pytest.raises(Denied), conn.transaction():
        run(conn, "set local role anon")
        run(conn, "select recovery.phone_digits('+91 98000 00000')")


# --- stale reminders --------------------------------------------------------------------------

def test_reminder_is_not_sent_after_the_patient_confirmed_another_way(conn):
    clinic = Clinic(conn, require_approval=True)
    clinic.detect_and_plan()
    message_id = clinic.outbound()[0]["id"]
    # Receptionist approves the reminder, but the patient phones in and confirms before it goes out.
    run(conn, "update recovery.outreach_messages set status = 'queued' where id = %(id)s", id=message_id)
    run(conn, "update recovery.recovery_items set status = 'recovered' where clinic_id = %(c)s", c=clinic.id)

    sender = FakeSender()
    assert dispatch_for(clinic, sender, NOW).cancelled == 1
    assert sender.sent == []
    assert clinic.outbound()[0]["error"] == "No longer needed: the worklist item was resolved"


def test_resolved_items_leave_the_approval_queue(conn):
    clinic = Clinic(conn, require_approval=True)
    clinic.detect_and_plan()
    run(conn, "update recovery.recovery_items set status = 'lost' where clinic_id = %(c)s", c=clinic.id)

    assert plan_clinic(conn, clinic.id, NOW).cancelled_stale == 1
    assert clinic.outbound()[0]["status_text"] == "cancelled"


def test_snoozed_items_hold_their_reminders(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    until = NOW + timedelta(days=1)
    run(conn, "update recovery.recovery_items set snoozed_until = %(u)s where clinic_id = %(c)s", c=clinic.id, u=until)

    assert dispatch_for(clinic, FakeSender(), NOW).deferred == 1
    assert clinic.outbound()[0]["scheduled_for"] == until


# --- right to erasure, retention, AI switch -----------------------------------------------------

def test_only_managers_can_erase_a_contact(conn):
    clinic = Clinic(conn)
    clinic.reply(text="Hi, please delete my data", from_digits="919555555555", at=NOW)
    front_desk, manager = add_staff(conn, clinic, "front_desk"), add_staff(conn, clinic, "manager")

    with pytest.raises(Denied), as_user(conn, front_desk):
        run(conn, "select recovery.forget_contact(%(c)s, '+91 95555 55555')", c=clinic.id)

    with as_user(conn, manager):
        result = one(conn, "select recovery.forget_contact(%(c)s, '+91 95555 55555') as r", c=clinic.id)["r"]

    assert result == {"messages": 1, "enquiries": 1, "items": 0}
    leftovers = one(conn, """select
        (select count(*) from recovery.outreach_messages where clinic_id = %(c)s and contact_phone = '+919555555555') as messages,
        (select count(*) from recovery.enquiries where clinic_id = %(c)s) as enquiries,
        (select status::text from recovery.consents where clinic_id = %(c)s) as consent""", c=clinic.id)
    assert leftovers == {"messages": 0, "enquiries": 0, "consent": "opted_out"}
    audit = one(conn, "select details::text as details from recovery.audit_log "
                      "where clinic_id = %(c)s and action = 'contact.erased'", c=clinic.id)
    assert "95555" not in audit["details"]  # the audit trail keeps counts, not the number


def test_old_message_text_is_removed_after_the_retention_period(conn):
    clinic = Clinic(conn)
    run(conn, "update recovery.clinic_settings set message_retention_days = 30 where clinic_id = %(c)s", c=clinic.id)
    clinic.reply(text="Old question about whitening", from_digits="919666666666", at=NOW - timedelta(days=40))
    clinic.reply(text="Recent question", from_digits="919666666666", at=NOW - timedelta(days=2))

    result = apply_retention(conn, clinic.id, NOW)

    assert (result.messages_redacted, result.enquiries_redacted) == (1, 1)
    inbound = one(conn, "select array_agg(body order by created_at) as bodies from recovery.outreach_messages "
                        "where clinic_id = %(c)s and direction = 'inbound'", c=clinic.id)
    assert inbound["bodies"] == [None, "Recent question"]
    # 38 days apart, so each message opened its own enquiry; only the old one is blanked.
    enquiries = one(conn, "select array_agg(message order by received_at) as messages from recovery.enquiries "
                          "where clinic_id = %(c)s", c=clinic.id)
    assert enquiries["messages"] == [None, "Recent question"]


def test_clinics_can_switch_ai_off(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    clinic.reply(text="Can I come Thursday instead?", at=NOW + timedelta(minutes=5))
    run(conn, "update recovery.clinic_settings set ai_enabled = false where clinic_id = %(c)s", c=clinic.id)

    llm = FakeLlm(reply=reply("reschedule", 0.9))
    result = run_ai_assist(conn, llm, NOW + timedelta(minutes=6), clinic_id=clinic.id)

    assert result.replies_analysed == 0
    assert llm.prompts == []  # nothing about this clinic's patients was sent to the model
