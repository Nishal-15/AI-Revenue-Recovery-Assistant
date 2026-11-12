"""Revenue Recovery engine.

Runs beside Supabase with a privileged database connection. Responsibilities by phase:
  Phase 1  detection scan: read practice tables, upsert recovery.recovery_items
  Phase 2  WhatsApp dispatch + inbound webhook, consent and quiet-hours checks
  Phase 3  Gemini: enquiry classification, message drafting, reply intent
  Phase 4  booking attribution into recovery.recovered_bookings
"""

import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.ai.enquiries import EnquiryClassification, classify_enquiry
from app.ai.llm import AiUnavailableError, GeminiLlm, StructuredLlm
from app.config import Settings, get_settings

app = FastAPI(title="Revenue Recovery Engine", version="0.1.0")

SettingsDep = Annotated[Settings, Depends(get_settings)]


def require_engine_token(settings: SettingsDep, authorization: Annotated[str | None, Header()] = None) -> None:
    expected = settings.engine_api_token.get_secret_value()
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid engine token")


def get_llm(settings: SettingsDep) -> StructuredLlm:
    if not settings.gemini_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "GEMINI_API_KEY is not configured")
    return GeminiLlm(api_key=settings.gemini_api_key.get_secret_value(), model=settings.gemini_model)


LlmDep = Annotated[StructuredLlm, Depends(get_llm)]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/jobs/scan", dependencies=[Depends(require_engine_token)], status_code=status.HTTP_202_ACCEPTED)
def run_detection_scan() -> dict[str, str]:
    # Phase 1: run the four leak detectors and upsert recovery_items.
    return {"status": "accepted", "detail": "detection arrives in Phase 1"}


class ClassifyEnquiryRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@app.post("/ai/classify-enquiry", dependencies=[Depends(require_engine_token)])
async def classify_enquiry_endpoint(body: ClassifyEnquiryRequest, llm: LlmDep) -> EnquiryClassification:
    try:
        return await classify_enquiry(llm, body.message)
    except AiUnavailableError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error


@app.get("/webhooks/whatsapp", response_class=PlainTextResponse)
def verify_whatsapp_webhook(
    settings: SettingsDep,
    mode: Annotated[str, Query(alias="hub.mode")],
    token: Annotated[str, Query(alias="hub.verify_token")],
    challenge: Annotated[str, Query(alias="hub.challenge")],
) -> str:
    """Meta calls this once when the webhook is registered and expects the challenge echoed back."""
    expected = settings.whatsapp_verify_token.get_secret_value() if settings.whatsapp_verify_token else ""
    if mode != "subscribe" or not expected or not secrets.compare_digest(token, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "webhook verification failed")
    return challenge
