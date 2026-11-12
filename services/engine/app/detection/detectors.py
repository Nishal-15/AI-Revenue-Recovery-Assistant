"""The four leak detectors. Each reads practice tables for one clinic and returns what should be on the worklist.

Detectors only find leaks; `repository.py` decides what to insert, refresh or resolve.
"""

from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from psycopg import Connection

from app.detection import reasons
from app.detection.models import ClinicScanContext, DetectedItem
from app.detection.pricing import DEFAULT_TASK_VALUE, enquiry_value
from app.detection.scoring import priority_score

Row = dict[str, Any]

# A replied-to enquiry that still hasn't booked after this long is treated as slipping away.
UNBOOKED_AFTER_REPLY = timedelta(days=3)


def _fetch(conn: Connection[Row], sql: str, params: dict[str, Any]) -> list[Row]:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


MISSED_ENQUIRIES_SQL = """
select e.id, e.patient_id, coalesce(p.full_name, e.contact_name) as name, e.contact_phone,
       e.source::text as source, e.interest, e.urgency, e.status::text as status, e.received_at
from recovery.enquiries e
left join recovery.patients p on p.id = e.patient_id
where e.clinic_id = %(clinic_id)s
  and e.booked_appointment_id is null
  and (
    (e.status = 'new' and e.first_response_at is null and e.received_at < %(now)s - %(sla)s)
    or (e.status = 'contacted' and e.received_at < %(now)s - %(unbooked_after)s)
  )
"""


def _scoring_interest(row: Row) -> str | None:
    """An enquiry the AI judged an emergency gets the emergency boost even if no treatment was named."""
    return "pain_emergency" if row["urgency"] == "emergency" else row["interest"]


def detect_missed_enquiries(conn: Connection[Row], ctx: ClinicScanContext) -> list[DetectedItem]:
    rows = _fetch(
        conn,
        MISSED_ENQUIRIES_SQL,
        {"clinic_id": ctx.clinic_id, "now": ctx.now, "sla": ctx.enquiry_response_sla,
         "unbooked_after": UNBOOKED_AFTER_REPLY},
    )
    items = []
    for row in rows:
        waiting = ctx.now - row["received_at"]
        value = enquiry_value(row["interest"])
        reason = (
            reasons.unanswered_enquiry_reason(row["source"], row["interest"], waiting)
            if row["status"] == "new"
            else reasons.unbooked_enquiry_reason(waiting)
        )
        items.append(
            DetectedItem(
                leak_type="missed_enquiry",
                source_ref=f"enquiry:{row['id']}",
                enquiry_id=row["id"],
                patient_id=row["patient_id"],
                patient_name=row["name"],
                contact_phone=row["contact_phone"],
                reason=reason,
                estimated_value=value,
                priority_score=priority_score("missed_enquiry", float(value), waiting, _scoring_interest(row)),
                due_at=row["received_at"] + ctx.enquiry_response_sla,
            )
        )
    return items


OVERDUE_TASKS_SQL = """
select t.id, t.patient_id, t.enquiry_id, t.kind::text as kind, t.title, t.due_at,
       coalesce(p.full_name, e.contact_name) as name,
       coalesce(p.phone, e.contact_phone) as phone,
       e.interest,
       (select max(f.estimated_value)
          from recovery.planned_followups f
         where f.patient_id = t.patient_id
           and f.completed_at is null
           and f.booked_appointment_id is null) as followup_value
from recovery.staff_tasks t
left join recovery.patients p on p.id = t.patient_id
left join recovery.enquiries e on e.id = t.enquiry_id
where t.clinic_id = %(clinic_id)s
  and t.done_at is null
  and t.due_at < %(now)s
"""


def _task_value(row: Row) -> Decimal:
    if row["enquiry_id"] is not None:
        return enquiry_value(row["interest"])
    if row["followup_value"] is not None:
        return Decimal(row["followup_value"])
    return DEFAULT_TASK_VALUE


def detect_overdue_followups(conn: Connection[Row], ctx: ClinicScanContext) -> list[DetectedItem]:
    rows = _fetch(conn, OVERDUE_TASKS_SQL, {"clinic_id": ctx.clinic_id, "now": ctx.now})
    items = []
    for row in rows:
        overdue = ctx.now - row["due_at"]
        value = _task_value(row)
        items.append(
            DetectedItem(
                leak_type="overdue_followup",
                source_ref=f"task:{row['id']}",
                task_id=row["id"],
                patient_id=row["patient_id"],
                enquiry_id=row["enquiry_id"],
                patient_name=row["name"],
                contact_phone=row["phone"],
                reason=reasons.overdue_task_reason(row["kind"], row["title"], overdue),
                estimated_value=value,
                priority_score=priority_score("overdue_followup", float(value), overdue, row["interest"]),
                due_at=row["due_at"],
            )
        )
    return items


UNCONFIRMED_APPOINTMENTS_SQL = """
select a.id, a.patient_id, a.starts_at, a.treatment, a.estimated_value, p.full_name, p.phone
from recovery.appointments a
join recovery.patients p on p.id = a.patient_id
where a.clinic_id = %(clinic_id)s
  and a.status = 'scheduled'
  and a.starts_at > %(now)s
  and a.starts_at <= %(now)s + %(lookahead)s
"""


def detect_unconfirmed_appointments(conn: Connection[Row], ctx: ClinicScanContext) -> list[DetectedItem]:
    rows = _fetch(
        conn,
        UNCONFIRMED_APPOINTMENTS_SQL,
        {"clinic_id": ctx.clinic_id, "now": ctx.now, "lookahead": ctx.unconfirmed_lookahead},
    )
    items = []
    for row in rows:
        value = Decimal(row["estimated_value"])
        starts_local = row["starts_at"].astimezone(ctx.timezone)
        items.append(
            DetectedItem(
                leak_type="unconfirmed_appointment",
                source_ref=f"appointment:{row['id']}",
                appointment_id=row["id"],
                patient_id=row["patient_id"],
                patient_name=row["full_name"],
                contact_phone=row["phone"],
                reason=reasons.unconfirmed_appointment_reason(row["treatment"], starts_local, ctx.today),
                estimated_value=value,
                priority_score=priority_score("unconfirmed_appointment", float(value), row["starts_at"] - ctx.now),
                due_at=row["starts_at"],
            )
        )
    return items


LAPSED_FOLLOWUPS_SQL = """
select f.id, f.patient_id, f.kind::text as kind, f.procedure, f.due_on, f.estimated_value, p.full_name, p.phone
from recovery.planned_followups f
join recovery.patients p on p.id = f.patient_id
where f.clinic_id = %(clinic_id)s
  and f.completed_at is null
  and f.booked_appointment_id is null
  and f.due_on < %(cutoff)s
"""


def detect_lapsed_patients(conn: Connection[Row], ctx: ClinicScanContext) -> list[DetectedItem]:
    cutoff = ctx.today - timedelta(days=ctx.lapsed_grace_days)
    rows = _fetch(conn, LAPSED_FOLLOWUPS_SQL, {"clinic_id": ctx.clinic_id, "cutoff": cutoff})
    items = []
    for row in rows:
        value = Decimal(row["estimated_value"])
        days_overdue = (ctx.today - row["due_on"]).days
        items.append(
            DetectedItem(
                leak_type="lapsed_patient",
                source_ref=f"followup:{row['id']}",
                followup_id=row["id"],
                patient_id=row["patient_id"],
                patient_name=row["full_name"],
                contact_phone=row["phone"],
                reason=reasons.lapsed_followup_reason(row["kind"], row["procedure"], days_overdue),
                estimated_value=value,
                priority_score=priority_score("lapsed_patient", float(value), timedelta(days=days_overdue)),
                due_at=datetime.combine(row["due_on"], time.min, tzinfo=ctx.timezone),
            )
        )
    return items


DETECTORS = (
    detect_missed_enquiries,
    detect_overdue_followups,
    detect_unconfirmed_appointments,
    detect_lapsed_patients,
)


def detect_all(conn: Connection[Row], ctx: ClinicScanContext) -> list[DetectedItem]:
    return [item for detector in DETECTORS for item in detector(conn, ctx)]
