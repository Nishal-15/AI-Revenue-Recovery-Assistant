"""Gemini assistance against a real Postgres, with a fake model so results are deterministic.

Needs TEST_DATABASE_URL (see test_detection_integration.py).
"""

import os
from datetime import timedelta
from typing import Any

import pytest
from pydantic import BaseModel

from app.ai.enquiries import EnquiryClassification
from app.ai.llm import AiUnavailableError
from app.ai.assist import run_ai_assist
from app.ai.replies import ReplyAnalysis
from app.detection.scan import scan_clinic
from tests.test_outreach_integration import NOW, Clinic, FakeSender, conn, dispatch_for, one  # noqa: F401 (conn is a fixture)

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")


class FakeLlm:
    """Returns a fixed answer per schema, or raises, and records every prompt it was given."""

    def __init__(self, *, enquiry: EnquiryClassification | None = None, reply: ReplyAnalysis | Exception | None = None):
        self.answers: dict[type[BaseModel], Any] = {EnquiryClassification: enquiry, ReplyAnalysis: reply}
        self.prompts: list[str] = []

    async def generate(self, *, system, prompt, schema):
        self.prompts.append(prompt)
        answer = self.answers.get(schema)
        if isinstance(answer, Exception):
            raise answer
        if answer is None:
            raise AiUnavailableError("no fake answer configured")
        return answer


def reply(intent: str, confidence: float, **extra: Any) -> ReplyAnalysis:
    return ReplyAnalysis(
        intent=intent, confidence=confidence, summary=extra.pop("summary", "Patient replied"),
        suggested_reply=extra.pop("suggested_reply", "Thank you! See you soon."), **extra,
    )


def reminded_clinic(conn) -> Clinic:
    """A clinic whose patient has already received the appointment confirmation template."""
    clinic = Clinic(conn)
    clinic.detect_and_plan()
    dispatch_for(clinic, FakeSender(), NOW)
    return clinic


def inbound(conn, clinic: Clinic) -> dict[str, Any]:
    return one(conn, "select *, ai_intent from recovery.outreach_messages "
                     "where clinic_id = %(c)s and direction = 'inbound'", c=clinic.id)


def test_clear_confirmation_confirms_the_appointment(conn):
    clinic = reminded_clinic(conn)
    clinic.reply(text="Yes, I will be there 👍", at=NOW + timedelta(minutes=5))
    llm = FakeLlm(reply=reply("confirm", 0.95))

    result = run_ai_assist(conn, llm, NOW + timedelta(minutes=6), clinic_id=clinic.id)

    assert (result.replies_analysed, result.auto_confirmed) == (1, 1)
    appointment = one(conn, "select status::text as status from recovery.appointments where id = %(id)s", id=clinic.appointment)
    assert appointment["status"] == "confirmed"
    item = clinic.item()
    assert (item["status_text"], item["resolution_note"]) == ("recovered", "Confirmed on WhatsApp (reply read by AI)")
    message = inbound(conn, clinic)
    assert message["handled_at"] is not None and message["ai_intent"] == "confirm"
    # The model saw our reminder for context, and the patient's text inside clear delimiters.
    assert "Implant consultation" in llm.prompts[0] and "<message>\nYes, I will be there 👍\n</message>" in llm.prompts[0]


def test_unsure_confirmation_is_left_for_staff_with_a_draft(conn):
    clinic = reminded_clinic(conn)
    clinic.reply(text="ok", at=NOW + timedelta(minutes=5))

    result = run_ai_assist(conn, FakeLlm(reply=reply("confirm", 0.6, suggested_reply="Great, see you tomorrow!")),
                           NOW + timedelta(minutes=6), clinic_id=clinic.id)

    assert (result.replies_analysed, result.auto_confirmed) == (1, 0)
    appointment = one(conn, "select status::text as status from recovery.appointments where id = %(id)s", id=clinic.appointment)
    assert appointment["status"] == "scheduled"
    message = inbound(conn, clinic)
    assert message["handled_at"] is None
    assert message["ai_suggested_reply"] == "Great, see you tomorrow!"
    assert float(message["ai_confidence"]) == 0.6


def test_reschedule_request_flags_item_and_keeps_preferred_time(conn):
    clinic = reminded_clinic(conn)
    clinic.reply(text="Can we do Thursday evening instead?", at=NOW + timedelta(minutes=5))

    run_ai_assist(conn, FakeLlm(reply=reply("reschedule", 0.9, summary="Wants to reschedule", preferred_time="Thursday evening")),
                  NOW + timedelta(minutes=6), clinic_id=clinic.id)

    assert clinic.item()["status_text"] == "in_progress"
    message = inbound(conn, clinic)
    assert message["ai_summary"] == "Wants to reschedule (Thursday evening)"
    assert message["handled_at"] is None  # a person still has to offer a new slot


def test_clear_opt_out_is_honoured(conn):
    clinic = Clinic(conn, require_approval=True)
    clinic.detect_and_plan()  # a reminder is waiting for approval
    clinic.reply(text="Please don't message me on WhatsApp any more", at=NOW)

    result = run_ai_assist(conn, FakeLlm(reply=reply("opt_out", 0.97)), NOW + timedelta(minutes=1), clinic_id=clinic.id)

    assert result.auto_opted_out == 1
    consent = one(conn, "select status::text as status from recovery.consents where clinic_id = %(c)s", c=clinic.id)
    assert consent["status"] == "opted_out"
    assert clinic.outbound()[0]["status_text"] == "cancelled"


def test_failed_call_is_retried_next_run_and_messages_are_analysed_once(conn):
    clinic = reminded_clinic(conn)
    clinic.reply(text="What time do you open?", at=NOW + timedelta(minutes=5))
    later = NOW + timedelta(minutes=6)

    failed = run_ai_assist(conn, FakeLlm(reply=AiUnavailableError("quota exceeded")), later, clinic_id=clinic.id)
    assert (failed.failed, failed.replies_analysed) == (1, 0)
    assert inbound(conn, clinic)["ai_processed_at"] is None

    assert run_ai_assist(conn, FakeLlm(reply=reply("question", 0.9)), later, clinic_id=clinic.id).replies_analysed == 1
    assert run_ai_assist(conn, FakeLlm(reply=reply("question", 0.9)), later, clinic_id=clinic.id).replies_analysed == 0


def test_emergency_enquiry_is_classified_and_prioritised(conn):
    clinic = Clinic(conn)
    clinic.reply(text="My tooth is swollen and the pain is terrible, can I come today?",
                 from_digits="919333333333", at=NOW - timedelta(hours=2))
    emergency = EnquiryClassification(interest="pain_emergency", urgency="emergency", language="en",
                                      wants_booking=True, summary="Severe pain and swelling, wants visit today")

    result = run_ai_assist(conn, FakeLlm(enquiry=emergency, reply=reply("question", 0.9)), NOW, clinic_id=clinic.id)

    assert result.enquiries_classified == 1
    enquiry = one(conn, "select interest, urgency, ai_summary from recovery.enquiries where clinic_id = %(c)s", c=clinic.id)
    assert enquiry == {"interest": "pain_emergency", "urgency": "emergency",
                       "ai_summary": "Severe pain and swelling, wants visit today"}

    scan_clinic(conn, clinic.id, NOW)
    leak = one(conn, "select reason, priority_score from recovery.recovery_items "
                     "where clinic_id = %(c)s and leak_type = 'missed_enquiry'", c=clinic.id)
    assert leak["reason"] == "WhatsApp enquiry about pain / emergency, no reply for 2 h"
    assert leak["priority_score"] >= 80  # urgent and boosted, so it tops the worklist
