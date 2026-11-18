"""Changes the date of a patient's appointment or planned follow-up, then shows what the system does.

    .venv/Scripts/python -m scripts.change_date

Type part of the patient's name, pick the appointment or follow-up, and type the new date.
Reminders not sent yet are updated with the new date automatically.
"""

import sys
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.jobs import run_clinic_cycle
from scripts.add_patient import ask, masked, one

Conn = psycopg.Connection[dict[str, Any]]


def choose(options: list[str]) -> int:
    for number, label in enumerate(options, start=1):
        print(f"  {number}. {label}")
    while True:
        answer = ask(f"Type a number from 1 to {len(options)}", default="1")
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return int(answer) - 1
        print("  Please type one of the numbers shown.")


def ask_new_datetime(timezone: ZoneInfo, current: datetime) -> datetime:
    local = current.astimezone(timezone)
    while True:
        day = ask("New date (YYYY-MM-DD)", default=local.date().isoformat())
        clock = ask("New time (24-hour, HH:MM)", default=f"{local:%H:%M}")
        try:
            return datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=timezone)
        except ValueError:
            print("  Please use the format 2026-11-20 and 14:30.")


def ask_new_date(current: Any) -> Any:
    while True:
        day = ask("New due date (YYYY-MM-DD)", default=current.isoformat())
        try:
            return datetime.fromisoformat(day).date()
        except ValueError:
            print("  Please use the format 2026-11-20.")


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

        search = ask("\nPatient's name (or part of it)")
        with conn.cursor() as cursor:
            cursor.execute(
                """select 'appointment' as kind, a.id, p.full_name, p.phone, a.treatment as what, a.starts_at as at, null::date as due_on
                   from recovery.appointments a join recovery.patients p on p.id = a.patient_id
                   where a.clinic_id = %(c)s and p.full_name ilike %(q)s and a.status in ('scheduled', 'confirmed')
                     and a.starts_at > now() - interval '1 day'
                   union all
                   select 'followup', f.id, p.full_name, p.phone, f.procedure, null, f.due_on
                   from recovery.planned_followups f join recovery.patients p on p.id = f.patient_id
                   where f.clinic_id = %(c)s and p.full_name ilike %(q)s
                     and f.completed_at is null and f.booked_appointment_id is null
                   order by 3""",
                {"c": clinic["id"], "q": f"%{search}%"},
            )
            matches = cursor.fetchall()

        if not matches:
            print(f"No upcoming appointment or planned follow-up found for \"{search}\".")
            return 1

        print("\nWhich one do you want to change?")
        labels = [
            f"{row['full_name']} ({masked(row['phone'] or '----')}): {row['what']}, "
            + (f"appointment {row['at'].astimezone(timezone):%a %d %b %Y at %H:%M}" if row["kind"] == "appointment"
               else f"due {row['due_on']:%d %b %Y}")
            for row in matches
        ]
        picked = matches[choose(labels)]

        with conn.cursor() as cursor:
            if picked["kind"] == "appointment":
                new_start = ask_new_datetime(timezone, picked["at"])
                cursor.execute(
                    """update recovery.appointments set starts_at = %(s)s, ends_at = %(e)s, status = 'scheduled', confirmed_at = null
                       where id = %(id)s""",
                    {"id": picked["id"], "s": new_start, "e": new_start + timedelta(hours=1)},
                )
                changed = f"appointment moved to {new_start:%a %d %b %Y at %H:%M}"
            else:
                new_due = ask_new_date(picked["due_on"])
                cursor.execute("update recovery.planned_followups set due_on = %(d)s where id = %(id)s",
                               {"id": picked["id"], "d": new_due})
                changed = f"now due {new_due:%d %b %Y}"

        print(f"\nSaved: {picked['full_name']}, {picked['what']}, {changed}.")
        cycle = run_clinic_cycle(conn, clinic["id"], datetime.now(UTC))
        print(f"The system re-checked the clinic: {cycle.plan.refreshed} waiting reminder(s) updated with the new date, "
              f"{cycle.scan.resolved} follow-up(s) no longer needed.")

        with conn.cursor() as cursor:
            cursor.execute(
                """select i.reason, i.status::text as status, i.resolution_note,
                          (select m.body from recovery.outreach_messages m
                            where m.recovery_item_id = i.id and m.status in ('queued', 'awaiting_approval')
                            order by m.created_at desc limit 1) as waiting_message
                   from recovery.recovery_items i
                   where (i.appointment_id = %(id)s or i.followup_id = %(id)s)
                   order by i.created_at desc limit 1""",
                {"id": picked["id"]},
            )
            item = cursor.fetchone()
        if item is None:
            print("Not on Today: the new date is not close or late enough to need a follow-up yet.")
        elif item["status"] in ("open", "in_progress"):
            print(f"On Today: {item['reason']}")
            if item["waiting_message"]:
                print(f"WhatsApp reminder now reads:\n  {item['waiting_message']}")
        else:
            print(f"Taken off Today: {item['resolution_note'] or item['status']}.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelled. Nothing was changed.")
        sys.exit(1)
