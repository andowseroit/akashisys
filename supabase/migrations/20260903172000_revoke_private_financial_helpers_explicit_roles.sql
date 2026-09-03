revoke all on function private.admin_add_sale_correction(uuid,uuid,integer,timestamptz,text) from authenticated, anon;
revoke all on function private.admin_add_payment_correction(uuid,numeric,text,timestamptz,text) from authenticated, anon;
revoke all on function private.admin_settle_outstanding(uuid,numeric,text,timestamptz) from authenticated, anon;
revoke all on function private.admin_void_sale(uuid,text) from authenticated, anon;
revoke all on function private.admin_void_payment(uuid,text) from authenticated, anon;
revoke all on function private.admin_void_return(uuid,text) from authenticated, anon;
