"""Gemini assistance job: classify new enquiries and read patients' free-text replies.

What the AI is allowed to change on its own, and when:
  confirm  (confidence >= 0.85, reply linked to an appointment reminder) -> appointment confirmed
  opt_out  (confidence >= 0.90)                                          -> patient opted out
  reschedule / cancel (confidence >= 0.70)                               -> item marked in progress
Everything else is a label and a drafted reply that staff can use, edit or ignore.
Each enquiry and message is analysed once; a failed call is retried on the next run.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import Connection
from pydantic import BaseModel

from app.ai.enquiries import EnquiryClassification, classify_enquiry
from app.ai.llm import AiUnavailableError, StructuredLlm
from app.ai.replies import ReplyAnalysis, ReplyContext, analyze_reply
from app.outreach.inbound import record_consent
from app.outreach.render import first_name

logger = logging.getLogger(__name__)

Row = dict[str, Any]

CONFIRM_THRESHOLD = 0.85
OPT_OUT_THRESHOLD = 0.90
FOLLOW_UP_THRESHOLD = 0.70
# Gemini calls in flight at once; keeps bursts well inside rate limits.
MAX_CONCURRENT_CALLS = 4
# Older items are left alone rather than back-filled, so turning AI on never causes a cost spike.
ENQUIRY_LOOKBACK = timedelta(days=7)
MESSAGE_LOOKBACK = timedelta(days=2)


@dataclass
class AssistResult:
    enquiries_classified: int = 0
    replies_analysed: int = 0
    auto_confirmed: int = 0
    auto_opted_out: int = 0
    failed: int = 0


ENQUIRIES_SQL = """
select id, message from recovery.enquiries
where ai_classified_at is null and message is not null and received_at > %(since)s
  and (%(clinic_id)s::uuid is null or clinic_id = %(clinic_id)s::uuid)
order by received_at
limit %(limit)s
"""

# Only messages still waiting for staff: button taps and STOP are already handled by the webhook.
MESSAGES_SQL = """
select m.id, m.clinic_id, m.contact_phone, m.body, m.recovery_item_id, c.name as clinic_name,
       coalesce(
         (select p.full_name from recovery.patients p
           where p.clinic_id = m.clinic_id
             and recovery.phone_digits(p.phone) = recovery.phone_digits(m.contact_phone)
           order by p.created_at limit 1),
         (select e.contact_name from recovery.enquiries e
           where e.clinic_id = m.clinic_id
             and recovery.phone_digits(e.contact_phone) = recovery.phone_digits(m.contact_phone)
           order by e.received_at desc limit 1)
       ) as contact_name,
       (select o.body from recovery.outreach_messages o
         where o.clinic_id = m.clinic_id and o.direction = 'outbound'
           and o.status in ('sent', 'delivered', 'read', 'replied') and o.created_at < m.created_at
           and recovery.phone_digits(o.contact_phone) = recovery.phone_digits(m.contact_phone)
         order by o.created_at desc limit 1) as our_last_message
from recovery.outreach_messages m
join recovery.clinics c on c.id = m.clinic_id
where m.direction = 'inbound' and m.ai_processed_at is null and m.handled_at is null
  and m.body is not null and m.created_at > %(since)s
  and (%(clinic_id)s::uuid is null or m.clinic_id = %(clinic_id)s::uuid)
order by m.created_at
limit %(limit)s
"""


async def _gather_limited[T: BaseModel](calls: list[Any]) -> list[T | Exception]:
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_CALLS)

    async def limited(call: Any) -> T:
        async with semaphore:
            return await call

    return await asyncio.gather(*(limited(call) for call in calls), return_exceptions=True)


def run_ai_assist(
    conn: Connection[Row], llm: StructuredLlm, now: datetime, *, limit: int = 20, clinic_id: UUID | None = None
) -> AssistResult:
    result = AssistResult()
    with conn.cursor() as cursor:
        cursor.execute(ENQUIRIES_SQL, {"since": now - ENQUIRY_LOOKBACK, "limit": limit, "clinic_id": clinic_id})
        enquiries = cursor.fetchall()
        cursor.execute(MESSAGES_SQL, {"since": now - MESSAGE_LOOKBACK, "limit": limit, "clinic_id": clinic_id})
        messages = cursor.fetchall()
    if not enquiries and not messages:
        return result

    async def analyse_all() -> tuple[list[EnquiryClassification | Exception], list[ReplyAnalysis | Exception]]:
        classified = await _gather_limited([classify_enquiry(llm, row["message"]) for row in enquiries])
        analysed = await _gather_limited(
            [
                analyze_reply(
                    llm,
                    ReplyContext(
                        clinic_name=row["clinic_name"],
                        patient_first_name=first_name(row["contact_name"]),
                        our_last_message=row["our_last_message"],
                        patient_message=row["body"],
                    ),
                )
                for row in messages
            ]
        )
        return classified, analysed

    # The DB layer is synchronous (see app/db.py); the Gemini calls run concurrently in one event loop.
    classified, analysed = asyncio.run(analyse_all())

    for row, outcome in zip(enquiries, classified, strict=True):
        if isinstance(outcome, Exception):
            _log_failure("enquiry", row["id"], outcome)
            result.failed += 1
            continue
        _save_enquiry(conn, row["id"], outcome, now)
        result.enquiries_classified += 1

    for row, outcome in zip(messages, analysed, strict=True):
        if isinstance(outcome, Exception):
            _log_failure("message", row["id"], outcome)
            result.failed += 1
            continue
        with conn.transaction():
            _save_analysis(conn, row["id"], outcome, now)
            action = _act_on_reply(conn, row, outcome, now)
        result.replies_analysed += 1
        if action == "confirmed":
            result.auto_confirmed += 1
        elif action == "opted_out":
            result.auto_opted_out += 1
    return result


def _log_failure(kind: str, row_id: UUID, error: Exception) -> None:
    if isinstance(error, AiUnavailableError):
        logger.warning("Gemini could not analyse %s %s: %s", kind, row_id, error)
    else:
        logger.error("unexpected error analysing %s %s", kind, row_id, exc_info=error)


def _save_enquiry(conn: Connection[Row], enquiry_id: UUID, outcome: EnquiryClassification, now: datetime) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            update recovery.enquiries
            set interest = %(interest)s, urgency = %(urgency)s, ai_summary = %(summary)s, ai_classified_at = %(now)s
            where id = %(id)s
            """,
            {"id": enquiry_id, "interest": outcome.interest, "urgency": outcome.urgency,
             "summary": outcome.summary, "now": now},
        )


def _save_analysis(conn: Connection[Row], message_id: UUID, outcome: ReplyAnalysis, now: datetime) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            update recovery.outreach_messages
            set ai_intent = %(intent)s, ai_confidence = %(confidence)s, ai_summary = %(summary)s,
                ai_suggested_reply = %(reply)s, ai_processed_at = %(now)s
            where id = %(id)s
            """,
            {"id": message_id, "intent": outcome.intent, "confidence": round(outcome.confidence, 2),
             "summary": _summary_with_time(outcome), "reply": outcome.suggested_reply, "now": now},
        )


def _summary_with_time(outcome: ReplyAnalysis) -> str:
    if outcome.preferred_time and outcome.preferred_time.lower() not in outcome.summary.lower():
        return f"{outcome.summary} ({outcome.preferred_time})"
    return outcome.summary


def _act_on_reply(conn: Connection[Row], row: Row, outcome: ReplyAnalysis, now: datetime) -> str | None:
    if outcome.intent == "opt_out" and outcome.confidence >= OPT_OUT_THRESHOLD:
        record_consent(conn, row["clinic_id"], row["contact_phone"], opted_out=True, now=now)
        _mark_handled(conn, row["id"], now)
        return "opted_out"

    item = _linked_item(conn, row["recovery_item_id"])
    if item is None:
        return None

    if outcome.intent == "confirm" and outcome.confidence >= CONFIRM_THRESHOLD and item["appointment_id"]:
        with conn.cursor() as cursor:
            cursor.execute(
                "update recovery.appointments set status = 'confirmed', confirmed_at = %(now)s "
                "where id = %(id)s and status = 'scheduled'",
                {"id": item["appointment_id"], "now": now},
            )
            cursor.execute(
                "update recovery.recovery_items set status = 'recovered', "
                "resolution_note = 'Confirmed on WhatsApp (reply read by AI)' "
                "where id = %(id)s and status in ('open', 'in_progress')",
                {"id": item["id"]},
            )
        _mark_handled(conn, row["id"], now)
        return "confirmed"

    if outcome.intent in ("reschedule", "cancel") and outcome.confidence >= FOLLOW_UP_THRESHOLD:
        with conn.cursor() as cursor:
            cursor.execute(
                "update recovery.recovery_items set status = 'in_progress' where id = %(id)s and status = 'open'",
                {"id": item["id"]},
            )
        return "flagged"
    return None


def _linked_item(conn: Connection[Row], item_id: UUID | None) -> Row | None:
    if item_id is None:
        return None
    with conn.cursor() as cursor:
        cursor.execute(
            "select id, appointment_id from recovery.recovery_items "
            "where id = %(id)s and status in ('open', 'in_progress')",
            {"id": item_id},
        )
        return cursor.fetchone()


def _mark_handled(conn: Connection[Row], message_id: UUID, now: datetime) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            "update recovery.outreach_messages set handled_at = %(now)s where id = %(id)s",
            {"id": message_id, "now": now},
        )
