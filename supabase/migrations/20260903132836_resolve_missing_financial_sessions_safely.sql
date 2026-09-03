-- Safely resolve missing session_id on new financial records.
create or replace function public.validate_financial_session()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  resolved_session uuid;
  candidate_count integer;
  record_date date;
  auth_user uuid;
begin
  auth_user := (select auth.uid());

  if new.session_id is null then
    if tg_table_name = 'sales' then
      record_date := (new.sold_at at time zone 'Asia/Colombo')::date;
    elsif tg_table_name = 'payments' then
      record_date := (new.paid_at at time zone 'Asia/Colombo')::date;
    elsif tg_table_name = 'returns' then
      record_date := (new.returned_at at time zone 'Asia/Colombo')::date;
    elsif tg_table_name = 'expenses' then
      record_date := (new.spent_at at time zone 'Asia/Colombo')::date;
    end if;

    select count(*) into candidate_count
    from public.route_sessions rs
    where rs.session_date = record_date
      and (rs.driver_id = auth_user or (select private.is_admin()));

    if candidate_count <> 1 then
      raise exception 'Cannot safely resolve financial record to a route session for %: expected exactly one matching session, found %', record_date, candidate_count;
    end if;

    select rs.id into resolved_session
    from public.route_sessions rs
    where rs.session_date = record_date
      and (rs.driver_id = auth_user or (select private.is_admin()))
    limit 1;

    new.session_id := resolved_session;
  end if;

  if not exists (select 1 from public.route_sessions rs where rs.id = new.session_id) then
    raise exception 'Referenced route session does not exist';
  end if;

  return new;
end;
$$;