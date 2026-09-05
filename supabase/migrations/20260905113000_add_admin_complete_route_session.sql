BEGIN;

CREATE OR REPLACE FUNCTION private.admin_complete_route_session(
  p_session_id uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.route_sessions%ROWTYPE;
  v_completed_at timestamptz;
BEGIN
  IF NOT COALESCE((SELECT private.is_admin()), false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_session_id IS NULL OR p_driver_id IS NULL THEN
    RAISE EXCEPTION 'Session and driver are required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.route_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route session not found';
  END IF;

  IF v_session.driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'Route session is not assigned to the selected driver';
  END IF;

  IF v_session.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Only active or paused route sessions can be completed';
  END IF;

  v_completed_at := now();

  UPDATE public.route_sessions
  SET status = 'completed',
      completed_at = v_completed_at,
      stopped_by = (SELECT auth.uid())::text
  WHERE id = p_session_id
    AND driver_id = p_driver_id;

  RETURN jsonb_build_object(
    'id', p_session_id,
    'driver_id', p_driver_id,
    'status', 'completed',
    'completed_at', v_completed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_route_session(
  p_session_id uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_complete_route_session(p_session_id, p_driver_id);
$$;

REVOKE ALL ON FUNCTION public.admin_complete_route_session(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_route_session(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.admin_complete_route_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_complete_route_session(uuid, uuid) TO authenticated;

COMMIT;
