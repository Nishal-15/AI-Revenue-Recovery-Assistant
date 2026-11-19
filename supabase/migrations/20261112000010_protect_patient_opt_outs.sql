-- A patient's own "stop" can only be undone by the patient.
-- Staff (any signed-in user) cannot turn an opt-out that came from the patient (a STOP reply) or from an
-- erasure request back into an opt-in, and cannot delete it. The patient can still reply START, which
-- the engine records. Only direct changes from the website (role "authenticated") are checked: the engine
-- and the database's own functions, such as forget_contact(), which replaces the row with another opt-out,
-- run as the owner and pass.

create or replace function recovery.guard_patient_opt_outs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if old.status = 'opted_out' and old.source in ('whatsapp_reply_stop', 'erasure_request') then
    if tg_op = 'DELETE' or new.status <> 'opted_out' then
      raise exception 'This number asked not to get WhatsApp messages. Only the patient can change that, by replying START.'
        using errcode = '42501';
    end if;
    -- Saving "not agreed" again is fine, but it must not relabel the patient's own STOP as a staff decision.
    new.source := old.source;
    new.recorded_at := old.recorded_at;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists consents_guard_patient_opt_outs on recovery.consents;
create trigger consents_guard_patient_opt_outs
  before update or delete on recovery.consents
  for each row execute function recovery.guard_patient_opt_outs();
