-- Operational route sessions must always identify a driver.
-- Historical orphaned session is removable only when it has no business records.
delete from public.route_sessions rs
where rs.driver_id is null
  and not exists (select 1 from public.truck_loads tl where tl.session_id = rs.id)
  and not exists (select 1 from public.sales s where s.session_id = rs.id)
  and not exists (select 1 from public.payments p where p.session_id = rs.id)
  and not exists (select 1 from public.returns r where r.session_id = rs.id)
  and not exists (select 1 from public.expenses e where e.session_id = rs.id);

alter table public.route_sessions
  alter column driver_id set not null;

create unique index if not exists route_sessions_driver_date_unique
  on public.route_sessions (driver_id, session_date);
