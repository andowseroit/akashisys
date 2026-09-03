-- Consolidate overlapping admin + driver policies so each command has one permissive policy.
drop policy if exists "Admins full access bank deposits" on public.bank_deposits;
drop policy if exists "Drivers can manage own deposits" on public.bank_deposits;
create policy "Authenticated can manage allowed bank deposits" on public.bank_deposits for all to authenticated using ((driver_id = (select auth.uid())) or (select private.is_admin())) with check ((driver_id = (select auth.uid())) or (select private.is_admin()));

drop policy if exists "Admins full access expenses" on public.expenses;
drop policy if exists "Drivers can manage own expenses" on public.expenses;
create policy "Authenticated can manage allowed expenses" on public.expenses for all to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin())) with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));

drop policy if exists "Admins full access payments" on public.payments;
drop policy if exists "Drivers can manage own payments" on public.payments;
create policy "Authenticated can manage allowed payments" on public.payments for all to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin())) with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));

drop policy if exists "Admins full access returns" on public.returns;
drop policy if exists "Drivers can manage own returns" on public.returns;
create policy "Authenticated can manage allowed returns" on public.returns for all to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin())) with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));

drop policy if exists "Admins full access sales" on public.sales;
drop policy if exists "Drivers can insert own sales" on public.sales;
drop policy if exists "Drivers can view own sales" on public.sales;
create policy "Authenticated can view allowed sales" on public.sales for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));
create policy "Authenticated can insert allowed sales" on public.sales for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));
create policy "Admins can update sales" on public.sales for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete sales" on public.sales for delete to authenticated using ((select private.is_admin()));

drop policy if exists "Admins full access truck loads" on public.truck_loads;
drop policy if exists "Drivers can insert own truck loads" on public.truck_loads;
drop policy if exists "Drivers can view own truck loads" on public.truck_loads;
create policy "Authenticated can view allowed truck loads" on public.truck_loads for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));
create policy "Authenticated can insert allowed truck loads" on public.truck_loads for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or (select private.is_admin()));
create policy "Admins can update truck loads" on public.truck_loads for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete truck loads" on public.truck_loads for delete to authenticated using ((select private.is_admin()));