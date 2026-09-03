BEGIN;

-- Helper function to check admin role safely
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;


-- Remove old policies

DROP POLICY IF EXISTS "Admins have full access to expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins have full access to payments" ON public.payments;
DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins have full access to returns" ON public.returns;
DROP POLICY IF EXISTS "Admins have full access to sales" ON public.sales;


-- Admin policies

CREATE POLICY "Admins full access expenses"
ON public.expenses
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


CREATE POLICY "Admins full access payments"
ON public.payments
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


CREATE POLICY "Admins full access sales"
ON public.sales
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


CREATE POLICY "Admins full access products"
ON public.products
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


CREATE POLICY "Admins full access shops"
ON public.shops
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


CREATE POLICY "Admins full access profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


COMMIT;