create or replace function public.validate_financial_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_status text;
  session_date date;
  shop_active boolean;
  product_active boolean;
  sold_qty integer;
  returned_qty integer;
  event_at timestamptz;
  is_admin boolean;
begin
  is_admin := private.is_admin();
  if new.session_id is null then raise exception 'A financial record must belong to a route session'; end if;
  if tg_table_name = 'returns' then
    select rs.status, rs.session_date into session_status, session_date from public.route_sessions rs where rs.id = new.session_id for update;
  else
    select rs.status, rs.session_date into session_status, session_date from public.route_sessions rs where rs.id = new.session_id for share;
  end if;
  if not found then raise exception 'Route session does not exist'; end if;
  if tg_table_name = 'sales' then event_at := new.sold_at;
  elsif tg_table_name = 'payments' then event_at := new.paid_at;
  elsif tg_table_name = 'returns' then event_at := new.returned_at;
  else event_at := new.spent_at; end if;
  if event_at is not null and (event_at at time zone 'Asia/Colombo')::date <> session_date then raise exception 'Transaction timestamp does not match the route session business date'; end if;
  if not is_admin and session_status <> 'active' then raise exception 'Financial records can only be added to an active route session'; end if;
  if tg_table_name in ('sales','payments','returns') then
    select s.is_active into shop_active from public.shops s where s.id = new.shop_id;
    if not coalesce(shop_active, false) then raise exception 'Shop is not active'; end if;
  end if;
  if tg_table_name in ('sales','returns') then
    select p.is_active into product_active from public.products p where p.id = new.product_id;
    if not coalesce(product_active, false) then raise exception 'Product is not active'; end if;
  end if;
  if tg_table_name = 'returns' then
    select coalesce(sum(s.quantity),0)::integer into sold_qty from public.sales s where s.session_id = new.session_id and s.shop_id = new.shop_id and s.product_id = new.product_id and s.voided_at is null;
    select coalesce(sum(r.quantity),0)::integer into returned_qty from public.returns r where r.session_id = new.session_id and r.shop_id = new.shop_id and r.product_id = new.product_id and r.voided_at is null;
    if new.quantity > greatest(0, sold_qty - returned_qty) then raise exception 'Return quantity exceeds the unreturned quantity sold for this shop and product in the session'; end if;
  end if;
  return new;
end;
$$;
