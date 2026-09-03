alter table public.sales drop constraint if exists sales_quantity_positive_check;
alter table public.sales drop constraint if exists sales_total_amount_nonnegative_check;
alter table public.sales drop constraint if exists sales_unit_price_nonnegative_check;
alter table public.returns drop constraint if exists returns_total_loss_nonnegative_check;
alter table public.returns drop constraint if exists returns_unit_price_nonnegative_check;

alter table public.sales alter column session_id set not null;
alter table public.payments alter column session_id set not null;
alter table public.returns alter column session_id set not null;
alter table public.expenses alter column session_id set not null;

alter table public.sales drop constraint if exists sales_session_id_fkey;
alter table public.sales add constraint sales_session_id_fkey foreign key (session_id) references public.route_sessions(id) on delete restrict;
alter table public.payments drop constraint if exists payments_session_id_fkey;
alter table public.payments add constraint payments_session_id_fkey foreign key (session_id) references public.route_sessions(id) on delete restrict;
alter table public.returns drop constraint if exists returns_session_id_fkey;
alter table public.returns add constraint returns_session_id_fkey foreign key (session_id) references public.route_sessions(id) on delete restrict;
alter table public.expenses drop constraint if exists expenses_session_id_fkey;
alter table public.expenses add constraint expenses_session_id_fkey foreign key (session_id) references public.route_sessions(id) on delete restrict;
alter table public.truck_loads drop constraint if exists truck_loads_session_id_fkey;
alter table public.truck_loads add constraint truck_loads_session_id_fkey foreign key (session_id) references public.route_sessions(id) on delete restrict;
