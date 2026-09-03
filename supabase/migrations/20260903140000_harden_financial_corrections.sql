-- Financial correction guardrails: privileged, atomic admin RPCs.
-- Direct financial mutation from the client should not be used for corrections.

ALTER TABLE public.sales
  ADD CONSTRAINT sales_quantity_positive_check CHECK (quantity > 0),
  ADD CONSTRAINT sales_unit_price_nonnegative_check CHECK (unit_price >= 0),
  ADD CONSTRAINT sales_total_amount_nonnegative_check CHECK (total_amount IS NULL OR total_amount >= 0);

ALTER TABLE public.returns
  ADD CONSTRAINT returns_quantity_positive_check CHECK (quantity > 0),
  ADD CONSTRAINT returns_unit_price_nonnegative_check CHECK (unit_price >= 0),
  ADD CONSTRAINT returns_total_loss_nonnegative_check CHECK (total_loss IS NULL OR total_loss >= 0);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive_check CHECK (amount > 0);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_amount_positive_check CHECK (amount > 0);

ALTER TABLE public.outstanding_settlements
  ADD CONSTRAINT outstanding_settled_amount_positive_check CHECK (settled_amount > 0);

CREATE OR REPLACE FUNCTION private.admin_void_sale(p_sale_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record public.sales%rowtype; v_correction uuid;
BEGIN
  IF NOT COALESCE((SELECT private.is_admin()), false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
  SELECT * INTO v_record FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  INSERT INTO public.corrections(table_name, record_id, action, old_values, corrected_by, reason)
  VALUES ('sales', v_record.id, 'delete', to_jsonb(v_record), COALESCE((SELECT auth.uid())::text, 'admin'), trim(p_reason)) RETURNING id INTO v_correction;
  DELETE FROM public.sales WHERE id = v_record.id;
  RETURN v_correction;
END; $$;

CREATE OR REPLACE FUNCTION private.admin_void_payment(p_payment_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record public.payments%rowtype; v_correction uuid;
BEGIN
  IF NOT COALESCE((SELECT private.is_admin()), false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
  SELECT * INTO v_record FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  INSERT INTO public.corrections(table_name, record_id, action, old_values, corrected_by, reason)
  VALUES ('payments', v_record.id, 'delete', to_jsonb(v_record), COALESCE((SELECT auth.uid())::text, 'admin'), trim(p_reason)) RETURNING id INTO v_correction;
  DELETE FROM public.payments WHERE id = v_record.id;
  RETURN v_correction;
END; $$;

CREATE OR REPLACE FUNCTION private.admin_void_return(p_return_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record public.returns%rowtype; v_correction uuid;
BEGIN
  IF NOT COALESCE((SELECT private.is_admin()), false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
  SELECT * INTO v_record FROM public.returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
  INSERT INTO public.corrections(table_name, record_id, action, old_values, corrected_by, reason)
  VALUES ('returns', v_record.id, 'delete', to_jsonb(v_record), COALESCE((SELECT auth.uid())::text, 'admin'), trim(p_reason)) RETURNING id INTO v_correction;
  DELETE FROM public.returns WHERE id = v_record.id;
  RETURN v_correction;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_void_sale(p_sale_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_sale(p_sale_id,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_payment(p_payment_id,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_void_return(p_return_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_return(p_return_id,p_reason); END; $$;

CREATE OR REPLACE FUNCTION private.admin_add_sale_correction(p_shop_id uuid,p_product_id uuid,p_quantity integer,p_sold_at timestamptz,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_price numeric;
BEGIN
 IF NOT COALESCE((SELECT private.is_admin()),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
 IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
 SELECT price_per_unit INTO v_price FROM public.products WHERE id=p_product_id AND is_active=true;
 IF v_price IS NULL THEN RAISE EXCEPTION 'Active product not found'; END IF;
 INSERT INTO public.sales(shop_id,product_id,quantity,unit_price,total_amount,sold_at,synced) VALUES(p_shop_id,p_product_id,p_quantity,v_price,p_quantity*v_price,p_sold_at,true) RETURNING id INTO v_id;
 INSERT INTO public.corrections(table_name,record_id,action,new_values,corrected_by,reason) SELECT 'sales',id,'add',to_jsonb(s),COALESCE((SELECT auth.uid())::text,'admin'),trim(p_reason) FROM public.sales s WHERE s.id=v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION private.admin_add_payment_correction(p_shop_id uuid,p_amount numeric,p_payment_type text,p_paid_at timestamptz,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT COALESCE((SELECT private.is_admin()),false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Correction reason is required'; END IF;
 IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
 INSERT INTO public.payments(shop_id,amount,payment_type,notes,paid_at,synced) VALUES(p_shop_id,p_amount,COALESCE(NULLIF(trim(p_payment_type),''),'partial'),trim(p_reason),p_paid_at,true) RETURNING id INTO v_id;
 INSERT INTO public.corrections(table_name,record_id,action,new_values,corrected_by,reason) SELECT 'payments',id,'add',to_jsonb(p),COALESCE((SELECT auth.uid())::text,'admin'),trim(p_reason) FROM public.payments p WHERE p.id=v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_add_sale_correction(p_shop_id uuid,p_product_id uuid,p_quantity integer,p_sold_at timestamptz,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN private.admin_add_sale_correction(p_shop_id,p_product_id,p_quantity,p_sold_at,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_add_payment_correction(p_shop_id uuid,p_amount numeric,p_payment_type text,p_paid_at timestamptz,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN private.admin_add_payment_correction(p_shop_id,p_amount,p_payment_type,p_paid_at,p_reason); END; $$;

REVOKE ALL ON FUNCTION public.admin_void_sale(uuid,text), public.admin_void_payment(uuid,text), public.admin_void_return(uuid,text), public.admin_add_sale_correction(uuid,uuid,integer,timestamptz,text), public.admin_add_payment_correction(uuid,numeric,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_void_sale(uuid,text), public.admin_void_payment(uuid,text), public.admin_void_return(uuid,text), public.admin_add_sale_correction(uuid,uuid,integer,timestamptz,text), public.admin_add_payment_correction(uuid,numeric,text,timestamptz,text) TO authenticated;
