"""Checks that DATABASE_URL in .env reaches the Supabase database and that the schema is installed,
then runs one detection + planning cycle for every clinic.

    .venv/Scripts/python -m scripts.check_database      (Windows)
    .venv/bin/python -m scripts.check_database          (macOS / Linux)

Never prints the connection string or password.
"""

import sys
from datetime import UTC, datetime

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.jobs import run_clinic_cycle


def main() -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set in services/engine/.env")
        return 1

    try:
        conn = psycopg.connect(
            settings.database_url.get_secret_value(),
            row_factory=dict_row,
            autocommit=True,
            prepare_threshold=None,
            connect_timeout=15,
        )
    except psycopg.OperationalError as error:
        # psycopg's message names the host and user, never the password.
        print(f"Could not connect: {error}".strip())
        return 1

    with conn:
        with conn.cursor() as cursor:
            cursor.execute("select current_setting('server_version') as version")
            row = cursor.fetchone()
            print(f"Connected to Postgres {row['version'] if row else '?'}")

            cursor.execute(
                "select count(*) as n from information_schema.tables where table_schema = 'recovery'"
            )
            row = cursor.fetchone()
            tables = row["n"] if row else 0
            if tables == 0:
                print("The 'recovery' schema is missing: run supabase/setup_all_in_one.sql in the SQL Editor.")
                return 1
            print(f"Schema installed: {tables} tables and views in 'recovery'")

            cursor.execute(
                """
                select c.id, c.name,
                       (select count(*) from recovery.message_templates t where t.clinic_id = c.id) as templates,
                       (select count(*) from recovery.automation_rules r where r.clinic_id = c.id) as rules,
                       (select count(*) from recovery.patients p where p.clinic_id = c.id) as patients
                from recovery.clinics c order by c.created_at
                """
            )
            clinics = cursor.fetchall()

        if not clinics:
            print("No clinics yet: run the 'insert into recovery.clinics' step in the SQL Editor.")
            return 1

        for clinic in clinics:
            print(
                f"Clinic '{clinic['name']}': {clinic['templates']} templates, "
                f"{clinic['rules']} reminder sequences, {clinic['patients']} patients"
            )
            cycle = run_clinic_cycle(conn, clinic["id"], datetime.now(UTC))
            print(
                f"  First scan: {cycle.scan.created} leaks found, {cycle.scan.resolved} resolved, "
                f"{cycle.attribution.new_bookings + cycle.attribution.saved_appointments} bookings credited, "
                f"{cycle.plan.planned + cycle.plan.awaiting_approval} reminders planned"
            )
    print("Database is working.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
