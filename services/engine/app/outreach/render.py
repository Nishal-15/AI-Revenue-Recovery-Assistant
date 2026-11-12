"""Filling WhatsApp template placeholders ({{1}}, {{2}}, ...) from what we know about a recovery item."""

import re
from datetime import datetime
from zoneinfo import ZoneInfo

PLACEHOLDER = re.compile(r"\{\{(\d+)\}\}")


class MissingVariableError(Exception):
    """A template needs a value this item does not have (e.g. appointment_time for an enquiry)."""


def first_name(full_name: str | None) -> str:
    parts = (full_name or "").split()
    return parts[0] if parts else "there"


def format_appointment_time(starts_at: datetime, timezone: ZoneInfo) -> str:
    local = starts_at.astimezone(timezone)
    hour = local.strftime("%I").lstrip("0")
    return f"{local:%a} {local.day} {local:%b}, {hour}:{local:%M} {local:%p}".replace("AM", "am").replace("PM", "pm")


def template_values(
    *,
    patient_name: str | None,
    clinic_name: str,
    timezone: ZoneInfo,
    treatment: str | None = None,
    starts_at: datetime | None = None,
    procedure: str | None = None,
) -> dict[str, str]:
    values = {
        "patient_name": patient_name or "",
        "patient_first_name": first_name(patient_name),
        "clinic_name": clinic_name,
        "treatment": treatment or "appointment",
    }
    if starts_at is not None:
        values["appointment_time"] = format_appointment_time(starts_at, timezone)
    if procedure:
        values["procedure"] = procedure
    return {name: value for name, value in values.items() if value}


def resolve_params(variables: list[str], values: dict[str, str]) -> list[str]:
    missing = [name for name in variables if name not in values]
    if missing:
        raise MissingVariableError(f"No value for {', '.join(missing)}")
    return [values[name] for name in variables]


def render_body(body: str, params: list[str]) -> str:
    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1)) - 1
        return params[index] if 0 <= index < len(params) else match.group(0)

    return PLACEHOLDER.sub(replace, body)


ButtonAction = str


def button_action(label: str) -> ButtonAction:
    """'Call me' -> 'call_me'. The action name travels in the quick-reply payload."""
    return re.sub(r"[^a-z0-9]+", "_", label.strip().lower()).strip("_")


def button_payload(label: str, message_id: str) -> str:
    return f"{button_action(label)}:{message_id}"


def parse_button_payload(payload: str | None) -> tuple[ButtonAction, str] | None:
    if not payload or ":" not in payload:
        return None
    action, message_id = payload.split(":", 1)
    return action, message_id
