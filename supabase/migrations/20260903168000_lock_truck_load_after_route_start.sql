create or replace function public.guard_truck_load_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare session_status text;
begin
  select rs.status into session_status from public.route_sessions rs where rs.id = coalesce(new.session_id, old.session_id) for share;
  if not found then raise exception 'Route session does not exist'; end if;
  if tg_op = 'DELETE' then
    if session_status <> 'pending' then raise exception 'Truck loads cannot be deleted after the route starts'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if session_status <> 'pending' then raise exception 'Truck loads can only be added before the route starts'; end if;
    return new;
  end if;
  if old.session_id is distinct from new.session_id or old.product_id is distinct from new.product_id or old.quantity_loaded is distinct from new.quantity_loaded then
    raise exception 'Loaded stock identity and quantity cannot be changed after the route starts';
  end if;
  if session_status = 'completed' then
    if old.quantity_returned is distinct from new.quantity_returned then raise exception 'Completed route stock is immutable'; end if;
  elsif session_status not in ('pending','active','paused') then
    raise exception 'Invalid route session status';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_truck_load_mutation() from public;
drop trigger if exists guard_truck_load_mutation on public.truck_loads;
create trigger guard_truck_load_mutation before insert or update or delete on public.truck_loads for each row execute function public.guard_truck_load_mutation();
