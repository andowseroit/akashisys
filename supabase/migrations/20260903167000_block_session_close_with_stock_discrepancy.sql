create or replace function public.prevent_session_reset_after_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'completed' then
    if new.status <> old.status
       or new.started_at is distinct from old.started_at
       or new.completed_at is distinct from old.completed_at then
      raise exception 'A completed route session is immutable';
    end if;
    return new;
  end if;
  if old.status = 'pending' and new.status = 'active' then
    if new.started_at is null or new.completed_at is not null then raise exception 'Starting a route session requires started_at and no completed_at'; end if;
  elsif old.status = 'active' and new.status = 'paused' then
    if new.started_at is distinct from old.started_at or new.completed_at is not null then raise exception 'Pausing a route session cannot alter its start time'; end if;
  elsif old.status = 'paused' and new.status = 'active' then
    if new.started_at is distinct from old.started_at or new.completed_at is not null then raise exception 'Resuming a route session cannot alter its start time'; end if;
  elsif (old.status = 'active' or old.status = 'paused') and new.status = 'completed' then
    if old.started_at is null or new.started_at is distinct from old.started_at or new.completed_at is null then raise exception 'Completing a route session requires its original start time and a completion time'; end if;
    if exists (
      select 1 from public.truck_loads tl where tl.session_id = old.id and (
        (tl.quantity_loaded - coalesce((select sum(s.quantity) from public.sales s where s.session_id = old.id and s.product_id = tl.product_id and s.voided_at is null),0)
         - coalesce((select sum(r.quantity) from public.returns r where r.session_id = old.id and r.product_id = tl.product_id and r.voided_at is null),0)) < 0
        or coalesce((select sum(r.quantity) from public.returns r where r.session_id = old.id and r.product_id = tl.product_id and r.voided_at is null),0) > tl.quantity_loaded
      )
    ) then raise exception 'Cannot complete route session while stock reconciliation has an over-sold or over-returned discrepancy'; end if;
  elsif old.status <> new.status then
    raise exception 'Invalid route session status transition: % -> %', old.status, new.status;
  elsif new.started_at is distinct from old.started_at or new.completed_at is distinct from old.completed_at then
    raise exception 'Route session timestamps cannot be edited outside a valid state transition';
  end if;
  return new;
end;
$$;
