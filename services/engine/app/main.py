"""Revenue Recovery engine.

Runs beside Supabase with a privileged database connection:
  detection   finds revenue leaks and keeps recovery_items in sync           (POST /jobs/scan)
  attribution credits bookings made after outreach to recovered revenue      (part of /jobs/scan)
  planning    turns automation sequences into outbound WhatsApp messages     (part of /jobs/scan)
  dispatch    sends queued messages within consent, quiet-hour and limit rules (POST /jobs/dispatch)
  webhook     receives replies, button taps and delivery receipts           (POST /webhooks/whatsapp)
  ai          Gemini: classify enquiries, read replies, draft responses     (POST /jobs/ai)
"""

import asyncio
import json
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from time import monotonic
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from psycopg import Connection
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

from app.ai.enquiries import EnquiryClassification, classify_enquiry
from app.ai.llm import AiUnavailableError, GeminiLlm, StructuredLlm
from app.config import Settings, get_settings
from app.db import create_pool
from app.detection.repository import ClinicNotFoundError
from app.ai.assist import AssistResult
from app.jobs import ClinicCycle, run_ai, run_clinic_cycle, run_detection_cycle, run_dispatch
from app.outreach.dispatcher import DispatchResult
from app.outreach.inbound import InboundResult, handle_events
from app.whatsapp.sender import CloudApiSender, DryRunSender, WhatsAppSender
from app.whatsapp.webhook import parse_webhook, verify_signature

logger = logging.getLogger(__name__)

Pool = ConnectionPool[Connection[dict[str, Any]]]

DISPATCH_TICK_SECONDS = 60


def build_sender(settings: Settings) -> WhatsAppSender:
    if settings.whatsapp_access_token:
        return CloudApiSender(
            access_token=settings.whatsapp_access_token.get_secret_value(), api_version=settings.whatsapp_api_version
        )
    return DryRunSender()


async def run_scheduler(pool: Pool, sender: WhatsAppSender, settings: Settings) -> None:
    """Every minute: read new replies with Gemini, then send due messages.
    Every `scan_interval_minutes`: detect leaks and plan reminders."""
    scan_interval_minutes = settings.scan_interval_minutes
    last_scan = float("-inf")
    while True:
        try:
            if monotonic() - last_scan >= scan_interval_minutes * 60:
                cycles = await asyncio.to_thread(run_detection_cycle, pool)
                last_scan = monotonic()
                logger.info("detection cycle finished for %d clinics", len(cycles))
            assisted = await asyncio.to_thread(run_ai, pool, settings)
            if assisted and (assisted.replies_analysed or assisted.enquiries_classified or assisted.failed):
                logger.info("ai assist: %s", assisted)
            dispatched = await asyncio.to_thread(run_dispatch, pool, sender)
            if dispatched.sent or dispatched.failed:
                logger.info("dispatch: %s", dispatched)
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(DISPATCH_TICK_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.pool = None
    scheduler: asyncio.Task[None] | None = None

    if settings.database_url:
        pool = create_pool(settings.database_url.get_secret_value(), settings.db_pool_max_size)
        pool.open()
        app.state.pool = pool
        if settings.enable_scheduler:
            scheduler = asyncio.create_task(run_scheduler(pool, build_sender(settings), settings))

    yield

    if scheduler:
        scheduler.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler
    if app.state.pool:
        app.state.pool.close()


app = FastAPI(title="Revenue Recovery Engine", version="0.2.0", lifespan=lifespan)

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_pool(request: Request) -> Pool:
    pool: Pool | None = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DATABASE_URL is not configured")
    return pool


def get_sender(settings: SettingsDep) -> WhatsAppSender:
    return build_sender(settings)


PoolDep = Annotated[Pool, Depends(get_pool)]
SenderDep = Annotated[WhatsAppSender, Depends(get_sender)]


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
def health(settings: SettingsDep) -> dict[str, str]:
    return {
        "status": "ok",
        "whatsapp": "live" if settings.whatsapp_access_token else "dry-run",
        "ai": "on" if settings.gemini_api_key else "off",
    }


@app.post("/jobs/scan", dependencies=[Depends(require_engine_token)])
def run_scan(pool: PoolDep, clinic_id: UUID | None = None) -> list[ClinicCycle]:
    """Detects leaks and plans reminders for one clinic, or all clinics when clinic_id is omitted."""
    if clinic_id is None:
        return run_detection_cycle(pool)
    try:
        with pool.connection() as conn:
            return [run_clinic_cycle(conn, clinic_id, datetime.now(UTC))]
    except ClinicNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


@app.post("/jobs/ai", dependencies=[Depends(require_engine_token)])
def run_ai_job(pool: PoolDep, settings: SettingsDep) -> AssistResult:
    """Classifies new enquiries and reads unhandled replies with Gemini."""
    result = run_ai(pool, settings)
    if result is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "GEMINI_API_KEY is not configured")
    return result


@app.post("/jobs/dispatch", dependencies=[Depends(require_engine_token)])
def run_dispatch_job(pool: PoolDep, sender: SenderDep) -> DispatchResult:
    return run_dispatch(pool, sender)


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


@app.post("/webhooks/whatsapp")
async def receive_whatsapp_webhook(
    request: Request,
    settings: SettingsDep,
    pool: PoolDep,
    signature: Annotated[str | None, Header(alias="X-Hub-Signature-256")] = None,
) -> InboundResult:
    if not settings.whatsapp_app_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "WHATSAPP_APP_SECRET is not configured")
    body = await request.body()
    if not verify_signature(settings.whatsapp_app_secret.get_secret_value(), body, signature):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid webhook signature")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "webhook body is not JSON") from error

    events = parse_webhook(payload)

    def handle() -> InboundResult:
        with pool.connection() as conn:
            return handle_events(conn, events, datetime.now(UTC))

    return await asyncio.to_thread(handle)
