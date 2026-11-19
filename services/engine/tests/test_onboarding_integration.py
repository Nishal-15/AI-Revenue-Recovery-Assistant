"""Self-service sign-up and team management, run the way Supabase runs them for a logged-in user.

Needs TEST_DATABASE_URL (see test_detection_integration.py).
"""

import os
from uuid import UUID, uuid4

import psycopg
import pytest

from tests.test_outreach_integration import Clinic, conn, one, run  # noqa: F401 (conn is a fixture)
from tests.test_privacy_integration import add_staff, as_user

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")

Denied = psycopg.errors.InsufficientPrivilege


def new_user(conn, email: str | None = None) -> UUID:
    user_id = uuid4()
    run(conn, "insert into auth.users (id, email) values (%(u)s, %(e)s)", u=user_id, e=email or f"{user_id}@example.com")
    return user_id


def create_clinic(conn, user_id: UUID, name: str = "Bright Smile Dental") -> UUID:
    with as_user(conn, user_id):
        return one(conn, "select recovery.create_clinic(%(n)s, 'Dr Rao', '+91 80 1234 5678') as id", n=name)["id"]


def test_new_user_creates_clinic_and_becomes_owner_with_reminders_ready(conn):
    user = new_user(conn)

    clinic_id = create_clinic(conn, user)

    staff = one(conn, "select role::text as role, full_name from recovery.clinic_staff where clinic_id = %(c)s", c=clinic_id)
    assert staff == {"role": "owner", "full_name": "Dr Rao"}
    assert one(conn, "select count(*) as n from recovery.automation_rules where clinic_id = %(c)s", c=clinic_id)["n"] == 3
    assert one(conn, "select count(*) as n from recovery.clinic_settings where clinic_id = %(c)s", c=clinic_id)["n"] == 1


def test_a_user_cannot_create_a_second_clinic(conn):
    user = new_user(conn)
    create_clinic(conn, user)
    with pytest.raises(psycopg.errors.UniqueViolation):
        create_clinic(conn, user, "Another clinic")


def test_creating_a_clinic_needs_a_login(conn):
    with pytest.raises(Denied), conn.transaction():
        run(conn, "set local role anon")
        run(conn, "select recovery.create_clinic('Clinic', 'Me')")


def test_owner_adds_and_removes_team_members_by_email(conn):
    owner = new_user(conn)
    clinic_id = create_clinic(conn, owner)
    nurse = new_user(conn, "Priya@Example.com")

    with as_user(conn, owner):
        run(conn, "select recovery.add_team_member(%(c)s, 'priya@example.com', 'Priya', 'front_desk')", c=clinic_id)
        team = conn.execute("select full_name, email, is_you from recovery.team_members(%s)", (clinic_id,)).fetchall()
    assert [(row["full_name"], row["is_you"]) for row in team] == [("Dr Rao", True), ("Priya", False)]

    with as_user(conn, owner):
        run(conn, "select recovery.remove_team_member(%(c)s, %(u)s)", c=clinic_id, u=nurse)
    assert one(conn, "select count(*) as n from recovery.clinic_staff where user_id = %(u)s", u=nurse)["n"] == 0


def test_front_desk_cannot_manage_the_team(conn):
    clinic = Clinic(conn)
    desk = add_staff(conn, clinic, "front_desk")
    new_user(conn, "someone@example.com")
    with pytest.raises(Denied), as_user(conn, desk):
        run(conn, "select recovery.add_team_member(%(c)s, 'someone@example.com', 'Someone', 'front_desk')", c=clinic.id)


def test_manager_cannot_create_or_remove_owners(conn):
    owner = new_user(conn)
    clinic_id = create_clinic(conn, owner)
    manager = new_user(conn, "manager@example.com")
    with as_user(conn, owner):
        run(conn, "select recovery.add_team_member(%(c)s, 'manager@example.com', 'Manager', 'manager')", c=clinic_id)
    new_user(conn, "x@example.com")

    with pytest.raises(Denied), as_user(conn, manager):
        run(conn, "select recovery.add_team_member(%(c)s, 'x@example.com', 'X', 'owner')", c=clinic_id)
    with pytest.raises(Denied), as_user(conn, manager):
        run(conn, "select recovery.remove_team_member(%(c)s, %(u)s)", c=clinic_id, u=owner)


def test_team_list_is_empty_for_other_clinics(conn):
    owner = new_user(conn)
    clinic_id = create_clinic(conn, owner)
    stranger = new_user(conn)
    with as_user(conn, stranger):
        rows = conn.execute("select * from recovery.team_members(%s)", (clinic_id,)).fetchall()
    assert rows == []


def test_adding_an_email_without_an_account_explains_what_to_do(conn):
    owner = new_user(conn)
    clinic_id = create_clinic(conn, owner)
    with pytest.raises(psycopg.errors.NoDataFound, match="sign up first"), as_user(conn, owner):
        run(conn, "select recovery.add_team_member(%(c)s, 'nobody@example.com', 'Nobody', 'front_desk')", c=clinic_id)


def test_anyone_can_rename_themselves(conn):
    owner = new_user(conn)
    clinic_id = create_clinic(conn, owner)
    with as_user(conn, owner):
        run(conn, "select recovery.set_my_name('Dr Anjali Rao')")
    assert one(conn, "select full_name from recovery.clinic_staff where clinic_id = %(c)s", c=clinic_id)["full_name"] == "Dr Anjali Rao"
