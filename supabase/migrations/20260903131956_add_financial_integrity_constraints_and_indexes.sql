-- Financial integrity constraints and FK indexes.
-- Applied to the linked Supabase project as migration 20260903131956.

create index if not exists idx_sales_session_id on public.sales(session_id);
create index if not exists idx_sales_shop_id on public.sales(shop_id);
create index if not exists idx_sales_product_id on public.sales(product_id);
create index if not exists idx_payments_session_id on public.payments(session_id);
create index if not exists idx_payments_shop_id on public.payments(shop_id);
create index if not exists idx_returns_session_id on public.returns(session_id);
create index if not exists idx_returns_shop_id on public.returns(shop_id);
create index if not exists idx_returns_product_id on public.returns(product_id);
create index if not exists idx_expenses_session_id on public.expenses(session_id);
create index if not exists idx_outstanding_settlements_shop_id on public.outstanding_settlements(shop_id);

alter table public.sales
  drop constraint if exists sales_total_amount_matches_line;
alter table public.sales
  add constraint sales_total_amount_matches_line
  check (total_amount is null or total_amount = quantity * unit_price);

alter table public.returns
  drop constraint if exists returns_total_loss_matches_line;
alter table public.returns
  add constraint returns_total_loss_matches_line
  check (total_loss is null or total_loss = quantity * unit_price);
