"""Reads clinic settings and keeps recovery.recovery_items in sync with what the detectors found."""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import Connection

from app.detection.models import ClinicScanContext, DetectedItem

Row = dict[str, Any]


class ClinicNotFoundError(Exception):
    pass


# Defaults mirror the column defaults on recovery.clinic_settings, for clinics without a settings row.
CONTEXT_SQL = """
select c.timezone,
       coalesce(s.enquiry_response_sla_minutes, 60) as sla_minutes,
       coalesce(s.unconfirmed_lookahead_hours, 72) as lookahead_hours,
       coalesce(s.lapsed_grace_days, 7) as grace_days
from recovery.clinics c
left join recovery.clinic_settings s on s.clinic_id = c.id
where c.id = %(clinic_id)s
"""


def load_context(conn: Connection[Row], clinic_id: UUID, now: datetime) -> ClinicScanContext:
    with conn.cursor() as cursor:
        cursor.execute(CONTEXT_SQL, {"clinic_id": clinic_id})
        row = cursor.fetchone()
    if row is None:
        raise ClinicNotFoundError(f"clinic {clinic_id} does not exist")
    return ClinicScanContext(
        clinic_id=clinic_id,
        timezone=ZoneInfo(row["timezone"]),
        now=now,
        enquiry_response_sla=timedelta(minutes=row["sla_minutes"]),
        unconfirmed_lookahead=timedelta(hours=row["lookahead_hours"]),
        lapsed_grace_days=row["grace_days"],
    )


def list_clinic_ids(conn: Connection[Row]) -> list[UUID]:
    with conn.cursor() as cursor:
        cursor.execute("select id from recovery.clinics order by created_at, id")
        return [row["id"] for row in cursor.fetchall()]


# Refreshes only items staff are still working on, and only when something actually changed,
# so resolved items are never reopened and "updated" counts real changes.
UPSERT_SQL = """
insert into recovery.recovery_items as i (
  clinic_id, leak_type, source_ref, patient_id, enquiry_id, appointment_id, followup_id, task_id,
  patient_name, contact_phone, reason, estimated_value, priority_score, due_at
) values (
  %(clinic_id)s, %(leak_type)s, %(source_ref)s, %(patient_id)s, %(enquiry_id)s, %(appointment_id)s,
  %(followup_id)s, %(task_id)s, %(patient_name)s, %(contact_phone)s, %(reason)s, %(estimated_value)s,
  %(priority_score)s, %(due_at)s
)
on conflict (clinic_id, leak_type, source_ref) do update set
  patient_id = excluded.patient_id,
  patient_name = excluded.patient_name,
  contact_phone = excluded.contact_phone,
  reason = excluded.reason,
  estimated_value = excluded.estimated_value,
  priority_score = excluded.priority_score,
  due_at = excluded.due_at
where i.status in ('open', 'in_progress')
  and (i.patient_id, i.patient_name, i.contact_phone, i.reason, i.estimated_value, i.priority_score, i.due_at)
      is distinct from
      (excluded.patient_id, excluded.patient_name, excluded.contact_phone, excluded.reason,
       excluded.estimated_value, excluded.priority_score, excluded.due_at)
returning (xmax = 0) as inserted
"""


def upsert_items(conn: Connection[Row], clinic_id: UUID, items: list[DetectedItem]) -> tuple[int, int]:
    """Returns (created, updated)."""
    created = updated = 0
    with conn.cursor() as cursor:
        for item in items:
            cursor.execute(UPSERT_SQL, {"clinic_id": clinic_id, **item.model_dump()})
            row = cursor.fetchone()
            if row is None:
                continue
            if row["inserted"]:
                created += 1
            else:
                updated += 1
    return created, updated


# Each query maps an open item to its new status and note once its source no longer qualifies.
# A null new_status means the item still stands.
RESOLUTION_QUERIES = (
    """
    select i.id,
           case when e.status = 'booked' or e.booked_appointment_id is not null then 'recovered'
                when e.status = 'lost' then 'lost' end as new_status,
           case when e.status = 'booked' or e.booked_appointment_id is not null then 'Booked'
                when e.status = 'lost' then 'Enquiry marked lost' end as note
    from recovery.recovery_items i
    join recovery.enquiries e on e.id = i.enquiry_id
    where i.clinic_id = %(clinic_id)s and i.leak_type = 'missed_enquiry' and i.status in ('open', 'in_progress')
    """,
    """
    select i.id,
           case when t.done_at is not null or t.due_at > %(now)s then 'dismissed' end as new_status,
           case when t.done_at is not null then 'Task completed'
                when t.due_at > %(now)s then 'Task rescheduled' end as note
    from recovery.recovery_items i
    join recovery.staff_tasks t on t.id = i.task_id
    where i.clinic_id = %(clinic_id)s and i.leak_type = 'overdue_followup' and i.status in ('open', 'in_progress')
    """,
    """
    select i.id,
           case when a.status in ('confirmed', 'completed') then 'recovered'
                when a.status in ('cancelled', 'no_show') then 'lost'
                when a.starts_at <= %(now)s then 'dismissed'
                when a.starts_at > %(now)s + %(lookahead)s then 'dismissed' end as new_status,
           case a.status when 'confirmed' then 'Confirmed'
                         when 'completed' then 'Attended'
                         when 'cancelled' then 'Cancelled'
                         when 'no_show' then 'No-show'
                         else case when a.starts_at <= %(now)s then 'Appointment time passed unconfirmed'
                                   else 'Rescheduled outside the confirmation window' end
           end as note
    from recovery.recovery_items i
    join recovery.appointments a on a.id = i.appointment_id
    where i.clinic_id = %(clinic_id)s and i.leak_type = 'unconfirmed_appointment'
      and i.status in ('open', 'in_progress')
    """,
    """
    select i.id,
           case when f.booked_appointment_id is not null or f.completed_at is not null then 'recovered'
                when f.due_on >= %(cutoff)s then 'dismissed' end as new_status,
           case when f.booked_appointment_id is not null then 'Booked'
                when f.completed_at is not null then 'Completed'
                when f.due_on >= %(cutoff)s then 'Follow-up rescheduled' end as note
    from recovery.recovery_items i
    join recovery.planned_followups f on f.id = i.followup_id
    where i.clinic_id = %(clinic_id)s and i.leak_type = 'lapsed_patient' and i.status in ('open', 'in_progress')
    """,
)

RESOLVE_SQL = """
update recovery.recovery_items
set status = %(status)s::recovery.item_status, resolution_note = %(note)s
where id = %(id)s
"""


def resolve_items(conn: Connection[Row], ctx: ClinicScanContext) -> int:
    params = {
        "clinic_id": ctx.clinic_id,
        "now": ctx.now,
        "lookahead": ctx.unconfirmed_lookahead,
        "cutoff": ctx.today - timedelta(days=ctx.lapsed_grace_days),
    }
    resolved = 0
    with conn.cursor() as cursor:
        for query in RESOLUTION_QUERIES:
            cursor.execute(query, params)
            for row in cursor.fetchall():
                if row["new_status"] is None:
                    continue
                with conn.cursor() as update:
                    update.execute(RESOLVE_SQL, {"id": row["id"], "status": row["new_status"], "note": row["note"]})
                resolved += 1
    return resolved
