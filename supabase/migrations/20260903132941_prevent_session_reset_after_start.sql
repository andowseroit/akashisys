-- Prevent destructive reset of a started/completed route session.
create or replace function public.prevent_session_reset_after_start()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'pending' and (old.started_at is not null or old.completed_at is not null) then
    raise exception 'A started or completed route session cannot be reset to pending';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_route_session_reset on public.route_sessions;
create trigger prevent_route_session_reset
before update of status, started_at, completed_at on public.route_sessions
for each row execute function public.prevent_session_reset_after_start();
