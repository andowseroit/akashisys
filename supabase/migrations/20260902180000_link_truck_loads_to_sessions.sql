BEGIN;

ALTER TABLE public.truck_loads
ADD COLUMN session_id uuid;

UPDATE public.truck_loads tl
SET session_id = rs.id
FROM public.route_sessions rs
WHERE rs.session_date = tl.session_date;

ALTER TABLE public.truck_loads
ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.truck_loads
ADD CONSTRAINT truck_loads_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES public.route_sessions(id);

CREATE INDEX idx_truck_loads_session_id
ON public.truck_loads(session_id);

COMMIT;