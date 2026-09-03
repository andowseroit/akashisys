-- Route-session integrity hardening applied to the linked Supabase project.
create index if not exists idx_route_sessions_driver_date on public.route_sessions(driver_id, session_date desc);

alter table public.route_sessions
  add constraint route_sessions_session_date_not_null
  check (session_date is not null) not valid;

create or replace function public.validate_financial_session()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_status text;
begin
  if new.session_id is null then
    raise exception 'session_id is required for % records', tg_table_name;
  end if;

  select status into session_status from public.route_sessions where id = new.session_id;
  if session_status is null then
    raise exception 'Referenced route session does not exist';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_sales_session on public.sales;
create trigger validate_sales_session before insert or update of session_id on public.sales for each row execute function public.validate_financial_session();
drop trigger if exists validate_payments_session on public.payments;
create trigger validate_payments_session before insert or update of session_id on public.payments for each row execute function public.validate_financial_session();
drop trigger if exists validate_returns_session on public.returns;
create trigger validate_returns_session before insert or update of session_id on public.returns for each row execute function public.validate_financial_session();
drop trigger if exists validate_expenses_session on public.expenses;
create trigger validate_expenses_session before insert or update of session_id on public.expenses for each row execute function public.validate_financial_session();
