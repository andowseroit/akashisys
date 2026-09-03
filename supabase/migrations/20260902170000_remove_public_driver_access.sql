BEGIN;

-- Remove old public driver policies

DROP POLICY IF EXISTS "Drivers can view own sessions"
ON public.route_sessions;

DROP POLICY IF EXISTS "Drivers can view own sales"
ON public.sales;

DROP POLICY IF EXISTS "Drivers can insert own sales"
ON public.sales;


-- Drivers must be authenticated

CREATE POLICY "Drivers can view own sessions"
ON public.route_sessions
FOR SELECT
TO authenticated
USING (
  driver_id = auth.uid()
  OR public.is_admin()
);


CREATE POLICY "Drivers can view own sales"
ON public.sales
FOR SELECT
TO authenticated
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR public.is_admin()
);


CREATE POLICY "Drivers can insert own sales"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR public.is_admin()
);


-- Remove development PIN bypass

DROP POLICY IF EXISTS "anon_select_by_pin"
ON public.users;

DROP POLICY IF EXISTS "anon_select_by_pin_dev"
ON public.users;


COMMIT;