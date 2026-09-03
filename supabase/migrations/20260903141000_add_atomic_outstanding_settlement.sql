create or replace function private.admin_settle_outstanding(p_shop_id uuid,p_amount numeric,p_note text default null,p_paid_at timestamptz default now()) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop public.shops%rowtype; v_outstanding numeric; v_payment_id uuid; v_now timestamptz := coalesce(p_paid_at,now());
begin
 if not coalesce((select private.is_admin()),false) then raise exception 'Admin access required'; end if;
 if p_amount is null or p_amount <= 0 then raise exception 'Settlement amount must be greater than zero'; end if;
 if p_shop_id is null then raise exception 'Shop is required'; end if;
 select * into v_shop from public.shops where id=p_shop_id and is_active=true for update;
 if not found then raise exception 'Active shop not found'; end if;
 select greatest(0::numeric,coalesce((select sum(total_amount) from public.sales where shop_id=p_shop_id),0)-coalesce((select sum(total_loss) from public.returns where shop_id=p_shop_id),0)-coalesce((select sum(amount) from public.payments where shop_id=p_shop_id),0)) into v_outstanding;
 if p_amount > v_outstanding then raise exception 'Settlement exceeds current outstanding balance (%).', v_outstanding; end if;
 insert into public.payments(shop_id,amount,payment_type,notes,paid_at,synced) values(p_shop_id,p_amount,'outstanding',nullif(trim(p_note),''),v_now,true) returning id into v_payment_id;
 insert into public.outstanding_settlements(shop_id,settled_amount,settled_by,notes,settled_at) values(p_shop_id,p_amount,coalesce((select auth.uid())::text,'admin'),nullif(trim(p_note),''),v_now);
 return v_payment_id;
end; $$;
create or replace function public.admin_settle_outstanding(p_shop_id uuid,p_amount numeric,p_note text default null,p_paid_at timestamptz default now()) returns uuid language plpgsql set search_path = '' as $$ begin return private.admin_settle_outstanding(p_shop_id,p_amount,p_note,p_paid_at); end; $$;
revoke all on function private.admin_settle_outstanding(uuid,numeric,text,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_settle_outstanding(uuid,numeric,text,timestamptz) to authenticated;
