BEGIN;

-- ============================================================
-- 1. Add the new correction/audit action types
-- ============================================================

ALTER TABLE public.corrections
  DROP CONSTRAINT IF EXISTS corrections_action_check;

ALTER TABLE public.corrections
  ADD CONSTRAINT corrections_action_check
  CHECK (
    action = ANY (
      ARRAY[
        'edit',
        'delete',
        'add',
        'void',
        'reassign_route_session',
        'reopen_route_session',
        'correct_truck_load'
      ]
    )
  );


-- ============================================================
-- 2. Harden route-session lifecycle protection
--
-- Allowed lifecycle:
--   pending -> active
--   active  -> paused
--   paused  -> active
--   active/paused -> completed
--   completed -> active ONLY through the controlled
--                  admin reopen RPC
--
-- IMPORTANT:
-- Reopening preserves the original started_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_session_reset_after_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Existing privileged migration/admin mechanism.
  -- Preserve this compatibility path.
  IF current_user = 'route_session_admin' THEN
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------
  -- Completed sessions are immutable except for the controlled
  -- admin reopen operation.
  -- ----------------------------------------------------------
  IF OLD.status = 'completed' THEN

    IF current_setting(
         'akashisys.admin_reopen_route_session',
         true
       ) = 'on'
       AND NEW.status = 'active'
       AND NEW.started_at IS NOT DISTINCT FROM OLD.started_at
       AND NEW.completed_at IS NULL
    THEN
      RETURN NEW;
    END IF;

    IF NEW.status <> OLD.status
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    THEN
      RAISE EXCEPTION
        'A completed route session is immutable'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;


  -- ----------------------------------------------------------
  -- pending -> active
  -- ----------------------------------------------------------
  IF OLD.status = 'pending'
     AND NEW.status = 'active'
  THEN
    IF NEW.started_at IS NULL
       OR NEW.completed_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Starting a route session requires started_at and no completed_at'
        USING ERRCODE = 'P0001';
    END IF;


  -- ----------------------------------------------------------
  -- active -> paused
  -- ----------------------------------------------------------
  ELSIF OLD.status = 'active'
        AND NEW.status = 'paused'
  THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Pausing a route session cannot alter its start time'
        USING ERRCODE = 'P0001';
    END IF;


  -- ----------------------------------------------------------
  -- paused -> active
  -- ----------------------------------------------------------
  ELSIF OLD.status = 'paused'
        AND NEW.status = 'active'
  THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NOT NULL
    THEN
      RAISE EXCEPTION
        'Resuming a route session cannot alter its start time'
        USING ERRCODE = 'P0001';
    END IF;


  -- ----------------------------------------------------------
  -- active/paused -> completed
  -- ----------------------------------------------------------
  ELSIF (
    OLD.status = 'active'
    OR OLD.status = 'paused'
  )
  AND NEW.status = 'completed'
  THEN

    IF OLD.started_at IS NULL
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NULL
    THEN
      RAISE EXCEPTION
        'Completing a route session requires its original start time and a completion time'
        USING ERRCODE = 'P0001';
    END IF;


    -- Prevent completion when the recorded stock has already
    -- been oversold or over-returned.
    IF EXISTS (
      SELECT 1
      FROM public.truck_loads tl
      WHERE tl.session_id = OLD.id
        AND (
          (
            tl.quantity_loaded
            - COALESCE(
                (
                  SELECT SUM(s.quantity)
                  FROM public.sales s
                  WHERE s.session_id = OLD.id
                    AND s.product_id = tl.product_id
                    AND s.voided_at IS NULL
                ),
                0
              )
            - COALESCE(
                (
                  SELECT SUM(r.quantity)
                  FROM public.returns r
                  WHERE r.session_id = OLD.id
                    AND r.product_id = tl.product_id
                    AND r.voided_at IS NULL
                ),
                0
              )
          ) < 0

          OR

          COALESCE(
            (
              SELECT SUM(r.quantity)
              FROM public.returns r
              WHERE r.session_id = OLD.id
                AND r.product_id = tl.product_id
                AND r.voided_at IS NULL
            ),
            0
          ) > tl.quantity_loaded
        )
    )
    THEN
      RAISE EXCEPTION
        'Cannot complete route session while stock reconciliation has an over-sold or over-returned discrepancy'
        USING ERRCODE = 'P0001';
    END IF;


  -- ----------------------------------------------------------
  -- Any other status transition is invalid.
  -- ----------------------------------------------------------
  ELSIF OLD.status <> NEW.status THEN
    RAISE EXCEPTION
      'Invalid route session status transition: % -> %',
      OLD.status,
      NEW.status
      USING ERRCODE = 'P0001';


  -- ----------------------------------------------------------
  -- Prevent timestamp edits outside valid lifecycle changes.
  -- ----------------------------------------------------------
  ELSIF NEW.started_at IS DISTINCT FROM OLD.started_at
        OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
  THEN
    RAISE EXCEPTION
      'Route session timestamps cannot be edited outside a valid state transition'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 3. Controlled admin reopen implementation
--
-- SECURITY DEFINER is intentional here because the operation
-- must bypass the normal completed-session immutability guard.
-- Authorization is still checked inside the function.
-- ============================================================

CREATE OR REPLACE FUNCTION private.admin_reopen_route_session(
  p_session_id uuid,
  p_admin_id uuid,
  p_target_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.route_sessions%ROWTYPE;
  v_correction_id uuid;
BEGIN

  -- ----------------------------------------------------------
  -- Only ACTIVE is allowed.
  -- Never allow completed -> pending.
  -- ----------------------------------------------------------
  IF p_target_status <> 'active' THEN
    RAISE EXCEPTION
      'Completed sessions can only be reopened to active'
      USING ERRCODE = 'P0001';
  END IF;


  IF p_session_id IS NULL
     OR p_admin_id IS NULL
  THEN
    RAISE EXCEPTION
      'Session and admin are required'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Verify administrator identity.
  -- ----------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_admin_id
      AND p.role = 'admin'
  )
  THEN
    RAISE EXCEPTION
      'Admin access required'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Lock the session to prevent concurrent reopen/complete
  -- operations.
  -- ----------------------------------------------------------
  SELECT *
  INTO v_session
  FROM public.route_sessions
  WHERE id = p_session_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Route session not found'
      USING ERRCODE = 'P0001';
  END IF;


  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION
      'Only completed route sessions can be reopened'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Record the administrative correction BEFORE changing data.
  -- ----------------------------------------------------------
  INSERT INTO public.corrections (
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
    'reopen_route_session',
    to_jsonb(v_session),
    jsonb_build_object(
      'id', v_session.id,
      'driver_id', v_session.driver_id,
      'session_date', v_session.session_date,
      'status', 'active',
      'started_at', v_session.started_at,
      'completed_at', NULL,
      'stopped_by', NULL
    ),
    p_admin_id::text,
    'Admin reopened completed route session'
  )
  RETURNING id
  INTO v_correction_id;


  -- ----------------------------------------------------------
  -- Transaction-local permission for the lifecycle trigger.
  --
  -- This does NOT allow completed -> pending.
  -- It allows only completed -> active while preserving
  -- the original started_at.
  -- ----------------------------------------------------------
  PERFORM set_config(
    'akashisys.admin_reopen_route_session',
    'on',
    true
  );


  -- ----------------------------------------------------------
  -- Reopen the session.
  --
  -- IMPORTANT:
  -- started_at is intentionally NOT modified.
  -- ----------------------------------------------------------
  UPDATE public.route_sessions
  SET status = 'active',
      completed_at = NULL,
      paused_at = NULL,
      stopped_by = NULL
  WHERE id = v_session.id;


  RETURN jsonb_build_object(
    'success', true,
    'id', v_session.id,
    'driver_id', v_session.driver_id,
    'session_date', v_session.session_date,
    'previous_status', 'completed',
    'status', 'active',
    'started_at', v_session.started_at,
    'correction_id', v_correction_id
  );
END;
$$;


-- ============================================================
-- 4. Public reopen wrapper
--
-- The privileged implementation remains private.
-- The public wrapper is invoker security.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_reopen_route_session(
  p_session_id uuid,
  p_admin_id uuid,
  p_target_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_reopen_route_session(
    p_session_id,
    p_admin_id,
    p_target_status
  );
$$;


-- ============================================================
-- 5. Truck-load mutation guard
--
-- Normal users cannot alter quantity_loaded after the route
-- starts.
--
-- The controlled admin correction RPC temporarily enables:
--
--   akashisys.admin_correct_truck_load = on
--
-- This remains transaction-local.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_truck_load_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  session_status text;
BEGIN

  SELECT rs.status
  INTO session_status
  FROM public.route_sessions rs
  WHERE rs.id = COALESCE(new.session_id, old.session_id)
  FOR SHARE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Route session does not exist'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- DELETE
  -- ----------------------------------------------------------
  IF TG_OP = 'DELETE' THEN

    IF session_status <> 'pending' THEN
      RAISE EXCEPTION
        'Truck loads cannot be deleted after the route starts'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN old;
  END IF;


  -- ----------------------------------------------------------
  -- INSERT
  -- ----------------------------------------------------------
  IF TG_OP = 'INSERT' THEN

    IF session_status <> 'pending' THEN
      RAISE EXCEPTION
        'Truck loads can only be added before the route starts'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN new;
  END IF;


  -- ----------------------------------------------------------
  -- Never change the identity of a saved load.
  -- ----------------------------------------------------------
  IF old.session_id IS DISTINCT FROM new.session_id
     OR old.product_id IS DISTINCT FROM new.product_id
  THEN
    RAISE EXCEPTION
      'Loaded stock identity cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- quantity_loaded may only change through the controlled
  -- admin correction RPC.
  -- ----------------------------------------------------------
  IF old.quantity_loaded IS DISTINCT FROM new.quantity_loaded THEN

    IF current_setting(
         'akashisys.admin_correct_truck_load',
         true
       ) <> 'on'
    THEN
      RAISE EXCEPTION
        'Loaded stock quantity can only be changed through the admin correction RPC'
        USING ERRCODE = 'P0001';
    END IF;

  END IF;


  -- ----------------------------------------------------------
  -- Completed stock remains immutable.
  -- ----------------------------------------------------------
  IF session_status = 'completed' THEN

    IF old.quantity_returned IS DISTINCT FROM new.quantity_returned
       OR old.quantity_loaded IS DISTINCT FROM new.quantity_loaded
    THEN
      RAISE EXCEPTION
        'Completed route stock is immutable'
        USING ERRCODE = 'P0001';
    END IF;


  ELSIF session_status NOT IN (
    'pending',
    'active',
    'paused'
  )
  THEN
    RAISE EXCEPTION
      'Invalid route session status'
      USING ERRCODE = 'P0001';
  END IF;


  RETURN new;
END;
$$;


-- ============================================================
-- 6. Controlled admin truck-load correction
--
-- This edits an EXISTING truck-load row.
--
-- It does NOT:
--   - create a new load
--   - delete a load
--   - alter product identity
--   - alter session identity
--   - modify completed sessions
--
-- New quantity cannot be lower than:
--
--   sold quantity + returned quantity
-- ============================================================

CREATE OR REPLACE FUNCTION private.admin_correct_truck_load(
  p_session_id uuid,
  p_product_id uuid,
  p_quantity_loaded integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.route_sessions%ROWTYPE;
  v_record public.truck_loads%ROWTYPE;
  v_correction_id uuid;
  v_sold_qty integer;
  v_returned_qty integer;
  v_user uuid := (SELECT auth.uid());
BEGIN

  -- ----------------------------------------------------------
  -- Admin authorization.
  -- ----------------------------------------------------------
  IF NOT COALESCE(
    (SELECT private.is_admin()),
    false
  )
  THEN
    RAISE EXCEPTION
      'Admin access required'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- A correction must always have a reason.
  -- ----------------------------------------------------------
  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION
      'Truck load correction reason is required'
      USING ERRCODE = 'P0001';
  END IF;


  IF p_session_id IS NULL
     OR p_product_id IS NULL
  THEN
    RAISE EXCEPTION
      'Session and product are required'
      USING ERRCODE = 'P0001';
  END IF;


  IF p_quantity_loaded IS NULL
     OR p_quantity_loaded <= 0
  THEN
    RAISE EXCEPTION
      'Loaded quantity must be greater than zero'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Lock the route session.
  -- ----------------------------------------------------------
  SELECT *
  INTO v_session
  FROM public.route_sessions
  WHERE id = p_session_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Route session not found'
      USING ERRCODE = 'P0001';
  END IF;


  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION
      'Completed route session stock is immutable'
      USING ERRCODE = 'P0001';
  END IF;


  IF v_session.status NOT IN (
    'pending',
    'active',
    'paused'
  )
  THEN
    RAISE EXCEPTION
      'Route session has an invalid lifecycle status'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Product must still be active.
  -- ----------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.is_active = true
  )
  THEN
    RAISE EXCEPTION
      'Active product not found'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Lock the existing truck-load row.
  -- ----------------------------------------------------------
  SELECT *
  INTO v_record
  FROM public.truck_loads
  WHERE session_id = p_session_id
    AND product_id = p_product_id
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Truck load row not found. Add new products before starting the route'
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Calculate already-sold quantity.
  -- ----------------------------------------------------------
  SELECT COALESCE(
    SUM(s.quantity),
    0
  )::integer
  INTO v_sold_qty
  FROM public.sales s
  WHERE s.session_id = p_session_id
    AND s.product_id = p_product_id
    AND s.voided_at IS NULL;


  -- ----------------------------------------------------------
  -- Calculate already-returned quantity.
  -- ----------------------------------------------------------
  SELECT COALESCE(
    SUM(r.quantity),
    0
  )::integer
  INTO v_returned_qty
  FROM public.returns r
  WHERE r.session_id = p_session_id
    AND r.product_id = p_product_id
    AND r.voided_at IS NULL;


  -- ----------------------------------------------------------
  -- Never allow loaded quantity below stock already consumed
  -- by sales or returns.
  -- ----------------------------------------------------------
  IF p_quantity_loaded < v_sold_qty + v_returned_qty THEN
    RAISE EXCEPTION
      'Loaded quantity cannot be less than already sold plus returned quantity (%)',
      v_sold_qty + v_returned_qty
      USING ERRCODE = 'P0001';
  END IF;


  -- ----------------------------------------------------------
  -- Temporarily permit the trigger to accept the controlled
  -- quantity correction.
  -- Transaction-local only.
  -- ----------------------------------------------------------
  PERFORM set_config(
    'akashisys.admin_correct_truck_load',
    'on',
    true
  );


  -- ----------------------------------------------------------
  -- Update the existing row.
  -- ----------------------------------------------------------
  UPDATE public.truck_loads
  SET quantity_loaded = p_quantity_loaded,
      updated_at = now()
  WHERE id = v_record.id;


  -- ----------------------------------------------------------
  -- Record the correction AFTER the successful update.
  -- ----------------------------------------------------------
  INSERT INTO public.corrections (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    corrected_by,
    reason
  )
  VALUES (
    'truck_loads',
    v_record.id,
    'correct_truck_load',
    to_jsonb(v_record),
    (
      SELECT to_jsonb(tl)
      FROM public.truck_loads tl
      WHERE tl.id = v_record.id
    ),
    COALESCE(
      v_user::text,
      'admin'
    ),
    trim(p_reason)
  )
  RETURNING id
  INTO v_correction_id;


  RETURN v_correction_id;
END;
$$;


-- ============================================================
-- 7. Public truck-load correction wrapper
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_correct_truck_load(
  p_session_id uuid,
  p_product_id uuid,
  p_quantity_loaded integer,
  p_reason text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_correct_truck_load(
    p_session_id,
    p_product_id,
    p_quantity_loaded,
    p_reason
  );
$$;


-- ============================================================
-- 8. Function permissions
-- ============================================================

REVOKE ALL ON FUNCTION
  private.admin_reopen_route_session(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.admin_reopen_route_session(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.guard_truck_load_mutation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  private.admin_correct_truck_load(uuid, uuid, integer, text)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
  public.admin_correct_truck_load(uuid, uuid, integer, text)
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE ON FUNCTION
  private.admin_reopen_route_session(uuid, uuid, text)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_reopen_route_session(uuid, uuid, text)
TO service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_correct_truck_load(uuid, uuid, integer, text)
TO authenticated;


COMMIT;