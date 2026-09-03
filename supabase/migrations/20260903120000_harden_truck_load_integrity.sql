-- Truck loads are owned by a route session. Keep session_date only as a
-- compatibility/cache column for existing UI, but never trust client input for it.

DROP INDEX IF EXISTS public.truck_loads_session_date_product_id_key;
DROP INDEX IF EXISTS public.idx_truck_loads_date;

CREATE UNIQUE INDEX IF NOT EXISTS truck_loads_session_product_key
  ON public.truck_loads (session_id, product_id);

CREATE INDEX IF NOT EXISTS idx_truck_loads_session_id
  ON public.truck_loads (session_id);

CREATE OR REPLACE FUNCTION public.sync_truck_load_session_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  session_day date;
BEGIN
  SELECT rs.session_date
    INTO session_day
  FROM public.route_sessions AS rs
  WHERE rs.id = NEW.session_id;

  IF session_day IS NULL THEN
    RAISE EXCEPTION 'Invalid route session: %', NEW.session_id
      USING ERRCODE = '23503';
  END IF;

  NEW.session_date := session_day;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_truck_load_session_date
  ON public.truck_loads;

CREATE TRIGGER trg_sync_truck_load_session_date
  BEFORE INSERT OR UPDATE OF session_id, session_date
  ON public.truck_loads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_truck_load_session_date();

ALTER TABLE public.truck_loads
  DROP CONSTRAINT IF EXISTS truck_loads_quantity_loaded_check;

ALTER TABLE public.truck_loads
  ADD CONSTRAINT truck_loads_quantity_loaded_check
  CHECK (quantity_loaded > 0);

ALTER TABLE public.truck_loads
  DROP CONSTRAINT IF EXISTS truck_loads_quantity_returned_check;

ALTER TABLE public.truck_loads
  ADD CONSTRAINT truck_loads_quantity_returned_check
  CHECK (quantity_returned IS NULL OR (quantity_returned >= 0 AND quantity_returned <= quantity_loaded));

COMMENT ON COLUMN public.truck_loads.session_date IS
  'Compatibility field derived from route_sessions.session_date. Client input is overwritten by trigger.';
