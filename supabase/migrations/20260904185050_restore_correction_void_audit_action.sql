BEGIN;
ALTER TABLE public.corrections DROP CONSTRAINT corrections_action_check;
ALTER TABLE public.corrections ADD CONSTRAINT corrections_action_check CHECK (action = ANY (ARRAY['edit'::text,'delete'::text,'add'::text,'void'::text]));
COMMIT;
