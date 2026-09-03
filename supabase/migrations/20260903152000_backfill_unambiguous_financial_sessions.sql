-- Backfill only when the business date has exactly one route session.
-- Never guess when multiple sessions exist.
update public.sales s
set session_id = rs.id
from public.route_sessions rs
where s.session_id is null
  and rs.session_date = (s.sold_at at time zone 'Asia/Colombo')::date
  and 1 = (select count(*) from public.route_sessions r2 where r2.session_date = (s.sold_at at time zone 'Asia/Colombo')::date);

update public.payments p
set session_id = rs.id
from public.route_sessions rs
where p.session_id is null
  and rs.session_date = (p.paid_at at time zone 'Asia/Colombo')::date
  and 1 = (select count(*) from public.route_sessions r2 where r2.session_date = (p.paid_at at time zone 'Asia/Colombo')::date);

update public.returns r
set session_id = rs.id
from public.route_sessions rs
where r.session_id is null
  and rs.session_date = (r.returned_at at time zone 'Asia/Colombo')::date
  and 1 = (select count(*) from public.route_sessions r2 where r2.session_date = (r.returned_at at time zone 'Asia/Colombo')::date);

update public.expenses e
set session_id = rs.id
from public.route_sessions rs
where e.session_id is null
  and rs.session_date = (e.spent_at at time zone 'Asia/Colombo')::date
  and 1 = (select count(*) from public.route_sessions r2 where r2.session_date = (e.spent_at at time zone 'Asia/Colombo')::date);
