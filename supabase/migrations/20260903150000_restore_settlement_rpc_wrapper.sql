create or replace function public.settle_outstanding(p_shop_id uuid, p_amount numeric, p_note text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return private.admin_settle_outstanding(p_shop_id, p_amount, p_note, now());
end;
$$;
revoke all on function public.settle_outstanding(uuid,numeric,text) from public;
grant execute on function public.settle_outstanding(uuid,numeric,text) to authenticated;
