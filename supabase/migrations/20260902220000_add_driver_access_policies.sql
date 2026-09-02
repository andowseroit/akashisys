BEGIN;

-- ==========================
-- TRUCK LOADS
-- ==========================

CREATE POLICY "Drivers can view own truck loads"
ON public.truck_loads
FOR SELECT
TO authenticated
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);


CREATE POLICY "Drivers can insert own truck loads"
ON public.truck_loads
FOR INSERT
TO authenticated
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);


-- ==========================
-- PAYMENTS
-- ==========================

CREATE POLICY "Drivers can manage own payments"
ON public.payments
FOR ALL
TO authenticated
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
)
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);


-- ==========================
-- RETURNS
-- ==========================

CREATE POLICY "Drivers can manage own returns"
ON public.returns
FOR ALL
TO authenticated
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
)
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);


-- ==========================
-- EXPENSES
-- ==========================

CREATE POLICY "Drivers can manage own expenses"
ON public.expenses
FOR ALL
TO authenticated
USING (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
)
WITH CHECK (
  session_id IN (
    SELECT id
    FROM public.route_sessions
    WHERE driver_id = auth.uid()
  )
  OR private.is_admin()
);


-- ==========================
-- BANK DEPOSITS
-- ==========================

CREATE POLICY "Drivers can manage own deposits"
ON public.bank_deposits
FOR ALL
TO authenticated
USING (
  driver_id = auth.uid()
  OR private.is_admin()
)
WITH CHECK (
  driver_id = auth.uid()
  OR private.is_admin()
);


COMMIT;