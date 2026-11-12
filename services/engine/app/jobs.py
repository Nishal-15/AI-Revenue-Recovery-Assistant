"""The engine's recurring work: detect leaks and plan reminders per clinic, then send what is due."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.ai.assist import AssistResult, run_ai_assist
from app.ai.llm import GeminiLlm
from app.attribution import AttributionResult, attribute_bookings
from app.config import Settings
from app.detection.models import ClinicScanResult
from app.detection.repository import list_clinic_ids
from app.detection.scan import scan_clinic
from app.outreach.dispatcher import DispatchResult, dispatch_due
from app.outreach.planner import PlanResult, plan_clinic
from app.privacy import RetentionResult, apply_retention
from app.whatsapp.sender import WhatsAppSender

logger = logging.getLogger(__name__)

Pool = ConnectionPool[Connection[dict[str, Any]]]


@dataclass
class ClinicCycle:
    clinic_id: UUID
    scan: ClinicScanResult
    attribution: AttributionResult
    plan: PlanResult
    retention: RetentionResult


def run_clinic_cycle(conn: Connection[dict[str, Any]], clinic_id: UUID, now: datetime) -> ClinicCycle:
    # Order matters: a booking found by attribution closes its lead before any new reminder is planned.
    scan = scan_clinic(conn, clinic_id, now)
    attribution = attribute_bookings(conn, clinic_id, now)
    plan = plan_clinic(conn, clinic_id, now)
    retention = apply_retention(conn, clinic_id, now)
    return ClinicCycle(clinic_id=clinic_id, scan=scan, attribution=attribution, plan=plan, retention=retention)


def run_detection_cycle(pool: Pool, now: datetime | None = None) -> list[ClinicCycle]:
    """One clinic failing must not stop the others."""
    now = now or datetime.now(UTC)
    with pool.connection() as conn:
        clinic_ids = list_clinic_ids(conn)
    results = []
    for clinic_id in clinic_ids:
        try:
            with pool.connection() as conn:
                results.append(run_clinic_cycle(conn, clinic_id, now))
        except Exception:
            logger.exception("detection cycle failed for clinic %s", clinic_id)
    return results


def run_dispatch(pool: Pool, sender: WhatsAppSender, now: datetime | None = None) -> DispatchResult:
    with pool.connection() as conn:
        return dispatch_due(conn, sender, now or datetime.now(UTC))


def build_llm(settings: Settings) -> GeminiLlm | None:
    """A fresh client per run: each run uses its own event loop, and the async client is bound to one."""
    if not settings.gemini_api_key:
        return None
    return GeminiLlm(api_key=settings.gemini_api_key.get_secret_value(), model=settings.gemini_model)


def run_ai(pool: Pool, settings: Settings, now: datetime | None = None) -> AssistResult | None:
    """None when no Gemini key is configured: the rest of the product works without AI."""
    llm = build_llm(settings)
    if llm is None:
        return None
    with pool.connection() as conn:
        return run_ai_assist(conn, llm, now or datetime.now(UTC), limit=settings.ai_batch_size)
