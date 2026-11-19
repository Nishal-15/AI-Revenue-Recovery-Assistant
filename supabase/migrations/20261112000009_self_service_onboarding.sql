-- Self-service accounts.
--   * recovery.create_clinic(): a newly signed-up user creates their clinic and becomes its owner.
--     Settings, starter WhatsApp templates and reminder sequences are installed in the same step.
--   * recovery.team_members() / add_team_member() / remove_team_member(): owners and managers run
--     their team by email. Staff create their own login first; nobody can see other clinics' users.
--   * recovery.set_my_name(): anyone can change how their own name appears to the team.
-- All are security definer because they read auth.users or write clinic_staff, which staff
-- cannot do directly. Each one checks the caller itself.

create or replace function recovery.create_clinic(
  p_name            text,
  p_owner_name      text,
  p_phone           text default null,
  p_whatsapp_number text default null,
  p_timezone        text default 'Asia/Kolkata',
  p_currency        text default 'INR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_clinic uuid;
  v_name   text := btrim(coalesce(p_name, ''));
  v_owner  text := btrim(coalesce(p_owner_name, ''));
  v_currency text := upper(btrim(coalesce(p_currency, 'INR')));
begin
  if v_user is null then
    raise exception 'Sign in before creating a clinic' using errcode = '42501';
  end if;
  if exists (select 1 from recovery.clinic_staff where user_id = v_user) then
    raise exception 'This account already belongs to a clinic' using errcode = '23505';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Please enter the clinic name' using errcode = '22023';
  end if;
  if length(v_owner) < 2 or length(v_owner) > 120 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Unknown currency' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  insert into recovery.clinics (name, phone, whatsapp_number, timezone, currency)
  values (v_name, nullif(btrim(p_phone), ''), nullif(btrim(p_whatsapp_number), ''), p_timezone, v_currency)
  returning id into v_clinic;

  insert into recovery.clinic_settings (clinic_id) values (v_clinic) on conflict (clinic_id) do nothing;
  insert into recovery.clinic_staff (clinic_id, user_id, full_name, role) values (v_clinic, v_user, v_owner, 'owner');
  perform recovery.install_default_automations(v_clinic);
  return v_clinic;
end;
$$;

create or replace function recovery.team_members(p_clinic_id uuid)
returns table (user_id uuid, full_name text, role recovery.staff_role, email text, joined_at timestamptz, is_you boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, s.full_name, s.role, u.email::text, s.created_at, s.user_id = auth.uid()
  from recovery.clinic_staff s
  join auth.users u on u.id = s.user_id
  where s.clinic_id = p_clinic_id
    and recovery.is_clinic_member(p_clinic_id)
  order by s.created_at;
$$;

create or replace function recovery.add_team_member(
  p_clinic_id uuid,
  p_email     text,
  p_full_name text,
  p_role      recovery.staff_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_caller_role recovery.staff_role;
begin
  select role into v_caller_role from recovery.clinic_staff where clinic_id = p_clinic_id and user_id = auth.uid();
  if v_caller_role is null or v_caller_role not in ('owner', 'manager') then
    raise exception 'Only owners and managers can add people' using errcode = '42501';
  end if;
  if p_role = 'owner' and v_caller_role <> 'owner' then
    raise exception 'Only an owner can make someone an owner' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please enter their name' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No account uses that email yet. Ask them to sign up first, then add them again.'
      using errcode = 'P0002';
  end if;
  if exists (select 1 from recovery.clinic_staff where user_id = v_user and clinic_id <> p_clinic_id) then
    raise exception 'That person already works with another clinic on Revenue Recovery' using errcode = '23505';
  end if;

  insert into recovery.clinic_staff (clinic_id, user_id, full_name, role)
  values (p_clinic_id, v_user, btrim(p_full_name), p_role)
  on conflict (clinic_id, user_id) do update set full_name = excluded.full_name, role = excluded.role;
  return v_user;
end;
$$;

create or replace function recovery.remove_team_member(p_clinic_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role recovery.staff_role;
  v_target_role recovery.staff_role;
begin
  select role into v_caller_role from recovery.clinic_staff where clinic_id = p_clinic_id and user_id = auth.uid();
  if v_caller_role is null or v_caller_role not in ('owner', 'manager') then
    raise exception 'Only owners and managers can remove people' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself' using errcode = '22023';
  end if;
  select role into v_target_role from recovery.clinic_staff where clinic_id = p_clinic_id and user_id = p_user_id;
  if v_target_role is null then
    return;
  end if;
  if v_target_role = 'owner' and v_caller_role <> 'owner' then
    raise exception 'Only an owner can remove an owner' using errcode = '42501';
  end if;
  delete from recovery.clinic_staff where clinic_id = p_clinic_id and user_id = p_user_id;
end;
$$;

create or replace function recovery.set_my_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  update recovery.clinic_staff set full_name = btrim(p_full_name) where user_id = auth.uid();
end;
$$;

revoke execute on function recovery.create_clinic(text, text, text, text, text, text) from public, anon;
revoke execute on function recovery.team_members(uuid) from public, anon;
revoke execute on function recovery.add_team_member(uuid, text, text, recovery.staff_role) from public, anon;
revoke execute on function recovery.remove_team_member(uuid, uuid) from public, anon;
revoke execute on function recovery.set_my_name(text) from public, anon;
grant execute on function recovery.create_clinic(text, text, text, text, text, text) to authenticated;
grant execute on function recovery.team_members(uuid) to authenticated;
grant execute on function recovery.add_team_member(uuid, text, text, recovery.staff_role) to authenticated;
grant execute on function recovery.remove_team_member(uuid, uuid) to authenticated;
grant execute on function recovery.set_my_name(text) to authenticated;
