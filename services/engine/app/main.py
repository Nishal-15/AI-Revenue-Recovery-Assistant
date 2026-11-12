"""Revenue Recovery engine.

Runs beside Supabase with a privileged database connection. Responsibilities by phase:
  Phase 1  detection scan: read practice tables, upsert recovery.recovery_items
  Phase 2  WhatsApp dispatch + inbound webhook, consent and quiet-hours checks
  Phase 3  Gemini: enquiry classification, message drafting, reply intent
  Phase 4  booking attribution into recovery.recovered_bookings
"""

import asyncio
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
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
from app.detection.models import ClinicScanResult
from app.detection.repository import ClinicNotFoundError
from app.detection.scan import scan_all_clinics, scan_clinic

logger = logging.getLogger(__name__)

Pool = ConnectionPool[Connection[dict[str, Any]]]


async def run_scheduler(pool: Pool, interval_minutes: int) -> None:
    """Scans every clinic on a fixed interval; a failed run is logged and the loop carries on."""
    while True:
        try:
            results = await asyncio.to_thread(scan_all_clinics, pool)
            logger.info("scheduled scan finished for %d clinics", len(results))
        except Exception:
            logger.exception("scheduled scan failed")
        await asyncio.sleep(interval_minutes * 60)


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
            scheduler = asyncio.create_task(run_scheduler(pool, settings.scan_interval_minutes))

    yield

    if scheduler:
        scheduler.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler
    if app.state.pool:
        app.state.pool.close()


app = FastAPI(title="Revenue Recovery Engine", version="0.1.0", lifespan=lifespan)

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_pool(request: Request) -> Pool:
    pool: Pool | None = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DATABASE_URL is not configured")
    return pool


PoolDep = Annotated[Pool, Depends(get_pool)]


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


@app.post("/jobs/scan", dependencies=[Depends(require_engine_token)])
def run_detection_scan(pool: PoolDep, clinic_id: UUID | None = None) -> list[ClinicScanResult]:
    """Scans one clinic, or every clinic when clinic_id is omitted. Sync on purpose: FastAPI runs it in a thread."""
    if clinic_id is None:
        return scan_all_clinics(pool)
    try:
        with pool.connection() as conn:
            return [scan_clinic(conn, clinic_id)]
    except ClinicNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


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
