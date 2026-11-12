from datetime import date, datetime, timedelta

import pytest

from app.detection import reasons
from app.detection.pricing import DEFAULT_ENQUIRY_VALUE, enquiry_value
from app.detection.scoring import priority_score, urgency_points, value_points


def test_value_points_are_log_scaled_and_capped():
    assert value_points(0) == 0
    assert value_points(100_000) == pytest.approx(50)
    assert value_points(1_000_000) == 50
    assert value_points(65_000) > value_points(2_500) > value_points(500)


@pytest.mark.parametrize(
    ("leak_type", "timing", "expected"),
    [
        ("unconfirmed_appointment", timedelta(hours=5), 35),
        ("unconfirmed_appointment", timedelta(hours=30), 25),
        ("unconfirmed_appointment", timedelta(hours=60), 15),
        ("missed_enquiry", timedelta(hours=3), 35),
        ("missed_enquiry", timedelta(hours=50), 25),
        ("missed_enquiry", timedelta(days=5), 10),
        ("overdue_followup", timedelta(hours=30), 25),
        ("overdue_followup", timedelta(days=4), 15),
        ("lapsed_patient", timedelta(days=12), 25),
        ("lapsed_patient", timedelta(days=60), 18),
        ("lapsed_patient", timedelta(days=200), 10),
    ],
)
def test_urgency_points(leak_type, timing, expected):
    assert urgency_points(leak_type, timing) == expected


def test_emergency_bonus_and_cap():
    plain = priority_score("missed_enquiry", 3000, timedelta(hours=1))
    emergency = priority_score("missed_enquiry", 3000, timedelta(hours=1), "pain_emergency")
    assert emergency == pytest.approx(plain + 15)
    assert priority_score("missed_enquiry", 10_000_000, timedelta(hours=1), "pain_emergency") == 100


def test_enquiry_value_falls_back_for_unknown_interest():
    assert enquiry_value("aligners") == 65000
    assert enquiry_value(None) == DEFAULT_ENQUIRY_VALUE
    assert enquiry_value("something_new") == DEFAULT_ENQUIRY_VALUE


def test_reason_texts():
    assert reasons.unanswered_enquiry_reason("whatsapp", "aligners", timedelta(hours=3, minutes=20)) == (
        "WhatsApp enquiry about aligners, no reply for 3 h"
    )
    assert reasons.unanswered_enquiry_reason("phone", None, timedelta(minutes=75)) == "Phone enquiry, no reply for 1 h"
    assert reasons.overdue_task_reason("callback", "Quote", timedelta(days=2, hours=1)) == "Callback overdue by 2 days: Quote"
    assert reasons.lapsed_followup_reason("recall", "6-month hygiene recall", 21) == "6-month hygiene recall overdue by 3 weeks"
    assert reasons.lapsed_followup_reason("treatment_step", "Crown", 12) == "Crown due 12 days ago, not booked"
    today = date(2026, 11, 12)
    assert reasons.unconfirmed_appointment_reason("Implant consult", datetime(2026, 11, 13, 10, 30), today) == (
        "Implant consult tomorrow 10:30, not confirmed"
    )
