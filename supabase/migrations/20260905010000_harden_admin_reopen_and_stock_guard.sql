BEGIN;

-- This migration is additive and intentionally does not rewrite historical data.
-- Production currently has migration history that is ahead of this repository;
-- see docs/production-migration-drift.md for the reconciliation record.

-- -----------------------------------------------------------------------------
-- 1. Remove the user-settable lifecycle override design.
-- -----------------------------------------------------------------------------
-- Use a dedicated NOLOGIN role as the effective execution identity for the one
-- privileged lifecycle operation. No application role is granted membership in
-- this role, so it cannot be reached with SET ROLE from a client connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'route_session_admin') THEN
    CREATE ROLE route_session_admin
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOLOGIN
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO route_session_admin;
GRANT USAGE ON SCHEMA private TO route_session_admin;

-- The owner change below requires CREATE on the function's schema. Remove it
-- immediately after ownership is transferred so the role has no object-creation
-- capability in public during normal execution.
GRANT CREATE ON SCHEMA public TO route_session_admin;

-- -----------------------------------------------------------------------------
-- 2. Harden the route-session trigger: only the dedicated server-side role may
--    perform the exceptional completed -> active/pending transition.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_session_reset_after_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  -- There is deliberately no custom GUC or client-controllable override.
  -- SECURITY DEFINER execution of public.admin_reopen_route_session changes
  -- current_user to route_session_admin for the exceptional UPDATE.
  IF current_user = 'route_session_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    IF NEW.status <> OLD.status
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'A completed route session is immutable'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    IF NEW.started_at IS NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Starting a route session requires started_at and no completed_at'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF OLD.status = 'active' AND NEW.status = 'paused' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Pausing a route session cannot alter its start time'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF OLD.status = 'paused' AND NEW.status = 'active' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Resuming a route session cannot alter its start time'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF (OLD.status = 'active' OR OLD.status = 'paused') AND NEW.status = 'completed' THEN
    IF OLD.started_at IS NULL
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'Completing a route session requires its original start time and a completion time'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.truck_loads tl
      WHERE tl.session_id = OLD.id
        AND (
          tl.quantity_loaded
          - COALESCE((
              SELECT SUM(s.quantity)
              FROM public.sales s
              WHERE s.session_id = OLD.id
                AND s.product_id = tl.product_id
                AND s.voided_at IS NULL
            ), 0)
          - COALESCE((
              SELECT SUM(r.quantity)
              FROM public.returns r
              WHERE r.session_id = OLD.id
                AND r.product_id = tl.product_id
                AND r.voided_at IS NULL
            ), 0) < 0
          OR COALESCE((
              SELECT SUM(r.quantity)
              FROM public.returns r
              WHERE r.session_id = OLD.id
                AND r.product_id = tl.product_id
                AND r.voided_at IS NULL
            ), 0) > tl.quantity_loaded
        )
    ) THEN
      RAISE EXCEPTION 'Cannot complete route session while stock reconciliation has an over-sold or over-returned discrepancy'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF OLD.status <> NEW.status THEN
    RAISE EXCEPTION 'Invalid route session status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  ELSIF NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Route session timestamps cannot be edited outside a valid state transition'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Private helpers used only by the dedicated admin execution role.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.route_session_has_nonvoided_financial(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales WHERE session_id = p_session_id AND voided_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.payments WHERE session_id = p_session_id AND voided_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.returns WHERE session_id = p_session_id AND voided_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.expenses WHERE session_id = p_session_id AND voided_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION private.route_session_has_truck_loads(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.truck_loads WHERE session_id = p_session_id);
$$;

REVOKE ALL ON FUNCTION private.route_session_has_nonvoided_financial(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.route_session_has_truck_loads(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.route_session_has_nonvoided_financial(uuid) TO route_session_admin;
GRANT EXECUTE ON FUNCTION private.route_session_has_truck_loads(uuid) TO route_session_admin;
GRANT EXECUTE ON FUNCTION private.is_admin() TO route_session_admin;

-- -----------------------------------------------------------------------------
-- 4. Rebuild the admin reopen RPC without app.admin_session_override.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reopen_route_session(
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
  v_session public.route_sessions;
  v_admin_exists boolean;
  v_caller_id uuid := (SELECT auth.uid());
  v_new_started timestamptz;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator identity is required' USING ERRCODE = 'P0001';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id <> p_admin_id THEN
    RAISE EXCEPTION 'Administrator identity mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_admin_id
      AND role = 'admin'
  ) INTO v_admin_exists;

  IF NOT v_admin_exists THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'P0001';
  END IF;

  IF p_target_status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'Invalid target status. Must be active or pending' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session
  FROM public.route_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route session not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.status <> 'completed' THEN
    RAISE EXCEPTION 'Session can only be reopened from completed status' USING ERRCODE = 'P0001';
  END IF;

  -- A pending reset is only safe when no financial records remain active and
  -- no truck-load stock history would become editable. Corrections are audit
  -- records and do not themselves block the reset.
  IF p_target_status = 'pending' THEN
    IF private.route_session_has_nonvoided_financial(p_session_id) THEN
      RAISE EXCEPTION 'Cannot reset a completed session to pending while non-voided financial records exist; reopen it as active instead'
        USING ERRCODE = 'P0001';
    END IF;

    IF private.route_session_has_truck_loads(p_session_id) THEN
      RAISE EXCEPTION 'Cannot reset a completed session to pending while truck-load stock history exists; reopen it as active instead'
        USING ERRCODE = 'P0001';
    END IF;

    v_new_started := NULL;
  ELSE
    v_new_started := COALESCE(v_session.started_at, now());
  END IF;

  UPDATE public.route_sessions
  SET status = p_target_status,
      started_at = v_new_started,
      completed_at = NULL,
      paused_at = NULL,
      stopped_by = NULL,
      notes = COALESCE(notes, '')
        || chr(10)
        || '[Admin reopen: ' || p_target_status
        || ' by ' || p_admin_id::text
        || ' at ' || now()::text || ']'
  WHERE id = p_session_id;

  -- Record the exceptional lifecycle change in the existing corrections audit
  -- table. This does not alter financial records.
  INSERT INTO public.corrections(
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    corrected_by,
    reason
  ) VALUES (
    'route_sessions',
    p_session_id,
    'edit',
    jsonb_build_object('status', v_session.status, 'started_at', v_session.started_at, 'completed_at', v_session.completed_at),
    jsonb_build_object('status', p_target_status, 'started_at', v_new_started, 'completed_at', NULL),
    p_admin_id::text,
    'Administrative route-session recovery; financial records preserved'
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'previous_status', v_session.status,
    'new_status', p_target_status,
    'financial_records_preserved', true
  );
END;
$$;

ALTER FUNCTION public.admin_reopen_route_session(uuid, uuid, text) OWNER TO route_session_admin;
REVOKE ALL ON FUNCTION public.admin_reopen_route_session(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reopen_route_session(uuid, uuid, text) TO service_role;

-- Remove the temporary schema-creation privilege after ownership transfer.
REVOKE CREATE ON SCHEMA public FROM route_session_admin;

-- Route-session access for the non-login definer role. These policies do not
-- grant any application role access because route_session_admin has no login and
-- no membership is granted to it.
GRANT SELECT, UPDATE ON public.route_sessions TO route_session_admin;
DROP POLICY IF EXISTS route_session_admin_select ON public.route_sessions;
CREATE POLICY route_session_admin_select
  ON public.route_sessions
  FOR SELECT
  TO route_session_admin
  USING (true);
DROP POLICY IF EXISTS route_session_admin_update ON public.route_sessions;
CREATE POLICY route_session_admin_update
  ON public.route_sessions
  FOR UPDATE
  TO route_session_admin
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. Database-enforced oversell protection with row serialization.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sale_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_loaded integer;
  v_sold integer;
  v_returned integer;
BEGIN
  -- Voided rows do not consume stock. This also keeps the trigger harmless for
  -- any future server-side insert path that creates an already-voided row.
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize all sales for the same session/product on the authoritative
  -- truck-load row. This prevents two concurrent inserts from both observing
  -- the same remaining quantity.
  SELECT tl.quantity_loaded
    INTO v_loaded
  FROM public.truck_loads tl
  WHERE tl.session_id = NEW.session_id
    AND tl.product_id = NEW.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No truck load exists for this session and product'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(s.quantity), 0)
    INTO v_sold
  FROM public.sales s
  WHERE s.session_id = NEW.session_id
    AND s.product_id = NEW.product_id
    AND s.voided_at IS NULL;

  SELECT COALESCE(SUM(r.quantity), 0)
    INTO v_returned
  FROM public.returns r
  WHERE r.session_id = NEW.session_id
    AND r.product_id = NEW.product_id
    AND r.voided_at IS NULL;

  IF v_sold + v_returned + NEW.quantity > v_loaded THEN
    RAISE EXCEPTION 'Insufficient truck stock: loaded %, already sold %, returned %, requested %',
      v_loaded, v_sold, v_returned, NEW.quantity
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_sale_stock ON public.sales;
CREATE TRIGGER guard_sale_stock
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.guard_sale_stock();

-- The application already depends on this uniqueness for its upsert contract;
-- make the invariant explicit in the migration in case a future environment
-- does not have the index yet. Production already has this index.
CREATE UNIQUE INDEX IF NOT EXISTS truck_loads_session_product_key
  ON public.truck_loads(session_id, product_id);

-- Explicitly document that the retired custom GUC is not referenced by the
-- lifecycle trigger or admin RPC anymore.
COMMENT ON FUNCTION public.prevent_session_reset_after_start() IS
  'Route lifecycle guard. Exceptional admin transitions are authorized only by the route_session_admin SECURITY DEFINER execution role; no custom GUC override is used.';

COMMIT;
