"""One detection pass: resolve what has cleared, then add or refresh what is still leaking."""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.detection.detectors import detect_all
from app.detection.models import ClinicScanResult
from app.detection.repository import list_clinic_ids, load_context, resolve_items, upsert_items

logger = logging.getLogger(__name__)

Row = dict[str, Any]


def scan_clinic(conn: Connection[Row], clinic_id: UUID, now: datetime | None = None) -> ClinicScanResult:
    """Runs in a single transaction so the worklist never shows a half-finished scan."""
    with conn.transaction():
        ctx = load_context(conn, clinic_id, now or datetime.now(UTC))
        resolved = resolve_items(conn, ctx)
        created, updated = upsert_items(conn, clinic_id, detect_all(conn, ctx), ctx.now)
    return ClinicScanResult(clinic_id=clinic_id, created=created, updated=updated, resolved=resolved)


def scan_all_clinics(pool: ConnectionPool[Connection[Row]], now: datetime | None = None) -> list[ClinicScanResult]:
    """One clinic failing (bad timezone, data issue) must not stop the others from being scanned."""
    with pool.connection() as conn:
        clinic_ids = list_clinic_ids(conn)

    results = []
    for clinic_id in clinic_ids:
        try:
            with pool.connection() as conn:
                results.append(scan_clinic(conn, clinic_id, now))
        except Exception:
            logger.exception("detection scan failed for clinic %s", clinic_id)
    return results
