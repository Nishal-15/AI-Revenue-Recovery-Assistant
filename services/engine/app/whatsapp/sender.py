"""Sending through the WhatsApp Cloud API, or logging instead when no access token is configured."""

import logging
from typing import Any, Protocol
from uuid import uuid4

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com"


class TemplateMessage(BaseModel):
    name: str
    language: str
    params: list[str]
    # One payload per quick-reply button, in the template's button order.
    button_payloads: list[str] = []


class OutgoingMessage(BaseModel):
    to_digits: str
    phone_number_id: str | None
    template: TemplateMessage | None = None
    text: str | None = None


class SendError(Exception):
    """WhatsApp refused the message; the text is safe to show staff."""


class WhatsAppSender(Protocol):
    def send(self, message: OutgoingMessage) -> str:
        """Sends the message and returns WhatsApp's message id."""
        ...


def build_payload(message: OutgoingMessage) -> dict[str, Any]:
    base: dict[str, Any] = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": message.to_digits}
    if message.template is None:
        if not message.text:
            raise SendError("Nothing to send: the message has no text")
        return {**base, "type": "text", "text": {"preview_url": False, "body": message.text}}

    template = message.template
    components: list[dict[str, Any]] = []
    if template.params:
        components.append(
            {"type": "body", "parameters": [{"type": "text", "text": value} for value in template.params]}
        )
    for index, payload in enumerate(template.button_payloads):
        components.append(
            {
                "type": "button",
                "sub_type": "quick_reply",
                "index": str(index),
                "parameters": [{"type": "payload", "payload": payload}],
            }
        )
    return {
        **base,
        "type": "template",
        "template": {"name": template.name, "language": {"code": template.language}, "components": components},
    }


class CloudApiSender:
    def __init__(self, *, access_token: str, api_version: str, http: httpx.Client | None = None) -> None:
        self._access_token = access_token
        self._api_version = api_version
        self._http = http or httpx.Client(timeout=15)

    def send(self, message: OutgoingMessage) -> str:
        if not message.phone_number_id:
            raise SendError("This clinic has no WhatsApp number configured (Settings → WhatsApp phone number ID)")
        url = f"{GRAPH_URL}/{self._api_version}/{message.phone_number_id}/messages"
        try:
            response = self._http.post(
                url, json=build_payload(message), headers={"Authorization": f"Bearer {self._access_token}"}
            )
        except httpx.HTTPError as error:
            raise SendError(f"Could not reach WhatsApp: {error}") from error

        body = response.json() if response.content else {}
        if response.is_error:
            detail = body.get("error", {}).get("message") or response.text
            raise SendError(f"WhatsApp rejected the message: {detail}")
        try:
            return str(body["messages"][0]["id"])
        except (KeyError, IndexError, TypeError) as error:
            raise SendError("WhatsApp accepted the request but returned no message id") from error


class DryRunSender:
    """Used until Meta credentials are added: every check runs, nothing leaves the building."""

    def send(self, message: OutgoingMessage) -> str:
        payload = build_payload(message)
        logger.info("dry-run WhatsApp message to %s: %s", message.to_digits, payload)
        return f"dryrun.{uuid4().hex}"
