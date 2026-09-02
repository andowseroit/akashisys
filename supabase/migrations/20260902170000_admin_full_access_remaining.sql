BEGIN;

CREATE POLICY "Admins full access bank deposits"
ON public.bank_deposits
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1
   FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access corrections"
ON public.corrections
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access driver accounts"
ON public.driver_accounts
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access outstanding settlements"
ON public.outstanding_settlements
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access product categories"
ON public.product_categories
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access returns"
ON public.returns
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access session control"
ON public.session_control
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


CREATE POLICY "Admins full access truck loads"
ON public.truck_loads
FOR ALL
TO authenticated
USING (
 EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id = auth.uid()
   AND role='admin'
 )
);


COMMIT;