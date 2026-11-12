-- Everything the dashboard needs in one round trip.
-- "This month" and its comparison are calculated in the clinic's timezone, and the
-- comparison covers the same number of days of last month, so mid-month numbers are fair.

create or replace function recovery.dashboard_summary(p_clinic_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_tz          text;
  v_month_start timestamptz;
  v_prev_start  timestamptz;
  v_elapsed     interval;
  v_result      jsonb;
begin
  if not recovery.is_clinic_member(p_clinic_id) then
    raise exception 'not a member of clinic %', p_clinic_id using errcode = '42501';
  end if;

  select coalesce((select timezone from recovery.clinics where id = p_clinic_id), 'Asia/Kolkata')
    into v_tz;
  v_month_start := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_prev_start  := (date_trunc('month', now() at time zone v_tz) - interval '1 month') at time zone v_tz;
  v_elapsed     := now() - v_month_start;

  with
  bookings as (
    select value, booked_at from recovery.recovered_bookings where clinic_id = p_clinic_id
  ),
  open_items as (
    select * from recovery.recovery_items
    where clinic_id = p_clinic_id and status in ('open', 'in_progress')
  ),
  resolved_this_month as (
    select status from recovery.recovery_items
    where clinic_id = p_clinic_id
      and status in ('recovered', 'lost')
      and resolved_at >= v_month_start
  ),
  weeks as (
    select generate_series(
      date_trunc('week', now() at time zone v_tz) - interval '7 weeks',
      date_trunc('week', now() at time zone v_tz),
      interval '1 week'
    ) as week_start
  )
  select jsonb_build_object(
    'recovered_value',
      (select coalesce(sum(value), 0) from bookings where booked_at >= v_month_start),
    'recovered_previous_value',
      (select coalesce(sum(value), 0) from bookings
        where booked_at >= v_prev_start and booked_at < v_prev_start + v_elapsed),
    'recovered_bookings',
      (select count(*) from bookings where booked_at >= v_month_start),
    'at_risk_value',
      (select coalesce(sum(estimated_value), 0) from open_items),
    'recovery_rate',
      (select coalesce(round(count(*) filter (where status = 'recovered')::numeric / nullif(count(*), 0), 4), 0)
         from resolved_this_month),
    'leaks',
      (select coalesce(jsonb_object_agg(leak_type, jsonb_build_object(
                'open_count', n, 'at_risk_value', total)), '{}'::jsonb)
         from (select leak_type, count(*) as n, sum(estimated_value) as total
                 from open_items group by leak_type) per_leak),
    'weekly',
      (select jsonb_agg(jsonb_build_object(
                'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
                'recovered_value', coalesce((
                  select sum(b.value) from bookings b
                  where (b.booked_at at time zone v_tz) >= w.week_start
                    and (b.booked_at at time zone v_tz) <  w.week_start + interval '1 week'), 0))
              order by w.week_start)
         from weeks w),
    'top_items',
      (select coalesce(jsonb_agg(to_jsonb(t) order by t.priority_score desc, t.estimated_value desc), '[]'::jsonb)
         from (select id, leak_type, patient_name, reason, estimated_value, priority_score, due_at
                 from open_items
                 where snoozed_until is null or snoozed_until <= now()
                 order by priority_score desc, estimated_value desc
                 limit 5) t)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function recovery.dashboard_summary(uuid) to authenticated;
