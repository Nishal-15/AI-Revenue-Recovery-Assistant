"""Looks up what a template's placeholders refer to: the patient, clinic, appointment or procedure."""

from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import Connection

from app.outreach.render import template_values

Row = dict[str, Any]

ITEM_VALUES_SQL = """
select i.patient_name, c.name as clinic_name, c.timezone, a.treatment, a.starts_at, f.procedure
from recovery.recovery_items i
join recovery.clinics c on c.id = i.clinic_id
left join recovery.appointments a on a.id = i.appointment_id
left join recovery.planned_followups f on f.id = i.followup_id
where i.id = %(item_id)s
"""

CONTACT_VALUES_SQL = """
select c.name as clinic_name, c.timezone,
       (select p.full_name from recovery.patients p
         where p.clinic_id = c.id and recovery.phone_digits(p.phone) = recovery.phone_digits(%(phone)s)
         order by p.created_at limit 1) as patient_name
from recovery.clinics c
where c.id = %(clinic_id)s
"""


def load_values(conn: Connection[Row], *, clinic_id: UUID, item_id: UUID | None, phone: str) -> dict[str, str]:
    with conn.cursor() as cursor:
        if item_id is not None:
            cursor.execute(ITEM_VALUES_SQL, {"item_id": item_id})
            row = cursor.fetchone()
            if row is not None:
                return template_values(
                    patient_name=row["patient_name"],
                    clinic_name=row["clinic_name"],
                    timezone=ZoneInfo(row["timezone"]),
                    treatment=row["treatment"],
                    starts_at=row["starts_at"],
                    procedure=row["procedure"],
                )
        cursor.execute(CONTACT_VALUES_SQL, {"clinic_id": clinic_id, "phone": phone})
        row = cursor.fetchone()
    if row is None:
        return {}
    return template_values(patient_name=row["patient_name"], clinic_name=row["clinic_name"], timezone=ZoneInfo(row["timezone"]))
