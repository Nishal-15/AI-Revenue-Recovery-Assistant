"""Turns active automation sequences into concrete outbound messages for open recovery items.

Each sequence is a list of steps anchored to the item's due time (e.g. 48 h before an appointment)
or to when the leak was detected (e.g. 2 days after). On each run, only the latest step whose time has
come is planned, so an item detected late gets the most relevant reminder rather than a burst of them.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ValidationError

from app.outreach.render import MissingVariableError, render_body, resolve_params
from app.outreach.values import load_values

logger = logging.getLogger(__name__)

Row = dict[str, Any]


class AutomationStep(BaseModel):
    anchor: Literal["due", "detected"]
    offset_minutes: int
    template_id: UUID


@dataclass
class PlanResult:
    planned: int = 0
    awaiting_approval: int = 0
    failed: int = 0
    cancelled_stale: int = 0


CANDIDATES_SQL = """
select i.id, i.leak_type::text as leak_type, i.detected_at, i.due_at, i.contact_phone, i.patient_id, i.enquiry_id,
       r.id as rule_id, r.steps,
       coalesce(s.require_staff_approval, true) as require_approval,
       (select max(m.step_index) from recovery.outreach_messages m
         where m.recovery_item_id = i.id and m.automation_rule_id = r.id) as last_step
from recovery.recovery_items i
join recovery.automation_rules r
  on r.clinic_id = i.clinic_id and r.leak_type = i.leak_type and r.is_active
left join recovery.clinic_settings s on s.clinic_id = i.clinic_id
where i.clinic_id = %(clinic_id)s
  and i.status = 'open'
  and (i.snoozed_until is null or i.snoozed_until <= %(now)s)
  and i.contact_phone is not null
"""

TEMPLATES_SQL = """
select id, body, variables from recovery.message_templates
where clinic_id = %(clinic_id)s and is_active
"""

INSERT_SQL = """
insert into recovery.outreach_messages (
  clinic_id, recovery_item_id, enquiry_id, patient_id, direction, channel, template_id, contact_phone,
  body, template_params, status, scheduled_for, automation_rule_id, step_index, error
) values (
  %(clinic_id)s, %(item_id)s, %(enquiry_id)s, %(patient_id)s, 'outbound', 'whatsapp', %(template_id)s, %(phone)s,
  %(body)s, %(params)s, %(status)s, %(scheduled_for)s, %(rule_id)s, %(step_index)s, %(error)s
)
on conflict (recovery_item_id, automation_rule_id, step_index) where automation_rule_id is not null do nothing
returning status::text as status
"""


def parse_steps(raw: Any) -> list[AutomationStep]:
    if not isinstance(raw, list):
        return []
    try:
        return [AutomationStep.model_validate(step) for step in raw]
    except ValidationError:
        logger.warning("automation rule has invalid steps: %s", raw)
        return []


def step_time(step: AutomationStep, *, detected_at: datetime, due_at: datetime | None) -> datetime | None:
    anchor = due_at if step.anchor == "due" else detected_at
    return None if anchor is None else anchor + timedelta(minutes=step.offset_minutes)


def choose_step(
    steps: list[AutomationStep], *, detected_at: datetime, due_at: datetime | None, last_step: int | None, now: datetime
) -> int | None:
    """Index of the step to plan now, or None. Never re-plans or goes back to an earlier step."""
    due_indexes = [
        index
        for index, step in enumerate(steps)
        if (when := step_time(step, detected_at=detected_at, due_at=due_at)) is not None and when <= now
    ]
    if not due_indexes:
        return None
    candidate = max(due_indexes)
    if last_step is not None and candidate <= last_step:
        return None
    if steps[candidate].anchor == "due" and due_at is not None and due_at <= now:
        return None  # the appointment (or deadline) has already passed
    return candidate


# Reminders still waiting (for approval or to be sent) whose leak has since been resolved.
CANCEL_STALE_SQL = """
update recovery.outreach_messages m
set status = 'cancelled', error = 'No longer needed: the worklist item was resolved'
where m.clinic_id = %(clinic_id)s and m.automation_rule_id is not null
  and m.status in ('queued', 'awaiting_approval')
  and not exists (
    select 1 from recovery.recovery_items i
    where i.id = m.recovery_item_id and i.status in ('open', 'in_progress')
  )
"""


def plan_clinic(conn: Connection[Row], clinic_id: UUID, now: datetime) -> PlanResult:
    result = PlanResult()
    with conn.transaction(), conn.cursor() as cursor:
        cursor.execute(CANCEL_STALE_SQL, {"clinic_id": clinic_id})
        result.cancelled_stale = cursor.rowcount
        cursor.execute(TEMPLATES_SQL, {"clinic_id": clinic_id})
        templates = {row["id"]: row for row in cursor.fetchall()}
        cursor.execute(CANDIDATES_SQL, {"clinic_id": clinic_id, "now": now})
        candidates = cursor.fetchall()

        for item in candidates:
            steps = parse_steps(item["steps"])
            index = choose_step(
                steps, detected_at=item["detected_at"], due_at=item["due_at"], last_step=item["last_step"], now=now
            )
            if index is None:
                continue
            template = templates.get(steps[index].template_id)
            if template is None:
                logger.warning("rule %s step %d uses a missing or inactive template", item["rule_id"], index)
                continue

            status = "awaiting_approval" if item["require_approval"] else "queued"
            body, params, error = None, [], None
            try:
                values = load_values(conn, clinic_id=clinic_id, item_id=item["id"], phone=item["contact_phone"])
                params = resolve_params(template["variables"], values)
                body = render_body(template["body"], params)
            except MissingVariableError as missing:
                status, error = "failed", str(missing)

            cursor.execute(
                INSERT_SQL,
                {
                    "clinic_id": clinic_id,
                    "item_id": item["id"],
                    "enquiry_id": item["enquiry_id"],
                    "patient_id": item["patient_id"],
                    "template_id": template["id"],
                    "phone": item["contact_phone"],
                    "body": body,
                    "params": Jsonb(params),
                    "status": status,
                    "scheduled_for": now,
                    "rule_id": item["rule_id"],
                    "step_index": index,
                    "error": error,
                },
            )
            inserted = cursor.fetchone()
            if inserted is None:
                continue
            if inserted["status"] == "failed":
                result.failed += 1
            elif inserted["status"] == "awaiting_approval":
                result.awaiting_approval += 1
            else:
                result.planned += 1
    return result
