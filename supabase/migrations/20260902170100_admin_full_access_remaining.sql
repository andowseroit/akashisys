BEGIN;

CREATE POLICY "Admins full access bank deposits"
ON public.bank_deposits
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins full access corrections"
ON public.corrections
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins full access driver accounts"
ON public.driver_accounts
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins full access outstanding settlements"
ON public.outstanding_settlements
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMIT;