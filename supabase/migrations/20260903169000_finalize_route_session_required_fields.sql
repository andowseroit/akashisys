alter table public.route_sessions alter column session_date set not null;
alter table public.route_sessions drop constraint if exists route_sessions_session_date_not_null;
