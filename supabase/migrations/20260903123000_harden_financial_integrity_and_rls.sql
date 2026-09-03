-- Financial data must not accept zero/negative monetary or quantity values.
ALTER TABLE public.sales ADD CONSTRAINT sales_unit_price_nonnegative CHECK (unit_price >= 0);
ALTER TABLE public.sales ADD CONSTRAINT sales_total_amount_nonnegative CHECK (total_amount IS NULL OR total_amount >= 0);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE public.returns ADD CONSTRAINT returns_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.returns ADD CONSTRAINT returns_unit_price_nonnegative CHECK (unit_price >= 0);
ALTER TABLE public.returns ADD CONSTRAINT returns_total_loss_nonnegative CHECK (total_loss IS NULL OR total_loss >= 0);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);

-- Foreign-key indexes used heavily by RLS and reporting.
CREATE INDEX IF NOT EXISTS idx_sales_session_id ON public.sales(session_id);
CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON public.sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON public.sales(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON public.payments(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop_id ON public.payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_returns_session_id ON public.returns(session_id);
CREATE INDEX IF NOT EXISTS idx_returns_shop_id ON public.returns(shop_id);
CREATE INDEX IF NOT EXISTS idx_returns_product_id ON public.returns(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_session_id ON public.expenses(session_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_driver_id ON public.bank_deposits(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_accounts_auth_user_id ON public.driver_accounts(auth_user_id);

-- Avoid re-evaluating auth.uid() for every row under RLS.
ALTER POLICY "Drivers can manage own deposits" ON public.bank_deposits
  USING ((driver_id = (select auth.uid())) OR private.is_admin())
  WITH CHECK ((driver_id = (select auth.uid())) OR private.is_admin());

ALTER POLICY "Drivers can manage own expenses" ON public.expenses
  USING ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin())
  WITH CHECK ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can manage own payments" ON public.payments
  USING ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin())
  WITH CHECK ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can manage own returns" ON public.returns
  USING ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin())
  WITH CHECK ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can view own sessions" ON public.route_sessions
  USING ((driver_id = (select auth.uid())) OR private.is_admin());

ALTER POLICY "Drivers can insert own sales" ON public.sales
  WITH CHECK ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can view own sales" ON public.sales
  USING ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can insert own truck loads" ON public.truck_loads
  WITH CHECK ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());

ALTER POLICY "Drivers can view own truck loads" ON public.truck_loads
  USING ((session_id IN (SELECT rs.id FROM public.route_sessions rs WHERE rs.driver_id = (select auth.uid()))) OR private.is_admin());
