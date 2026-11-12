"""Booking attribution: which appointments exist because we reached out.

A "touch" is an outbound WhatsApp message that was sent, or a staff member starting or recovering a
worklist item (from the audit log). Two rules credit a booking:

  new_booking        a new appointment created within the clinic's attribution window after a touch
                     for that patient (matched by patient record or phone number)
  saved_appointment  an at-risk (unconfirmed) appointment that was confirmed or attended after a
                     touch on its worklist item

A credited appointment that is later cancelled or marked no-show is removed again, so recovered
revenue never counts bookings that did not happen. Marking an item "Recovered" without a booking
adds no revenue.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import Connection

Row = dict[str, Any]

# New bookings are only looked for this far back, which bounds the query on large clinics.
NEW_BOOKING_LOOKBACK = timedelta(days=120)


@dataclass
class AttributionResult:
    new_bookings: int = 0
    saved_appointments: int = 0
    reversed: int = 0


TOUCHES_CTE = """
touches as (
  select m.recovery_item_id as item_id, m.contact_phone as phone, m.patient_id, m.sent_at as touched_at,
         m.id as message_id
  from recovery.outreach_messages m
  where m.clinic_id = %(clinic_id)s and m.direction = 'outbound' and m.sent_at is not null
  union all
  select i.id, i.contact_phone, i.patient_id, a.created_at, null::uuid
  from recovery.audit_log a
  join recovery.recovery_items i on i.id = a.entity_id
  where a.clinic_id = %(clinic_id)s and a.entity = 'recovery_items' and a.actor_id is not null
    and a.details ->> 'to' in ('in_progress', 'recovered')
)
"""

WINDOW_SQL = """
select coalesce((select attribution_window_days from recovery.clinic_settings where clinic_id = %(clinic_id)s), 14) as days
"""

SAVED_APPOINTMENTS_SQL = f"""
with {TOUCHES_CTE}
insert into recovery.recovered_bookings
  (clinic_id, appointment_id, recovery_item_id, attributed_message_id, patient_id, value, booked_at, rule, leak_type)
select i.clinic_id, a.id, i.id, t.message_id, a.patient_id,
       case when a.estimated_value > 0 then a.estimated_value else i.estimated_value end,
       coalesce(a.confirmed_at, i.resolved_at, %(now)s), 'saved_appointment', i.leak_type
from recovery.recovery_items i
join recovery.appointments a on a.id = i.appointment_id
join lateral (
  select t.message_id from touches t
  where t.item_id = i.id and t.touched_at <= coalesce(a.confirmed_at, i.resolved_at, %(now)s)
  order by t.message_id is null, t.touched_at desc
  limit 1
) t on true
where i.clinic_id = %(clinic_id)s and i.leak_type = 'unconfirmed_appointment' and i.status = 'recovered'
  and a.status in ('confirmed', 'completed')
on conflict (appointment_id) do nothing
returning id
"""

# Credit goes to the most recent lead-type touch before the booking; a message beats a staff action at the same moment.
NEW_BOOKINGS_SQL = f"""
with {TOUCHES_CTE},
candidates as (
  select a.id as appointment_id, a.patient_id, a.created_at,
         case when a.estimated_value > 0 then a.estimated_value else coalesce(i.estimated_value, 0) end as value,
         t.item_id, t.message_id, i.leak_type,
         row_number() over (
           partition by a.id
           -- A new booking answers a lead (enquiry, recall, callback) before an appointment reminder.
           order by coalesce(i.leak_type = 'unconfirmed_appointment', false), t.touched_at desc, t.message_id is null
         ) as rank
  from recovery.appointments a
  join recovery.patients p on p.id = a.patient_id
  join touches t
    on (t.patient_id = a.patient_id
        or (recovery.phone_digits(p.phone) <> '' and recovery.phone_digits(t.phone) = recovery.phone_digits(p.phone)))
   and t.touched_at < a.created_at
   and a.created_at <= t.touched_at + make_interval(days => %(window_days)s)
  left join recovery.recovery_items i on i.id = t.item_id
  where a.clinic_id = %(clinic_id)s
    and a.created_at > %(since)s and a.created_at <= %(now)s
    and a.status not in ('cancelled', 'no_show')
    and not exists (select 1 from recovery.recovered_bookings rb where rb.appointment_id = a.id)
    -- the reminded appointment itself is a saved appointment, never a new booking
    and (i.appointment_id is null or i.appointment_id <> a.id)
)
insert into recovery.recovered_bookings
  (clinic_id, appointment_id, recovery_item_id, attributed_message_id, patient_id, value, booked_at, rule, leak_type)
select %(clinic_id)s, appointment_id, item_id, message_id, patient_id, value, created_at, 'new_booking', leak_type
from candidates
where rank = 1
on conflict (appointment_id) do nothing
returning id, recovery_item_id, appointment_id
"""

# The booking closes the lead it came from.
CLOSE_ITEM_SQL = """
update recovery.recovery_items
set status = 'recovered', resolution_note = 'Booked after outreach'
where id = %(item_id)s and status in ('open', 'in_progress')
returning enquiry_id
"""

CLOSE_ENQUIRY_SQL = """
update recovery.enquiries
set status = 'booked', booked_appointment_id = coalesce(booked_appointment_id, %(appointment_id)s)
where id = %(enquiry_id)s and status <> 'booked'
"""

REVERSE_SQL = """
delete from recovery.recovered_bookings rb
using recovery.appointments a
where a.id = rb.appointment_id and rb.clinic_id = %(clinic_id)s and a.status in ('cancelled', 'no_show')
returning rb.id
"""


def attribute_bookings(conn: Connection[Row], clinic_id: UUID, now: datetime) -> AttributionResult:
    result = AttributionResult()
    with conn.transaction(), conn.cursor() as cursor:
        cursor.execute(WINDOW_SQL, {"clinic_id": clinic_id})
        row = cursor.fetchone()
        window_days = int(row["days"]) if row else 14
        params = {"clinic_id": clinic_id, "now": now, "since": now - NEW_BOOKING_LOOKBACK, "window_days": window_days}

        cursor.execute(REVERSE_SQL, params)
        result.reversed = len(cursor.fetchall())

        cursor.execute(SAVED_APPOINTMENTS_SQL, params)
        result.saved_appointments = len(cursor.fetchall())

        cursor.execute(NEW_BOOKINGS_SQL, params)
        credited = cursor.fetchall()
        result.new_bookings = len(credited)

        for booking in credited:
            if booking["recovery_item_id"] is None:
                continue
            cursor.execute(CLOSE_ITEM_SQL, {"item_id": booking["recovery_item_id"]})
            closed = cursor.fetchone()
            if closed and closed["enquiry_id"]:
                cursor.execute(
                    CLOSE_ENQUIRY_SQL, {"enquiry_id": closed["enquiry_id"], "appointment_id": booking["appointment_id"]}
                )
    return result
