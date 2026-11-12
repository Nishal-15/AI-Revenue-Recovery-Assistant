"""Sends queued WhatsApp messages, applying every patient-protection rule first.

Order of checks for each message:
  0. stale reminder      -> cancelled if its worklist item was resolved meanwhile; deferred while snoozed
  1. opted out           -> cancelled
  2. quiet hours         -> deferred to when they end (stays queued)
  3. weekly limit        -> cancelled (automated messages only; staff can always reply)
  4. 24-hour window      -> failed for free text when the patient has not written in the last 24 h
  5. template values     -> failed if a placeholder cannot be filled
  6. send                -> sent, or failed with WhatsApp's reason
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.outreach.quiet_hours import next_send_time
from app.outreach.render import MissingVariableError, button_payload, render_body, resolve_params
from app.outreach.values import load_values
from app.whatsapp.sender import OutgoingMessage, SendError, TemplateMessage, WhatsAppSender

logger = logging.getLogger(__name__)

Row = dict[str, Any]

CUSTOMER_SERVICE_WINDOW = timedelta(hours=24)
BATCH_SIZE = 100


@dataclass
class DispatchResult:
    sent: int = 0
    deferred: int = 0
    cancelled: int = 0
    failed: int = 0


DUE_SQL = """
select id from recovery.outreach_messages
where direction = 'outbound' and status = 'queued' and coalesce(scheduled_for, created_at) <= %(now)s
  and (%(clinic_id)s::uuid is null or clinic_id = %(clinic_id)s::uuid)
order by coalesce(scheduled_for, created_at)
limit %(limit)s
"""

# Locks the row so two dispatchers never send the same message.
CLAIM_SQL = """
select m.id, m.clinic_id, m.recovery_item_id, m.contact_phone, m.body, m.template_id, m.template_params,
       m.automation_rule_id,
       c.timezone,
       coalesce(s.quiet_hours_start, time '21:00') as quiet_start,
       coalesce(s.quiet_hours_end, time '09:00') as quiet_end,
       coalesce(s.max_messages_per_week, 3) as max_per_week,
       s.whatsapp_phone_number_id,
       t.whatsapp_template_name, t.language, t.body as template_body, t.variables, t.buttons,
       i.status::text as item_status, i.snoozed_until as item_snoozed_until
from recovery.outreach_messages m
join recovery.clinics c on c.id = m.clinic_id
left join recovery.clinic_settings s on s.clinic_id = m.clinic_id
left join recovery.message_templates t on t.id = m.template_id
left join recovery.recovery_items i on i.id = m.recovery_item_id
where m.id = %(id)s and m.status = 'queued'
for update of m skip locked
"""

OPTED_OUT_SQL = """
select 1 from recovery.consents
where clinic_id = %(clinic_id)s and channel = 'whatsapp' and status = 'opted_out'
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
"""

SENT_THIS_WEEK_SQL = """
select count(*) as n from recovery.outreach_messages
where clinic_id = %(clinic_id)s and direction = 'outbound'
  and status in ('sent', 'delivered', 'read', 'replied') and sent_at > %(since)s
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
"""

LAST_INBOUND_SQL = """
select max(created_at) as at from recovery.outreach_messages
where clinic_id = %(clinic_id)s and direction = 'inbound'
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
"""

# A reply typed or chosen by staff deals with the patient's waiting messages. Automated reminders do
# not, so a question never disappears from the inbox just because a scheduled reminder went out.
MARK_INBOUND_HANDLED_SQL = """
update recovery.outreach_messages set handled_at = %(now)s
where clinic_id = %(clinic_id)s and direction = 'inbound' and handled_at is null
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
"""

# Any message to an unanswered enquirer counts as the clinic's first response.
MARK_ENQUIRY_CONTACTED_SQL = """
update recovery.enquiries
set status = 'contacted', first_response_at = coalesce(first_response_at, %(now)s)
where clinic_id = %(clinic_id)s and status = 'new'
  and recovery.phone_digits(contact_phone) = recovery.phone_digits(%(phone)s)
"""


def _scalar(conn: Connection[Row], sql: str, params: dict[str, Any]) -> Any:
    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    return None if row is None else next(iter(row.values()))


def _update(conn: Connection[Row], message_id: UUID, **fields: Any) -> None:
    # Column names come from this module's own keyword arguments, never from input.
    assignments = ", ".join(f"{name} = %({name})s" for name in fields)
    with conn.cursor() as cursor:
        cursor.execute(
            f"update recovery.outreach_messages set {assignments} where id = %(id)s",
            {"id": message_id, **fields},
        )


def _build_message(conn: Connection[Row], row: Row) -> tuple[OutgoingMessage, str, list[str]]:
    """Returns the outgoing message plus the body and params to store. Raises MissingVariableError."""
    to_digits = "".join(ch for ch in row["contact_phone"] if ch.isdigit())
    if row["template_id"] is None:
        text = row["body"] or ""
        return OutgoingMessage(to_digits=to_digits, phone_number_id=row["whatsapp_phone_number_id"], text=text), text, []

    params: list[str] = list(row["template_params"] or [])
    if not params and row["variables"]:
        values = load_values(conn, clinic_id=row["clinic_id"], item_id=row["recovery_item_id"], phone=row["contact_phone"])
        params = resolve_params(row["variables"], values)
    template = TemplateMessage(
        name=row["whatsapp_template_name"],
        language=row["language"],
        params=params,
        button_payloads=[button_payload(label, str(row["id"])) for label in row["buttons"] or []],
    )
    message = OutgoingMessage(to_digits=to_digits, phone_number_id=row["whatsapp_phone_number_id"], template=template)
    return message, render_body(row["template_body"], params), params


def _dispatch_one(conn: Connection[Row], sender: WhatsAppSender, row: Row, now: datetime) -> str:
    """Processes one claimed message and returns the outcome name."""
    target = {"clinic_id": row["clinic_id"], "phone": row["contact_phone"]}

    # An automated reminder only makes sense while its leak is still open: a patient who confirmed by
    # phone must not then get "please confirm".
    if row["automation_rule_id"] is not None:
        if row["item_status"] not in ("open", "in_progress"):
            _update(conn, row["id"], status="cancelled", error="No longer needed: the worklist item was resolved")
            return "cancelled"
        if row["item_snoozed_until"] is not None and row["item_snoozed_until"] > now:
            _update(conn, row["id"], scheduled_for=row["item_snoozed_until"])
            return "deferred"

    if _scalar(conn, OPTED_OUT_SQL, target):
        _update(conn, row["id"], status="cancelled", error="Patient opted out of WhatsApp")
        return "cancelled"

    local_now = now.astimezone(ZoneInfo(row["timezone"]))
    send_at = next_send_time(local_now, row["quiet_start"], row["quiet_end"])
    if send_at > local_now:
        _update(conn, row["id"], scheduled_for=send_at)
        return "deferred"

    if row["automation_rule_id"] is not None:
        sent_this_week = _scalar(conn, SENT_THIS_WEEK_SQL, {**target, "since": now - timedelta(days=7)})
        if sent_this_week >= row["max_per_week"]:
            _update(conn, row["id"], status="cancelled", error=f"Weekly limit of {row['max_per_week']} messages reached")
            return "cancelled"

    if row["template_id"] is None:
        last_inbound = _scalar(conn, LAST_INBOUND_SQL, target)
        if last_inbound is None or now - last_inbound > CUSTOMER_SERVICE_WINDOW:
            _update(
                conn, row["id"], status="failed",
                error="The patient has not written in the last 24 hours, so WhatsApp only allows a template here",
            )
            return "failed"

    try:
        message, body, params = _build_message(conn, row)
        provider_id = sender.send(message)
    except (MissingVariableError, SendError) as error:
        _update(conn, row["id"], status="failed", error=str(error))
        return "failed"

    _update(
        conn, row["id"], status="sent", sent_at=now, provider_message_id=provider_id, body=body,
        template_params=Jsonb(params), error=None,
    )
    with conn.cursor() as cursor:
        cursor.execute(MARK_ENQUIRY_CONTACTED_SQL, {**target, "now": now})
        if row["automation_rule_id"] is None:
            cursor.execute(MARK_INBOUND_HANDLED_SQL, {**target, "now": now})
    return "sent"


def dispatch_due(
    conn: Connection[Row], sender: WhatsAppSender, now: datetime, *, clinic_id: UUID | None = None, limit: int = BATCH_SIZE
) -> DispatchResult:
    """Sends every due message, or only one clinic's when clinic_id is given."""
    result = DispatchResult()
    with conn.cursor() as cursor:
        cursor.execute(DUE_SQL, {"now": now, "limit": limit, "clinic_id": clinic_id})
        ids = [row["id"] for row in cursor.fetchall()]

    for message_id in ids:
        with conn.transaction(), conn.cursor() as cursor:
            cursor.execute(CLAIM_SQL, {"id": message_id})
            row = cursor.fetchone()
            if row is None:
                continue  # sent by another worker, or no longer queued
            outcome = _dispatch_one(conn, sender, row, now)
        setattr(result, outcome, getattr(result, outcome) + 1)
        if outcome == "failed":
            logger.warning("WhatsApp message %s failed", message_id)
    return result
