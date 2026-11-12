import hashlib
import hmac
import json
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.outreach.quiet_hours import is_quiet, next_send_time
from app.outreach.render import (
    MissingVariableError,
    button_payload,
    first_name,
    format_appointment_time,
    parse_button_payload,
    render_body,
    resolve_params,
)
from app.whatsapp.sender import CloudApiSender, OutgoingMessage, SendError, TemplateMessage, build_payload
from app.whatsapp.webhook import InboundMessage, StatusUpdate, parse_webhook, verify_signature

IST = ZoneInfo("Asia/Kolkata")

TEMPLATE_MESSAGE = OutgoingMessage(
    to_digits="919800000001",
    phone_number_id="PNID",
    template=TemplateMessage(
        name="appointment_confirmation", language="en", params=["Ananya", "Smile Studio"],
        button_payloads=["confirm:abc", "reschedule:abc"],
    ),
)


# --- sender ---------------------------------------------------------------------------------

def test_template_payload_has_body_params_and_quick_reply_buttons():
    payload = build_payload(TEMPLATE_MESSAGE)
    assert payload["type"] == "template"
    assert payload["to"] == "919800000001"
    body, first_button, second_button = payload["template"]["components"]
    assert [p["text"] for p in body["parameters"]] == ["Ananya", "Smile Studio"]
    assert first_button == {
        "type": "button", "sub_type": "quick_reply", "index": "0",
        "parameters": [{"type": "payload", "payload": "confirm:abc"}],
    }
    assert second_button["index"] == "1"


def test_text_payload_and_empty_text_rejected():
    payload = build_payload(OutgoingMessage(to_digits="91", phone_number_id="P", text="Hello"))
    assert payload["text"] == {"preview_url": False, "body": "Hello"}
    with pytest.raises(SendError):
        build_payload(OutgoingMessage(to_digits="91", phone_number_id="P", text=""))


def test_cloud_sender_posts_to_graph_and_returns_message_id():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"messages": [{"id": "wamid.123"}]})

    sender = CloudApiSender(access_token="tok", api_version="v23.0", http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert sender.send(TEMPLATE_MESSAGE) == "wamid.123"
    assert str(seen[0].url) == "https://graph.facebook.com/v23.0/PNID/messages"
    assert seen[0].headers["Authorization"] == "Bearer tok"
    assert json.loads(seen[0].content)["template"]["name"] == "appointment_confirmation"


def test_cloud_sender_surfaces_whatsapp_error_message():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "Template name does not exist"}})

    sender = CloudApiSender(access_token="tok", api_version="v23.0", http=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(SendError, match="Template name does not exist"):
        sender.send(TEMPLATE_MESSAGE)


def test_cloud_sender_requires_clinic_number():
    sender = CloudApiSender(access_token="tok", api_version="v23.0")
    with pytest.raises(SendError, match="no WhatsApp number"):
        sender.send(TEMPLATE_MESSAGE.model_copy(update={"phone_number_id": None}))


# --- webhook --------------------------------------------------------------------------------

def test_signature_verification():
    body = b'{"entry": []}'
    good = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    assert verify_signature("secret", body, good)
    assert not verify_signature("secret", body, "sha256=deadbeef")
    assert not verify_signature("secret", body, None)
    assert not verify_signature("other", body, good)


def _webhook(**value):
    return {"entry": [{"changes": [{"value": {"metadata": {"phone_number_id": "PNID"}, **value}}]}]}


def test_parses_text_button_interactive_and_statuses():
    payload = _webhook(
        contacts=[{"wa_id": "919800000001", "profile": {"name": "Ananya"}}],
        messages=[
            {"from": "919800000001", "id": "m1", "timestamp": "1762934400", "type": "text", "text": {"body": "Hi"}},
            {"from": "919800000001", "id": "m2", "type": "button", "button": {"text": "Confirm", "payload": "confirm:x"}},
            {"from": "919800000001", "id": "m3", "type": "interactive",
             "interactive": {"button_reply": {"id": "book:y", "title": "Book"}}},
            {"from": "919800000001", "id": "m4", "type": "image"},
        ],
        statuses=[
            {"id": "wamid.1", "status": "read", "timestamp": "1762934500"},
            {"id": "wamid.2", "status": "failed", "errors": [{"title": "Re-engagement message"}]},
            {"id": "wamid.3", "status": "deleted"},
        ],
    )
    events = parse_webhook(payload)
    inbound = [e for e in events if isinstance(e, InboundMessage)]
    statuses = [e for e in events if isinstance(e, StatusUpdate)]

    assert [(m.text, m.button_payload) for m in inbound] == [
        ("Hi", None), ("Confirm", "confirm:x"), ("Book", "book:y"), ("[image message]", None),
    ]
    assert inbound[0].profile_name == "Ananya"
    assert inbound[0].received_at == datetime.fromtimestamp(1762934400, UTC)
    assert [(s.provider_message_id, s.status, s.error) for s in statuses] == [
        ("wamid.1", "read", None), ("wamid.2", "failed", "Re-engagement message"),
    ]


# --- rendering ------------------------------------------------------------------------------

def test_render_helpers():
    assert first_name("Ananya Rao") == "Ananya"
    assert first_name(None) == "there"
    assert format_appointment_time(datetime(2026, 11, 13, 5, 0, tzinfo=UTC), IST) == "Fri 13 Nov, 10:30 am"
    assert render_body("Hi {{1}}, see you {{2}}. {{3}}", ["Ananya", "soon"]) == "Hi Ananya, see you soon. {{3}}"
    assert resolve_params(["a", "b"], {"a": "1", "b": "2", "c": "3"}) == ["1", "2"]
    with pytest.raises(MissingVariableError, match="appointment_time"):
        resolve_params(["appointment_time"], {})


def test_button_payload_round_trip():
    assert button_payload("Call me", "abc-123") == "call_me:abc-123"
    assert parse_button_payload("call_me:abc-123") == ("call_me", "abc-123")
    assert parse_button_payload("no-separator") is None
    assert parse_button_payload(None) is None


# --- quiet hours ----------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("clock", "quiet"),
    [(time(22, 0), True), (time(2, 0), True), (time(8, 59), True), (time(9, 0), False), (time(14, 0), False)],
)
def test_quiet_hours_wrapping_midnight(clock, quiet):
    local = datetime(2026, 11, 12, clock.hour, clock.minute, tzinfo=IST)
    assert is_quiet(local, time(21, 0), time(9, 0)) is quiet


def test_next_send_time_moves_to_end_of_quiet_hours():
    evening = datetime(2026, 11, 12, 22, 30, tzinfo=IST)
    early = datetime(2026, 11, 13, 6, 0, tzinfo=IST)
    midday = datetime(2026, 11, 12, 13, 0, tzinfo=IST)
    assert next_send_time(evening, time(21, 0), time(9, 0)) == datetime(2026, 11, 13, 9, 0, tzinfo=IST)
    assert next_send_time(early, time(21, 0), time(9, 0)) == datetime(2026, 11, 13, 9, 0, tzinfo=IST)
    assert next_send_time(midday, time(21, 0), time(9, 0)) == midday
    assert next_send_time(midday, time(12, 0), time(14, 0)) == datetime(2026, 11, 12, 14, 0, tzinfo=IST)


def test_dry_run_log_has_no_patient_data(caplog):
    import logging

    from app.whatsapp.sender import DryRunSender

    caplog.set_level(logging.INFO)
    DryRunSender().send(TEMPLATE_MESSAGE)
    DryRunSender().send(OutgoingMessage(to_digits="919800000001", phone_number_id="P", text="Hi Ananya, your crown"))
    logged = caplog.text
    assert "919800000001" not in logged and "Ananya" not in logged and "crown" not in logged
    assert "...0001" in logged
