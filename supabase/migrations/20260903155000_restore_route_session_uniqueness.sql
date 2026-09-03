drop index if exists public.idx_route_sessions_driver_date;
create unique index if not exists route_sessions_driver_date_unique
  on public.route_sessions(driver_id, session_date);
