-- Recovery item lifecycle: keep resolved_at honest and audit every status change,
-- whether the change comes from staff in the UI or from the engine.

create or replace function recovery.on_recovery_item_status_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('recovered', 'lost', 'dismissed') then
      new.resolved_at := coalesce(new.resolved_at, now());
    else
      new.resolved_at := null;
    end if;

    insert into recovery.audit_log (clinic_id, actor_id, action, entity, entity_id, details)
    values (
      new.clinic_id,
      auth.uid(),                       -- null when the engine made the change
      'recovery_item.status_changed',
      'recovery_items',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'note', new.resolution_note)
    );
  end if;
  return new;
end;
$$;

create trigger recovery_items_status_change
  before update of status on recovery.recovery_items
  for each row execute function recovery.on_recovery_item_status_change();
