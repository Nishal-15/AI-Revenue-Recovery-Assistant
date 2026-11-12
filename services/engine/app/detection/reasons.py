"""The one-line "why is this on my list" text the front desk reads on each worklist row."""

from datetime import date, datetime, timedelta

SOURCE_LABELS: dict[str, str] = {
    "whatsapp": "WhatsApp enquiry",
    "phone": "Phone enquiry",
    "web_form": "Web form enquiry",
    "walk_in": "Walk-in enquiry",
    "other": "Enquiry",
}
INTEREST_LABELS: dict[str, str] = {
    "root_canal": "root canal",
    "crown_bridge": "crown / bridge",
    "pain_emergency": "pain / emergency",
    "general_checkup": "a check-up",
    "price_enquiry": "prices",
    "kids": "kids' dentistry",
}
TASK_LABELS: dict[str, str] = {"callback": "Callback", "follow_up": "Follow-up", "other": "Task"}


def plural(count: int, unit: str) -> str:
    return f"{count} {unit}" if count == 1 else f"{count} {unit}s"


def format_elapsed(delta: timedelta) -> str:
    """Short, rounded-down span: '45 min', '3 h', '2 days'."""
    minutes = max(int(delta.total_seconds() // 60), 0)
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    if hours < 48:
        return f"{hours} h"
    return plural(hours // 24, "day")


def format_days(days: int) -> str:
    """Coarser span for follow-ups measured in days: '12 days', '3 weeks', '4 months'."""
    if days < 14:
        return plural(days, "day")
    if days < 60:
        return plural(days // 7, "week")
    return plural(days // 30, "month")


def unanswered_enquiry_reason(source: str, interest: str | None, waiting: timedelta) -> str:
    subject = SOURCE_LABELS.get(source, "Enquiry")
    if interest and interest != "other":
        subject += f" about {INTEREST_LABELS.get(interest, interest.replace('_', ' '))}"
    return f"{subject}, no reply for {format_elapsed(waiting)}"


def unbooked_enquiry_reason(since_received: timedelta) -> str:
    return f"Replied but not booked after {plural(since_received.days, 'day')}"


def overdue_task_reason(kind: str, title: str, overdue: timedelta) -> str:
    return f"{TASK_LABELS.get(kind, 'Task')} overdue by {format_elapsed(overdue)}: {title}"


def unconfirmed_appointment_reason(treatment: str | None, starts_at_local: datetime, today: date) -> str:
    return f"{treatment or 'Appointment'} {format_day(starts_at_local.date(), today)} {starts_at_local:%H:%M}, not confirmed"


def format_day(day: date, today: date) -> str:
    if day == today:
        return "today"
    if day == today + timedelta(days=1):
        return "tomorrow"
    return f"{day:%a} {day.day} {day:%b}"


def lapsed_followup_reason(kind: str, procedure: str, days_overdue: int) -> str:
    if kind == "recall":
        return f"{procedure} overdue by {format_days(days_overdue)}"
    return f"{procedure} due {format_days(days_overdue)} ago, not booked"
