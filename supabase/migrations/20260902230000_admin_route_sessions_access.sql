BEGIN;

CREATE POLICY "Admins can insert route sessions"
ON public.route_sessions
FOR INSERT
TO authenticated
WITH CHECK ((select private.is_admin()));

CREATE POLICY "Admins can update route sessions"
ON public.route_sessions
FOR UPDATE
TO authenticated
USING ((select private.is_admin()))
WITH CHECK ((select private.is_admin()));

CREATE POLICY "Admins can delete route sessions"
ON public.route_sessions
FOR DELETE
TO authenticated
USING ((select private.is_admin()));

COMMIT;