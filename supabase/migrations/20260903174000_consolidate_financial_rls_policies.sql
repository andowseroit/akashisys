drop policy if exists "Admins can delete sales" on public.sales;
drop policy if exists "Admins can update sales" on public.sales;
drop policy if exists "Authenticated can insert allowed sales" on public.sales;
drop policy if exists "Authenticated can view allowed sales" on public.sales;
drop policy if exists "Authenticated can manage allowed payments" on public.payments;
drop policy if exists "Authenticated can manage allowed returns" on public.returns;
drop policy if exists "Authenticated can manage allowed expenses" on public.expenses;

create policy "Authenticated can insert allowed sales" on public.sales for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can view allowed sales" on public.sales for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can insert allowed payments" on public.payments for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can view allowed payments" on public.payments for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can insert allowed returns" on public.returns for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can view allowed returns" on public.returns for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can insert allowed expenses" on public.expenses for insert to authenticated with check ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
create policy "Authenticated can view allowed expenses" on public.expenses for select to authenticated using ((session_id in (select rs.id from public.route_sessions rs where rs.driver_id = (select auth.uid()))) or private.is_admin());
