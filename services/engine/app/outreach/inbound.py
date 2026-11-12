"""Handles what WhatsApp tells us: patient replies, button taps, opt-outs and delivery receipts.

Button taps close the loop without staff:
  Confirm             -> appointment confirmed, item recovered
  Reschedule/Call me  -> a callback task for the front desk, item in progress
  Book                -> a booking task for the front desk, item in progress
A message from an unknown number becomes a new enquiry, so it shows up as a lead.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import Connection

from app.outreach.render import parse_button_payload
from app.whatsapp.webhook import InboundMessage, StatusUpdate, WebhookEvent

logger = logging.getLogger(__name__)

Row = dict[str, Any]

STOP_WORDS = {"stop", "stop all", "unsubscribe", "opt out", "optout", "cancel messages"}
START_WORDS = {"start", "unstop", "subscribe"}

TASK_TITLES = {
    "reschedule": "Patient asked to reschedule (WhatsApp)",
    "call_me": "Patient asked for a call back (WhatsApp)",
    "book": "Patient wants to book (WhatsApp)",
}
# Time the front desk has to act on a button tap before it shows as an overdue follow-up.
TASK_DUE_IN = timedelta(hours=2)
REPLY_LINK_WINDOW = timedelta(days=7)
KNOWN_CONTACT_WINDOW = timedelta(days=30)

DELIVERY_RANK = {"queued": 0, "awaiting_approval": 0, "sent": 1, "delivered": 2, "read": 3, "replied": 4}


@dataclass
class InboundResult:
    messages: int = 0
    statuses: int = 0
    ignored: int = 0


def _one(conn: Connection[Row], sql: str, params: dict[str, Any]) -> Row | None:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()


def _run(conn: Connection[Row], sql: str, params: dict[str, Any]) -> None:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)


def _clinic_for(conn: Connection[Row], phone_number_id: str) -> UUID | None:
    row = _one(
        conn,
        "select clinic_id from recovery.clinic_settings where whatsapp_phone_number_id = %(id)s",
        {"id": phone_number_id},
    )
    return None if row is None else row["clinic_id"]


def handle_events(conn: Connection[Row], events: list[WebhookEvent], now: datetime) -> InboundResult:
    result = InboundResult()
    clinics: dict[str, UUID | None] = {}
    for event in events:
        if event.phone_number_id not in clinics:
            clinics[event.phone_number_id] = _clinic_for(conn, event.phone_number_id)
        clinic_id = clinics[event.phone_number_id]
        if clinic_id is None:
            logger.warning("webhook event for unknown WhatsApp number %s", event.phone_number_id)
            result.ignored += 1
            continue
        with conn.transaction():
            if isinstance(event, StatusUpdate):
                _apply_status(conn, clinic_id, event)
                result.statuses += 1
            elif _handle_message(conn, clinic_id, event, now):
                result.messages += 1
            else:
                result.ignored += 1
    return result


def _apply_status(conn: Connection[Row], clinic_id: UUID, event: StatusUpdate) -> None:
    """Statuses can arrive out of order; never move a message backwards (read -> delivered)."""
    row = _one(
        conn,
        "select id, status::text as status from recovery.outreach_messages "
        "where clinic_id = %(clinic_id)s and provider_message_id = %(pid)s for update",
        {"clinic_id": clinic_id, "pid": event.provider_message_id},
    )
    if row is None:
        return
    if event.status == "failed":
        if row["status"] != "replied":
            _run(conn, "update recovery.outreach_messages set status = 'failed', error = %(error)s where id = %(id)s",
                 {"id": row["id"], "error": event.error or "WhatsApp could not deliver the message"})
        return
    timestamp_column = {"sent": "sent_at", "delivered": "delivered_at", "read": "read_at"}[event.status]
    _run(
        conn,
        f"update recovery.outreach_messages set {timestamp_column} = coalesce({timestamp_column}, %(at)s) "
        "where id = %(id)s",
        {"id": row["id"], "at": event.at},
    )
    if DELIVERY_RANK[event.status] > DELIVERY_RANK.get(row["status"], 0) and row["status"] != "failed":
        _run(conn, "update recovery.outreach_messages set status = %(status)s where id = %(id)s",
             {"id": row["id"], "status": event.status})


INSERT_INBOUND_SQL = """
insert into recovery.outreach_messages
  (clinic_id, direction, channel, contact_phone, body, status, provider_message_id, created_at)
values (%(clinic_id)s, 'inbound', 'whatsapp', %(phone)s, %(body)s, 'delivered', %(pid)s, %(at)s)
on conflict (provider_message_id) do nothing
returning id
"""

REPLIED_TO_BY_ID_SQL = """
select id, recovery_item_id, patient_id, enquiry_id from recovery.outreach_messages
where id = %(id)s and clinic_id = %(clinic_id)s and direction = 'outbound'
"""

REPLIED_TO_LATEST_SQL = """
select id, recovery_item_id, patient_id, enquiry_id from recovery.outreach_messages
where clinic_id = %(clinic_id)s and direction = 'outbound' and status in ('sent', 'delivered', 'read', 'replied')
  and sent_at > %(since)s
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
order by sent_at desc limit 1
"""


def _replied_to(conn: Connection[Row], clinic_id: UUID, event: InboundMessage, phone: str, now: datetime) -> Row | None:
    parsed = parse_button_payload(event.button_payload)
    if parsed is not None:
        try:
            message_id = UUID(parsed[1])
        except ValueError:
            message_id = None
        if message_id is not None:
            row = _one(conn, REPLIED_TO_BY_ID_SQL, {"id": message_id, "clinic_id": clinic_id})
            if row is not None:
                return row
    return _one(conn, REPLIED_TO_LATEST_SQL, {"clinic_id": clinic_id, "phone": phone, "since": now - REPLY_LINK_WINDOW})


def _handle_message(conn: Connection[Row], clinic_id: UUID, event: InboundMessage, now: datetime) -> bool:
    phone = f"+{event.from_digits}"
    inserted = _one(
        conn,
        INSERT_INBOUND_SQL,
        {"clinic_id": clinic_id, "phone": phone, "body": event.text, "pid": event.provider_message_id, "at": event.received_at},
    )
    if inserted is None:
        return False  # WhatsApp retried a message we already have
    inbound_id = inserted["id"]

    original = _replied_to(conn, clinic_id, event, phone, now)
    if original is not None:
        _run(conn, "update recovery.outreach_messages set status = 'replied' where id = %(id)s "
                   "and status in ('sent', 'delivered', 'read')", {"id": original["id"]})
        _run(conn, "update recovery.outreach_messages set recovery_item_id = %(item)s, patient_id = %(patient)s, "
                   "enquiry_id = %(enquiry)s where id = %(id)s",
             {"id": inbound_id, "item": original["recovery_item_id"], "patient": original["patient_id"],
              "enquiry": original["enquiry_id"]})

    keyword = (event.text or "").strip().lower()
    if event.button_payload is None and keyword in STOP_WORDS | START_WORDS:
        record_consent(conn, clinic_id, phone, opted_out=keyword in STOP_WORDS, now=now)
        _mark_handled(conn, inbound_id, now)
        return True

    parsed = parse_button_payload(event.button_payload)
    if parsed is not None and original is not None and original["recovery_item_id"] is not None:
        if _apply_button(conn, clinic_id, parsed[0], original, now):
            _mark_handled(conn, inbound_id, now)
        return True

    if original is None:
        _create_enquiry_if_new(conn, clinic_id, event, phone, inbound_id)
    return True


def _mark_handled(conn: Connection[Row], message_id: UUID, now: datetime) -> None:
    _run(conn, "update recovery.outreach_messages set handled_at = %(now)s where id = %(id)s", {"id": message_id, "now": now})


def record_consent(conn: Connection[Row], clinic_id: UUID, phone: str, *, opted_out: bool, now: datetime) -> None:
    status = "opted_out" if opted_out else "opted_in"
    _run(
        conn,
        """
        insert into recovery.consents (clinic_id, contact_phone, channel, status, source, recorded_at)
        values (%(clinic_id)s, %(phone)s, 'whatsapp', %(status)s, %(source)s, %(now)s)
        on conflict (clinic_id, contact_phone, channel)
        do update set status = excluded.status, source = excluded.source, recorded_at = excluded.recorded_at
        """,
        {"clinic_id": clinic_id, "phone": phone, "status": status, "now": now,
         "source": "whatsapp_reply_stop" if opted_out else "whatsapp_reply_start"},
    )
    if opted_out:
        _run(
            conn,
            """
            update recovery.outreach_messages set status = 'cancelled', error = 'Patient opted out of WhatsApp'
            where clinic_id = %(clinic_id)s and direction = 'outbound' and status in ('queued', 'awaiting_approval')
              and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
            """,
            {"clinic_id": clinic_id, "phone": phone},
        )


def _apply_button(conn: Connection[Row], clinic_id: UUID, action: str, original: Row, now: datetime) -> bool:
    item = _one(
        conn,
        "select id, appointment_id, patient_id, enquiry_id, status::text as status "
        "from recovery.recovery_items where id = %(id)s",
        {"id": original["recovery_item_id"]},
    )
    if item is None:
        return False

    if action == "confirm":
        if item["appointment_id"] is None:
            return False
        _run(conn, "update recovery.appointments set status = 'confirmed', confirmed_at = %(now)s "
                   "where id = %(id)s and status = 'scheduled'", {"id": item["appointment_id"], "now": now})
        _run(conn, "update recovery.recovery_items set status = 'recovered', resolution_note = 'Confirmed on WhatsApp' "
                   "where id = %(id)s and status in ('open', 'in_progress')", {"id": item["id"]})
        return True

    title = TASK_TITLES.get(action)
    if title is None:
        return False
    _run(
        conn,
        """
        insert into recovery.staff_tasks (clinic_id, patient_id, enquiry_id, kind, title, due_at)
        values (%(clinic_id)s, %(patient_id)s, %(enquiry_id)s, 'callback', %(title)s, %(due_at)s)
        """,
        {"clinic_id": clinic_id, "patient_id": item["patient_id"], "enquiry_id": item["enquiry_id"],
         "title": title, "due_at": now + TASK_DUE_IN},
    )
    _run(conn, "update recovery.recovery_items set status = 'in_progress' where id = %(id)s and status = 'open'",
         {"id": item["id"]})
    return True


def _create_enquiry_if_new(
    conn: Connection[Row], clinic_id: UUID, event: InboundMessage, phone: str, inbound_id: UUID
) -> None:
    known = _one(
        conn,
        """
        select 1 from recovery.patients
         where clinic_id = %(clinic_id)s and recovery.phone_digits(phone) = recovery.phone_digits(%(phone)s)
        union all
        select 1 from recovery.enquiries
         where clinic_id = %(clinic_id)s and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
           and received_at > %(since)s
        limit 1
        """,
        {"clinic_id": clinic_id, "phone": phone, "since": event.received_at - KNOWN_CONTACT_WINDOW},
    )
    if known is not None:
        return
    enquiry = _one(
        conn,
        """
        insert into recovery.enquiries (clinic_id, contact_name, contact_phone, source, message, received_at)
        values (%(clinic_id)s, %(name)s, %(phone)s, 'whatsapp', %(message)s, %(at)s)
        returning id
        """,
        {"clinic_id": clinic_id, "name": event.profile_name, "phone": phone, "message": event.text, "at": event.received_at},
    )
    if enquiry is not None:
        _run(conn, "update recovery.outreach_messages set enquiry_id = %(enquiry)s where id = %(id)s",
             {"enquiry": enquiry["id"], "id": inbound_id})
