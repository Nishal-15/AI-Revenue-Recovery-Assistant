"""Data retention: message text is kept only as long as the clinic's retention setting allows.

After that, the text and AI notes are blanked while dates and statuses stay, so reports still add up.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from psycopg import Connection

Row = dict[str, Any]


@dataclass
class RetentionResult:
    messages_redacted: int = 0
    enquiries_redacted: int = 0


CUTOFF_SQL = """
select %(now)s - make_interval(days => coalesce(
  (select message_retention_days from recovery.clinic_settings where clinic_id = %(clinic_id)s), 365)) as cutoff
"""

REDACT_MESSAGES_SQL = """
update recovery.outreach_messages
set body = null, template_params = '[]', ai_summary = null, ai_suggested_reply = null, error = null
where clinic_id = %(clinic_id)s and created_at < %(cutoff)s
  and (body is not null or ai_summary is not null or ai_suggested_reply is not null)
"""

REDACT_ENQUIRIES_SQL = """
update recovery.enquiries
set message = null, ai_summary = null
where clinic_id = %(clinic_id)s and received_at < %(cutoff)s and (message is not null or ai_summary is not null)
"""


def apply_retention(conn: Connection[Row], clinic_id: UUID, now: datetime) -> RetentionResult:
    with conn.transaction(), conn.cursor() as cursor:
        cursor.execute(CUTOFF_SQL, {"clinic_id": clinic_id, "now": now})
        row = cursor.fetchone()
        params = {"clinic_id": clinic_id, "cutoff": row["cutoff"] if row else now}
        cursor.execute(REDACT_MESSAGES_SQL, params)
        messages = cursor.rowcount
        cursor.execute(REDACT_ENQUIRIES_SQL, params)
        enquiries = cursor.rowcount
    return RetentionResult(messages_redacted=messages, enquiries_redacted=enquiries)
