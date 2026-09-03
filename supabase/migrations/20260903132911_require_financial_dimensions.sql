-- POS financial records must identify their shop/product dimensions.
alter table public.sales alter column shop_id set not null;
alter table public.sales alter column product_id set not null;
alter table public.payments alter column shop_id set not null;
alter table public.returns alter column shop_id set not null;
alter table public.returns alter column product_id set not null;
