-- Keep exposed correction wrappers SECURITY INVOKER; privileged work stays in private schema.
CREATE OR REPLACE FUNCTION public.admin_void_sale(p_sale_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_sale(p_sale_id,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_void_payment(p_payment_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_payment(p_payment_id,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_void_return(p_return_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ BEGIN RETURN private.admin_void_return(p_return_id,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_add_sale_correction(p_shop_id uuid,p_product_id uuid,p_quantity integer,p_sold_at timestamptz,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RETURN private.admin_add_sale_correction(p_shop_id,p_product_id,p_quantity,p_sold_at,p_reason); END; $$;
CREATE OR REPLACE FUNCTION public.admin_add_payment_correction(p_shop_id uuid,p_amount numeric,p_payment_type text,p_paid_at timestamptz,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RETURN private.admin_add_payment_correction(p_shop_id,p_amount,p_payment_type,p_paid_at,p_reason); END; $$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_void_sale(uuid,text), private.admin_void_payment(uuid,text), private.admin_void_return(uuid,text), private.admin_add_sale_correction(uuid,uuid,integer,timestamptz,text), private.admin_add_payment_correction(uuid,numeric,text,timestamptz,text) TO authenticated;
