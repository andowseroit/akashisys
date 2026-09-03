-- Remove redundant duplicate indexes while retaining constraint-backed indexes.
create index if not exists idx_truck_loads_product_id on public.truck_loads(product_id);

drop index if exists public.idx_expenses_session;
drop index if exists public.idx_settlements_shop;
drop index if exists public.idx_payments_session;
drop index if exists public.idx_payments_shop;
drop index if exists public.idx_returns_session;
drop index if exists public.idx_sales_session;
drop index if exists public.idx_sales_shop;
alter table public.session_control drop constraint if exists session_control_date_unique;
