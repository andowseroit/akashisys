BEGIN;

-- Private schema for security-sensitive helper functions.
CREATE SCHEMA IF NOT EXISTS private;

-- Create the admin-check helper outside the exposed public schema.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$;

-- Remove the default PUBLIC EXECUTE privilege.
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM anon;

-- RLS policies execute this helper as the authenticated user,
-- so authenticated needs EXECUTE permission.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- Update every policy that currently uses public.is_admin().

ALTER POLICY "Admins full access bank deposits"
ON public.bank_deposits
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access corrections"
ON public.corrections
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access driver accounts"
ON public.driver_accounts
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access expenses"
ON public.expenses
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access outstanding settlements"
ON public.outstanding_settlements
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access payments"
ON public.payments
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access product categories"
ON public.product_categories
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access products"
ON public.products
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access profiles"
ON public.profiles
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access returns"
ON public.returns
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Drivers can view own sessions"
ON public.route_sessions
USING (
  driver_id = auth.uid()
  OR private.is_admin()
);

ALTER POLICY "Admins full access sales"
ON public.sales
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Drivers can insert own sales"
ON public.sales
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);

ALTER POLICY "Drivers can view own sales"
ON public.sales
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);

ALTER POLICY "Admins full access session control"
ON public.session_control
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access shops"
ON public.shops
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access truck loads"
ON public.truck_loads
USING (private.is_admin())
WITH CHECK (private.is_admin());

ALTER POLICY "Admins full access users"
ON public.users
USING (private.is_admin())
WITH CHECK (private.is_admin());

-- The policies no longer depend on the old public helper.
DROP FUNCTION public.is_admin();

COMMIT;