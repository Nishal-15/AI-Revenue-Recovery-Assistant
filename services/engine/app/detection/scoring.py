"""Priority score for the worklist (0-100). The whole formula lives here so it can be tuned in one place.

score = value part (up to 50) + urgency part (up to 35) + 15 for pain / emergency enquiries.
"""

import math
from datetime import timedelta
from typing import Literal

LeakType = Literal["missed_enquiry", "overdue_followup", "unconfirmed_appointment", "lapsed_patient"]

MAX_VALUE_POINTS = 50.0
# Values are log-scaled so a 65k aligner case outranks a 2k cleaning without drowning out urgency.
VALUE_CEILING = 100_000
EMERGENCY_BONUS = 15.0
EMERGENCY_INTEREST = "pain_emergency"


def value_points(value: float) -> float:
    scaled = math.log10(1 + max(value, 0)) / math.log10(1 + VALUE_CEILING)
    return MAX_VALUE_POINTS * min(1.0, scaled)


def urgency_points(leak_type: LeakType, timing: timedelta) -> float:
    """`timing` is time until the appointment starts for unconfirmed appointments, and time since
    the enquiry arrived / the task or follow-up fell due for the other leak types."""
    hours = timing.total_seconds() / 3600
    match leak_type:
        case "unconfirmed_appointment":
            return 35 if hours < 24 else 25 if hours < 48 else 15
        case "missed_enquiry":
            return 35 if hours < 24 else 25 if hours < 72 else 10
        case "overdue_followup":
            return 25 if hours < 48 else 15
        case "lapsed_patient":
            days = hours / 24
            return 25 if days < 30 else 18 if days < 90 else 10


def priority_score(leak_type: LeakType, value: float, timing: timedelta, interest: str | None = None) -> float:
    score = value_points(value) + urgency_points(leak_type, timing)
    if interest == EMERGENCY_INTEREST:
        score += EMERGENCY_BONUS
    return round(min(score, 100.0), 2)
