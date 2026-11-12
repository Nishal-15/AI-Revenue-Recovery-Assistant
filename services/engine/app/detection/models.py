from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel

from app.detection.scoring import LeakType


@dataclass(frozen=True)
class ClinicScanContext:
    """Everything a detector needs to know about the clinic, fixed for the duration of one scan."""

    clinic_id: UUID
    timezone: ZoneInfo
    now: datetime
    enquiry_response_sla: timedelta
    unconfirmed_lookahead: timedelta
    lapsed_grace_days: int

    @property
    def today(self) -> date:
        return self.now.astimezone(self.timezone).date()


class DetectedItem(BaseModel):
    leak_type: LeakType
    source_ref: str
    patient_id: UUID | None = None
    enquiry_id: UUID | None = None
    appointment_id: UUID | None = None
    followup_id: UUID | None = None
    task_id: UUID | None = None
    patient_name: str | None
    contact_phone: str | None
    reason: str
    estimated_value: Decimal
    priority_score: float
    due_at: datetime


class ClinicScanResult(BaseModel):
    clinic_id: UUID
    created: int = 0
    updated: int = 0
    resolved: int = 0
