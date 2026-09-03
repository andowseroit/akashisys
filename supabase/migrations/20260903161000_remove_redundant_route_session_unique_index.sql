-- route_sessions already has a UNIQUE constraint on (driver_id, session_date).
-- Remove duplicate standalone indexes so the constraint's backing index is authoritative.
drop index if exists public.route_sessions_driver_date_unique;
drop index if exists public.idx_route_sessions_driver_date;
