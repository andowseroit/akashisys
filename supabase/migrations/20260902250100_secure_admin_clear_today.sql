BEGIN;

-- Secure, server-controlled "Clear Today's Data" operation.
-- The date is determined by PostgreSQL (CURRENT_DATE), not by the browser.
CREATE OR REPLACE FUNCTION public.admin_clear_today()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  today_date date := CURRENT_DATE;
  deleted_sales bigint := 0;
  deleted_payments bigint := 0;
  deleted_returns bigint := 0;
  deleted_expenses bigint := 0;
  deleted_settlements bigint := 0;
  deleted_truck_loads bigint := 0;
  reset_sessions bigint := 0;
BEGIN
  /*
   * Delete truck loads first because truck_loads.session_id
   * references route_sessions.id.
   */
  DELETE FROM public.truck_loads
  WHERE session_date = today_date;

  GET DIAGNOSTICS deleted_truck_loads = ROW_COUNT;

  /*
   * Delete today's financial/activity records.
   */
  DELETE FROM public.payments
  WHERE paid_at >= today_date::timestamp
    AND paid_at < (today_date + 1)::timestamp;

  GET DIAGNOSTICS deleted_payments = ROW_COUNT;

  DELETE FROM public.sales
  WHERE sold_at >= today_date::timestamp
    AND sold_at < (today_date + 1)::timestamp;

  GET DIAGNOSTICS deleted_sales = ROW_COUNT;

  DELETE FROM public.returns
  WHERE returned_at >= today_date::timestamp
    AND returned_at < (today_date + 1)::timestamp;

  GET DIAGNOSTICS deleted_returns = ROW_COUNT;

  DELETE FROM public.expenses
  WHERE spent_at >= today_date::timestamp
    AND spent_at < (today_date + 1)::timestamp;

  GET DIAGNOSTICS deleted_expenses = ROW_COUNT;

  DELETE FROM public.outstanding_settlements
  WHERE settled_at >= today_date::timestamp
    AND settled_at < (today_date + 1)::timestamp;

  GET DIAGNOSTICS deleted_settlements = ROW_COUNT;

  /*
   * Do not delete route sessions.
   * Reset all sessions belonging to today.
   *
   * Multiple sessions can exist on the same date, so resetting
   * every matching session is safer than resetting only the first.
   */
  UPDATE public.route_sessions
  SET
    status = 'pending',
    started_at = NULL,
    completed_at = NULL
  WHERE session_date = today_date;

  GET DIAGNOSTICS reset_sessions = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'date', today_date,
    'deleted_sales', deleted_sales,
    'deleted_payments', deleted_payments,
    'deleted_returns', deleted_returns,
    'deleted_expenses', deleted_expenses,
    'deleted_settlements', deleted_settlements,
    'deleted_truck_loads', deleted_truck_loads,
    'reset_sessions', reset_sessions
  );
END;
$$;

-- This function must NEVER be callable by browser roles.
REVOKE ALL ON FUNCTION public.admin_clear_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_today() FROM anon;
REVOKE ALL ON FUNCTION public.admin_clear_today() FROM authenticated;

-- Only the server-side privileged role may execute it.
GRANT EXECUTE ON FUNCTION public.admin_clear_today() TO service_role;

COMMIT;