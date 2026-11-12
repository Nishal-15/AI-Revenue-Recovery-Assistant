"""Booking attribution and the report function against a real Postgres.

Needs TEST_DATABASE_URL (see test_detection_integration.py).
"""

import os
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

import pytest
from psycopg.types.json import Jsonb

from app.attribution import attribute_bookings
from app.detection.scan import scan_clinic
from tests.test_outreach_integration import (  # noqa: F401 (conn is a fixture)
    NOW,
    Clinic,
    FakeSender,
    conn,
    dispatch_for,
    one,
    rows,
    run,
)

TODAY = date(2037, 11, 12)  # NOW in the clinic's timezone

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")


def bookings(conn, clinic: Clinic) -> list[dict[str, Any]]:
    return rows(conn, "select *, leak_type::text as leak from recovery.recovered_bookings "
                      "where clinic_id = %(c)s order by booked_at", c=clinic.id)


def new_appointment(conn, clinic: Clinic, *, created_at, value=18000, patient=None, treatment="Crown") -> Any:
    return one(conn, """insert into recovery.appointments
                          (clinic_id, patient_id, starts_at, status, treatment, estimated_value, created_at)
                        values (%(c)s, %(p)s, %(starts)s, 'scheduled', %(t)s, %(v)s, %(created)s) returning id""",
               c=clinic.id, p=patient or clinic.patient, starts=created_at + timedelta(days=5), t=treatment,
               v=value, created=created_at)["id"]


def lapsed_followup(conn, clinic: Clinic) -> Any:
    return one(conn, """insert into recovery.planned_followups
                          (clinic_id, patient_id, kind, procedure, due_on, estimated_value)
                        values (%(c)s, %(p)s, 'treatment_step', 'Crown after root canal', %(due)s, 18000) returning id""",
               c=clinic.id, p=clinic.patient, due=TODAY - timedelta(days=12))["id"]


def test_confirmed_after_reminder_is_a_saved_appointment(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    message = clinic.outbound()[0]
    clinic.reply(text="Confirm", payload=f"confirm:{message['id']}", at=NOW + timedelta(minutes=10))

    result = attribute_bookings(conn, clinic.id, NOW + timedelta(hours=1))

    assert (result.saved_appointments, result.new_bookings) == (1, 0)
    [booking] = bookings(conn, clinic)
    assert booking["rule"] == "saved_appointment" and booking["leak"] == "unconfirmed_appointment"
    assert booking["appointment_id"] == clinic.appointment
    assert booking["attributed_message_id"] == message["id"]
    assert booking["value"] == 45000


def test_booking_after_recall_reminder_is_credited_to_the_recall(conn):
    clinic = Clinic(conn)
    lapsed_followup(conn, clinic)
    clinic.detect_and_plan()  # plans both the appointment reminder and the recall
    dispatch_for(clinic, FakeSender(), NOW)
    booked_at = NOW + timedelta(days=2)
    appointment = new_appointment(conn, clinic, created_at=booked_at)

    result = attribute_bookings(conn, clinic.id, booked_at + timedelta(hours=1))

    assert result.new_bookings == 1
    [booking] = bookings(conn, clinic)
    assert (booking["appointment_id"], booking["rule"], booking["leak"]) == (appointment, "new_booking", "lapsed_patient")
    assert booking["value"] == 18000
    lapsed = one(conn, "select status::text as status, resolution_note from recovery.recovery_items "
                       "where clinic_id = %(c)s and leak_type = 'lapsed_patient'", c=clinic.id)
    assert lapsed == {"status": "recovered", "resolution_note": "Booked after outreach"}


def test_bookings_without_contact_or_outside_the_window_are_not_credited(conn):
    clinic = Clinic(conn)
    new_appointment(conn, clinic, created_at=NOW + timedelta(days=1))  # no message sent yet
    assert attribute_bookings(conn, clinic.id, NOW + timedelta(days=1, hours=1)).new_bookings == 0

    clinic.detect_and_plan(NOW + timedelta(days=1, hours=2))
    dispatch_for(clinic, FakeSender(), NOW + timedelta(days=1, hours=2))
    too_late = NOW + timedelta(days=1, hours=2) + timedelta(days=15)  # window is 14 days
    new_appointment(conn, clinic, created_at=too_late)
    assert attribute_bookings(conn, clinic.id, too_late + timedelta(hours=1)).new_bookings == 0
    assert bookings(conn, clinic) == []


def test_cancellation_reverses_credit_and_reruns_are_idempotent(conn):
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    message = clinic.outbound()[0]
    clinic.reply(text="Confirm", payload=f"confirm:{message['id']}", at=NOW + timedelta(minutes=10))
    attribute_bookings(conn, clinic.id, NOW + timedelta(hours=1))

    again = attribute_bookings(conn, clinic.id, NOW + timedelta(hours=2))
    assert (again.saved_appointments, again.new_bookings, again.reversed) == (0, 0, 0)

    run(conn, "update recovery.appointments set status = 'no_show' where id = %(id)s", id=clinic.appointment)
    reversed_run = attribute_bookings(conn, clinic.id, NOW + timedelta(days=2))
    assert reversed_run.reversed == 1
    assert bookings(conn, clinic) == []


def test_whatsapp_enquiry_that_becomes_a_patient_is_credited(conn):
    clinic = Clinic(conn)
    clinic.reply(text="Do you do whitening?", from_digits="919444444444", at=NOW - timedelta(hours=3))
    clinic.detect_and_plan()  # missed enquiry -> enquiry follow-up template
    dispatch_for(clinic, FakeSender(), NOW)
    # The front desk registers her with a differently formatted number and books her.
    new_patient = one(conn, "insert into recovery.patients (clinic_id, full_name, phone) "
                            "values (%(c)s, 'Divya Nair', '+91 94444 44444') returning id", c=clinic.id)["id"]
    booked_at = NOW + timedelta(days=1)
    appointment = new_appointment(conn, clinic, created_at=booked_at, patient=new_patient, value=10000, treatment="Whitening")

    assert attribute_bookings(conn, clinic.id, booked_at + timedelta(hours=1)).new_bookings == 1
    [booking] = bookings(conn, clinic)
    assert (booking["appointment_id"], booking["leak"], booking["value"]) == (appointment, "missed_enquiry", 10000)
    enquiry = one(conn, "select status::text as status, booked_appointment_id from recovery.enquiries "
                        "where clinic_id = %(c)s", c=clinic.id)
    assert enquiry == {"status": "booked", "booked_appointment_id": appointment}


def test_staff_follow_up_without_a_message_still_counts(conn):
    clinic = Clinic(conn, require_approval=True)  # reminders wait for approval, so nothing is sent
    lapsed_followup(conn, clinic)
    scan_clinic(conn, clinic.id, NOW)
    item = one(conn, "select id from recovery.recovery_items where clinic_id = %(c)s and leak_type = 'lapsed_patient'",
               c=clinic.id)
    # A receptionist picked it up (the trigger records this when a logged-in user changes the status).
    run(conn, """insert into recovery.audit_log (clinic_id, actor_id, action, entity, entity_id, details, created_at)
                 values (%(c)s, %(actor)s, 'recovery_item.status_changed', 'recovery_items', %(item)s, %(details)s, %(at)s)""",
        c=clinic.id, actor=uuid4(), item=item["id"], details=Jsonb({"from": "open", "to": "in_progress"}),
        at=NOW + timedelta(hours=1))
    booked_at = NOW + timedelta(days=1)
    new_appointment(conn, clinic, created_at=booked_at)

    assert attribute_bookings(conn, clinic.id, booked_at + timedelta(hours=1)).new_bookings == 1
    [booking] = bookings(conn, clinic)
    assert booking["attributed_message_id"] is None and booking["leak"] == "lapsed_patient"


def test_report_summary_for_a_staff_member(conn):
    clinic = Clinic(conn)
    lapsed_followup(conn, clinic)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    message = next(m for m in clinic.outbound() if m["step_index"] == 0 and m["body"].startswith("Hi Ananya, this is"))
    clinic.reply(text="Confirm", payload=f"confirm:{message['id']}", at=NOW + timedelta(minutes=10))
    new_appointment(conn, clinic, created_at=NOW + timedelta(days=1))
    attribute_bookings(conn, clinic.id, NOW + timedelta(days=1, hours=1))

    user_id = uuid4()
    run(conn, "insert into auth.users (id) values (%(u)s)", u=user_id)
    run(conn, "insert into recovery.clinic_staff (clinic_id, user_id, full_name, role) values (%(c)s, %(u)s, 'Reception', 'front_desk')",
        c=clinic.id, u=user_id)
    with conn.transaction():
        run(conn, "set local role authenticated")
        run(conn, "select set_config('request.jwt.claim.sub', %(u)s, true)", u=str(user_id))
        report = one(conn, "select recovery.report_summary(%(c)s, %(f)s, %(t)s) as r",
                     c=clinic.id, f=NOW - timedelta(days=365 * 20), t=NOW + timedelta(days=30))["r"]  # triggers stamp real time

    assert report["recovered_bookings"] == 2
    assert (report["new_bookings"], report["saved_appointments"]) == (1, 1)
    assert float(report["recovered_value"]) == 45000 + 18000
    assert report["messages"]["sent"] == 2 and report["messages"]["replied"] == 1
    assert report["auto_resolved"] == 1
    by_leak = {row["leak_type"]: row for row in report["by_leak"]}
    assert by_leak["unconfirmed_appointment"]["bookings"] == 1
    assert by_leak["lapsed_patient"]["bookings"] == 1 and float(by_leak["lapsed_patient"]["recovered_value"]) == 18000
    assert {b["rule"] for b in report["bookings"]} == {"new_booking", "saved_appointment"}
