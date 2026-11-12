"""The engine's recurring work: detect leaks and plan reminders per clinic, then send what is due."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.detection.models import ClinicScanResult
from app.detection.repository import list_clinic_ids
from app.detection.scan import scan_clinic
from app.outreach.dispatcher import DispatchResult, dispatch_due
from app.outreach.planner import PlanResult, plan_clinic
from app.whatsapp.sender import WhatsAppSender

logger = logging.getLogger(__name__)

Pool = ConnectionPool[Connection[dict[str, Any]]]


@dataclass
class ClinicCycle:
    clinic_id: UUID
    scan: ClinicScanResult
    plan: PlanResult


def run_clinic_cycle(conn: Connection[dict[str, Any]], clinic_id: UUID, now: datetime) -> ClinicCycle:
    scan = scan_clinic(conn, clinic_id, now)
    plan = plan_clinic(conn, clinic_id, now)
    return ClinicCycle(clinic_id=clinic_id, scan=scan, plan=plan)


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
