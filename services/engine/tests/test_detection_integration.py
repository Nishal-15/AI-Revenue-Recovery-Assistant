"""Detection against a real Postgres with the project's migrations applied.

Start one with `npm run db:test` (repo root), then:
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres pytest
Skipped when TEST_DATABASE_URL is not set. Every test works in its own fresh clinic.
"""

import os
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from psycopg.rows import dict_row

from app.detection.repository import ClinicNotFoundError
from app.detection.scan import scan_clinic

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL not set")

NOW = datetime(2026, 11, 12, 6, 0, tzinfo=UTC)  # 11:30 in Asia/Kolkata
TODAY = date(2026, 11, 12)

Conn = psycopg.Connection[dict[str, Any]]


@pytest.fixture(scope="module")
def conn():
    assert DATABASE_URL
    with psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True, prepare_threshold=None) as connection:
        yield connection


def insert(conn: Conn, table: str, **values: Any) -> UUID:
    columns = ", ".join(values)
    placeholders = ", ".join(f"%({name})s" for name in values)
    with conn.cursor() as cursor:
        cursor.execute(f"insert into recovery.{table} ({columns}) values ({placeholders}) returning id", values)
        row = cursor.fetchone()
    assert row
    return row["id"]


def execute(conn: Conn, sql: str, **params: Any) -> None:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)


def items(conn: Conn, clinic_id: UUID) -> dict[str, dict[str, Any]]:
    with conn.cursor() as cursor:
        cursor.execute("select * from recovery.recovery_items where clinic_id = %s", (clinic_id,))
        return {row["leak_type"]: row for row in cursor.fetchall()}


class Clinic:
    """A clinic with one patient and one of each leak, as the front desk would see on a normal morning."""

    def __init__(self, conn: Conn) -> None:
        self.id = insert(conn, "clinics", id=uuid4(), name="Test Clinic", timezone="Asia/Kolkata")
        self.patient = insert(conn, "patients", clinic_id=self.id, full_name="Vikram Shah", phone="+919800000002")
        self.enquiry = insert(
            conn, "enquiries", clinic_id=self.id, contact_name="Meera Iyer", contact_phone="+919800000010",
            source="whatsapp", interest="aligners", received_at=NOW - timedelta(hours=3),
        )
        self.followup = insert(
            conn, "planned_followups", clinic_id=self.id, patient_id=self.patient, kind="treatment_step",
            procedure="Crown after root canal", due_on=TODAY - timedelta(days=12), estimated_value=18000,
        )
        self.task = insert(
            conn, "staff_tasks", clinic_id=self.id, patient_id=self.patient, kind="callback",
            title="Call back about treatment quote", due_at=NOW - timedelta(hours=30),
        )
        self.appointment = insert(
            conn, "appointments", clinic_id=self.id, patient_id=self.patient, status="scheduled",
            starts_at=NOW + timedelta(hours=20), treatment="Implant consultation", estimated_value=45000,
        )


def test_detects_all_four_leak_types(conn):
    clinic = Clinic(conn)

    result = scan_clinic(conn, clinic.id, NOW)

    assert (result.created, result.updated, result.resolved) == (4, 0, 0)
    found = items(conn, clinic.id)

    enquiry = found["missed_enquiry"]
    assert enquiry["enquiry_id"] == clinic.enquiry
    assert enquiry["estimated_value"] == 65000
    assert enquiry["reason"] == "WhatsApp enquiry about aligners, no reply for 3 h"
    assert enquiry["patient_name"] == "Meera Iyer"

    task = found["overdue_followup"]
    assert task["task_id"] == clinic.task
    assert task["estimated_value"] == 18000  # priced by the patient's open crown follow-up
    assert task["reason"] == "Callback overdue by 30 h: Call back about treatment quote"

    appointment = found["unconfirmed_appointment"]
    assert appointment["appointment_id"] == clinic.appointment
    assert appointment["reason"] == "Implant consultation tomorrow 07:30, not confirmed"
    assert appointment["priority_score"] > task["priority_score"]

    lapsed = found["lapsed_patient"]
    assert lapsed["followup_id"] == clinic.followup
    assert lapsed["reason"] == "Crown after root canal due 12 days ago, not booked"
    assert all(item["status"] == "open" for item in found.values())
    # Stamped with the scan's time, not the database clock, so "as soon as found" reminders are due this cycle.
    assert all(item["detected_at"] == NOW for item in found.values())


def test_rescanning_is_idempotent(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)

    again = scan_clinic(conn, clinic.id, NOW)

    assert (again.created, again.updated, again.resolved) == (0, 0, 0)
    assert len(items(conn, clinic.id)) == 4


def test_later_scan_refreshes_open_items(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)

    later = scan_clinic(conn, clinic.id, NOW + timedelta(hours=2))

    assert later.created == 0
    assert later.updated >= 1
    assert items(conn, clinic.id)["missed_enquiry"]["reason"].endswith("no reply for 5 h")


def test_sources_clearing_resolve_their_items(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)

    execute(conn, "update recovery.appointments set status = 'confirmed' where id = %(id)s", id=clinic.appointment)
    execute(conn, "update recovery.staff_tasks set done_at = %(now)s where id = %(id)s", id=clinic.task, now=NOW)
    execute(conn, "update recovery.enquiries set status = 'booked' where id = %(id)s", id=clinic.enquiry)
    booked = insert(
        conn, "appointments", clinic_id=clinic.id, patient_id=clinic.patient, status="scheduled",
        starts_at=NOW + timedelta(days=10), treatment="Crown",
    )
    execute(conn, "update recovery.planned_followups set booked_appointment_id = %(a)s where id = %(id)s",
            a=booked, id=clinic.followup)

    result = scan_clinic(conn, clinic.id, NOW)

    assert result.resolved == 4
    found = items(conn, clinic.id)
    assert (found["unconfirmed_appointment"]["status"], found["unconfirmed_appointment"]["resolution_note"]) == (
        "recovered", "Confirmed")
    assert (found["overdue_followup"]["status"], found["overdue_followup"]["resolution_note"]) == (
        "dismissed", "Task completed")
    assert found["missed_enquiry"]["status"] == "recovered"
    assert found["lapsed_patient"]["status"] == "recovered"
    assert all(item["resolved_at"] is not None for item in found.values())


def test_cancelled_appointment_is_lost_and_audited(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)
    execute(conn, "update recovery.appointments set status = 'cancelled' where id = %(id)s", id=clinic.appointment)

    scan_clinic(conn, clinic.id, NOW)

    item = items(conn, clinic.id)["unconfirmed_appointment"]
    assert (item["status"], item["resolution_note"]) == ("lost", "Cancelled")
    with conn.cursor() as cursor:
        cursor.execute("select actor_id, details from recovery.audit_log where entity_id = %s", (item["id"],))
        audit = cursor.fetchone()
    assert audit and audit["actor_id"] is None and audit["details"]["to"] == "lost"


def test_appointment_time_passing_unconfirmed_dismisses(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)

    scan_clinic(conn, clinic.id, NOW + timedelta(hours=21))

    item = items(conn, clinic.id)["unconfirmed_appointment"]
    assert (item["status"], item["resolution_note"]) == ("dismissed", "Appointment time passed unconfirmed")


def test_resolved_items_are_never_reopened(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)
    execute(conn, "update recovery.recovery_items set status = 'lost' where clinic_id = %(c)s", c=clinic.id)

    result = scan_clinic(conn, clinic.id, NOW)

    assert (result.created, result.updated) == (0, 0)
    assert {item["status"] for item in items(conn, clinic.id).values()} == {"lost"}


def test_staff_progress_is_kept_on_refresh(conn):
    clinic = Clinic(conn)
    scan_clinic(conn, clinic.id, NOW)
    execute(conn, "update recovery.recovery_items set status = 'in_progress' where clinic_id = %(c)s", c=clinic.id)

    scan_clinic(conn, clinic.id, NOW + timedelta(hours=2))

    assert {item["status"] for item in items(conn, clinic.id).values()} == {"in_progress"}


def test_clinic_settings_change_thresholds(conn):
    clinic = Clinic(conn)
    insert_settings = "insert into recovery.clinic_settings (clinic_id, enquiry_response_sla_minutes, lapsed_grace_days) values (%(c)s, 600, 30)"
    execute(conn, insert_settings, c=clinic.id)

    scan_clinic(conn, clinic.id, NOW)

    found = items(conn, clinic.id)
    assert "missed_enquiry" not in found  # 3 h old, SLA is 10 h
    assert "lapsed_patient" not in found  # 12 days overdue, grace is 30 days


def test_scan_only_touches_its_own_clinic(conn):
    clinic, other = Clinic(conn), Clinic(conn)

    scan_clinic(conn, clinic.id, NOW)

    assert len(items(conn, clinic.id)) == 4
    assert items(conn, other.id) == {}


def test_unknown_clinic_raises(conn):
    with pytest.raises(ClinicNotFoundError):
        scan_clinic(conn, uuid4(), NOW)
