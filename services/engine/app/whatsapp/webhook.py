"""Verifying and parsing WhatsApp Cloud API webhook calls into plain events."""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

DeliveryStatus = Literal["sent", "delivered", "read", "failed"]


@dataclass(frozen=True)
class InboundMessage:
    phone_number_id: str
    provider_message_id: str
    from_digits: str
    profile_name: str | None
    received_at: datetime
    text: str | None
    button_payload: str | None


@dataclass(frozen=True)
class StatusUpdate:
    phone_number_id: str
    provider_message_id: str
    status: DeliveryStatus
    at: datetime
    error: str | None


WebhookEvent = InboundMessage | StatusUpdate


def verify_signature(app_secret: str, body: bytes, signature_header: str | None) -> bool:
    """Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.removeprefix("sha256="), expected)


def _timestamp(raw: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(raw), UTC)
    except (TypeError, ValueError):
        return datetime.now(UTC)


def _message_content(message: dict[str, Any]) -> tuple[str | None, str | None]:
    """Returns (text shown in the inbox, quick-reply payload)."""
    kind = message.get("type")
    if kind == "text":
        return message.get("text", {}).get("body"), None
    if kind == "button":  # quick reply on a template message
        button = message.get("button", {})
        return button.get("text"), button.get("payload")
    if kind == "interactive":
        interactive = message.get("interactive", {})
        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
        return reply.get("title"), reply.get("id")
    return f"[{kind or 'unsupported'} message]", None


def parse_webhook(payload: dict[str, Any]) -> list[WebhookEvent]:
    events: list[WebhookEvent] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = str(value.get("metadata", {}).get("phone_number_id", ""))
            names = {
                contact.get("wa_id"): contact.get("profile", {}).get("name") for contact in value.get("contacts", [])
            }
            for message in value.get("messages", []):
                text, payload_id = _message_content(message)
                sender = str(message.get("from", ""))
                events.append(
                    InboundMessage(
                        phone_number_id=phone_number_id,
                        provider_message_id=str(message.get("id", "")),
                        from_digits=sender,
                        profile_name=names.get(sender),
                        received_at=_timestamp(message.get("timestamp")),
                        text=text,
                        button_payload=payload_id,
                    )
                )
            for status in value.get("statuses", []):
                state = status.get("status")
                if state not in ("sent", "delivered", "read", "failed"):
                    continue
                errors = status.get("errors") or []
                error = errors[0].get("title") or errors[0].get("message") if errors else None
                events.append(
                    StatusUpdate(
                        phone_number_id=phone_number_id,
                        provider_message_id=str(status.get("id", "")),
                        status=state,
                        at=_timestamp(status.get("timestamp")),
                        error=error,
                    )
                )
    return events
