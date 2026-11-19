"""Lets someone sign in to the clinic: links a Supabase login (email) to your clinic with a role.

    .venv/Scripts/python -m scripts.add_staff
    .venv/Scripts/python -m scripts.add_staff --list

First create the login in Supabase: Authentication -> Users -> Add user -> Create new user
(tick "Auto Confirm User"). Then run this script with the same email.

Roles:
  owner       everything, including deleting a patient's data and changing settings
  manager     same as owner
  dentist     works the lists and messages
  front_desk  works the lists and messages
"""

import sys
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings

ROLES = {"1": "owner", "2": "manager", "3": "dentist", "4": "front_desk"}


def ask(question: str, *, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        answer = input(f"{question}{suffix}: ").strip()
        if not answer and default is not None:
            return default
        if answer:
            return answer
        print("  Please type an answer.")


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}***@{domain}" if domain else "***"


def list_staff(conn: psycopg.Connection[dict[str, Any]]) -> None:
    rows = conn.execute("""
        select c.name as clinic, s.full_name, s.role::text as role, u.email
        from recovery.clinic_staff s
        join recovery.clinics c on c.id = s.clinic_id
        join auth.users u on u.id = s.user_id
        order by c.name, s.created_at""").fetchall()
    if not rows:
        print("Nobody can sign in yet.")
    for row in rows:
        print(f"  {row['clinic']}: {row['full_name']} ({row['role']}) {mask_email(row['email'] or '')}")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set in services/engine/.env")
        return 1

    with psycopg.connect(settings.database_url.get_secret_value(), row_factory=dict_row, autocommit=True,
                         prepare_threshold=None, connect_timeout=15) as conn:
        if "--list" in sys.argv:
            list_staff(conn)
            return 0

        clinics = conn.execute("select id, name from recovery.clinics order by created_at").fetchall()
        if not clinics:
            print("There is no clinic in the database yet.")
            return 1
        clinic = clinics[0]
        if len(clinics) > 1:
            for index, row in enumerate(clinics, start=1):
                print(f"  {index}. {row['name']}")
            choice = ask("Which clinic", default="1")
            clinic = clinics[int(choice) - 1] if choice.isdigit() and 0 < int(choice) <= len(clinics) else clinics[0]

        email = ask("Email they sign in with").lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            print(f"\n\"{email}\" isn't an email address. Use the full email, for example name@gmail.com.")
            return 1
        user = conn.execute("select id from auth.users where lower(email) = %s", (email,)).fetchone()
        if not user:
            print("\nNo login with that email yet. Create it first in Supabase:")
            print("  Authentication -> Users -> Add user -> Create new user (tick Auto Confirm User).")
            return 1

        full_name = ask("Their name, as the team should see it")
        print("Role: 1 owner, 2 manager, 3 dentist, 4 front desk")
        role = ROLES.get(ask("Choose 1-4", default="1"), "owner")

        conn.execute("""
            insert into recovery.clinic_staff (clinic_id, user_id, full_name, role)
            values (%s, %s, %s, %s::recovery.staff_role)
            on conflict (clinic_id, user_id) do update set full_name = excluded.full_name, role = excluded.role""",
            (clinic["id"], user["id"], full_name, role))
        print(f"\nDone. {full_name} can now sign in to {clinic['name']} as {role.replace('_', ' ')}.")
        list_staff(conn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
