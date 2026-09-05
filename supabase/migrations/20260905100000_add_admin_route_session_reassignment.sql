BEGIN;

-- Route-session ownership changes are explicit corrections, separate from lifecycle actions.
ALTER TABLE public.corrections
  DROP CONSTRAINT IF EXISTS corrections_action_check;

ALTER TABLE public.corrections
  ADD CONSTRAINT corrections_action_check
  CHECK (action = ANY (ARRAY['edit', 'delete', 'add', 'void', 'reassign_route_session']));

CREATE OR REPLACE FUNCTION private.admin_reassign_route_session(
  p_session_id uuid,
  p_target_driver_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.route_sessions%ROWTYPE;
  v_correction_id uuid;
  v_sales_count bigint;
  v_payments_count bigint;
  v_returns_count bigint;
  v_expenses_count bigint;
  v_truck_loads_count bigint;
BEGIN
  IF NOT COALESCE((SELECT private.is_admin()), false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Reassignment reason is required';
  END IF;

  IF p_session_id IS NULL OR p_target_driver_id IS NULL THEN
    RAISE EXCEPTION 'Session and target driver are required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.route_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route session not found';
  END IF;

  IF v_session.status NOT IN ('pending', 'active', 'paused', 'completed') THEN
    RAISE EXCEPTION 'Route session has an invalid lifecycle status';
  END IF;

  IF v_session.driver_id = p_target_driver_id THEN
    RAISE EXCEPTION 'Target driver already owns this route session';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.driver_accounts da ON da.auth_user_id = p.id
    WHERE p.id = p_target_driver_id
      AND p.role = 'driver'
      AND da.auth_user_id = p.id
      AND da.is_active = true
  ) THEN
    RAISE EXCEPTION 'Target must be an active driver account linked to a driver profile';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.route_sessions rs
    WHERE rs.driver_id = p_target_driver_id
      AND rs.session_date = v_session.session_date
      AND rs.id <> v_session.id
  ) THEN
    RAISE EXCEPTION 'Target driver already has a route session for this date';
  END IF;

  SELECT count(*) INTO v_sales_count FROM public.sales WHERE session_id = v_session.id;
  SELECT count(*) INTO v_payments_count FROM public.payments WHERE session_id = v_session.id;
  SELECT count(*) INTO v_returns_count FROM public.returns WHERE session_id = v_session.id;
  SELECT count(*) INTO v_expenses_count FROM public.expenses WHERE session_id = v_session.id;
  SELECT count(*) INTO v_truck_loads_count FROM public.truck_loads WHERE session_id = v_session.id;

  INSERT INTO public.corrections(
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    corrected_by,
    reason
  )
  VALUES (
    'route_sessions',
    v_session.id,
    'reassign_route_session',
    jsonb_build_object(
      'id', v_session.id,
      'driver_id', v_session.driver_id,
      'session_date', v_session.session_date,
      'status', v_session.status,
      'sales_count', v_sales_count,
      'payments_count', v_payments_count,
      'returns_count', v_returns_count,
      'expenses_count', v_expenses_count,
      'truck_loads_count', v_truck_loads_count
    ),
    jsonb_build_object(
      'id', v_session.id,
      'driver_id', p_target_driver_id,
      'session_date', v_session.session_date,
      'status', v_session.status,
      'sales_count', v_sales_count,
      'payments_count', v_payments_count,
      'returns_count', v_returns_count,
      'expenses_count', v_expenses_count,
      'truck_loads_count', v_truck_loads_count
    ),
    (SELECT auth.uid())::text,
    trim(p_reason)
  )
  RETURNING id INTO v_correction_id;

  UPDATE public.route_sessions
  SET driver_id = p_target_driver_id
  WHERE id = v_session.id;

  RETURN v_correction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reassign_route_session(
  p_session_id uuid,
  p_target_driver_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_reassign_route_session(p_session_id, p_target_driver_id, p_reason);
$$;

REVOKE ALL ON FUNCTION public.admin_reassign_route_session(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_route_session(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION private.admin_reassign_route_session(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_reassign_route_session(uuid, uuid, text) TO authenticated;

COMMIT;
