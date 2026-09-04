BEGIN;
GRANT CREATE ON SCHEMA public TO route_session_admin;
GRANT route_session_admin TO postgres WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
SET LOCAL ROLE route_session_admin;
-- Rebuild the function without an auth-schema dependency; the Edge Function
-- authenticates the caller and the database verifies the supplied admin ID.
CREATE OR REPLACE FUNCTION public.admin_reopen_route_session(p_session_id uuid,p_admin_id uuid,p_target_status text DEFAULT 'active') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE v_session public.route_sessions; v_admin_exists boolean; v_new_started timestamptz; BEGIN
IF p_admin_id IS NULL THEN RAISE EXCEPTION 'Administrator identity is required' USING ERRCODE='P0001'; END IF;
SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_admin_id AND role='admin') INTO v_admin_exists;
IF NOT v_admin_exists THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='P0001'; END IF;
IF p_target_status NOT IN ('active','pending') THEN RAISE EXCEPTION 'Invalid target status. Must be active or pending' USING ERRCODE='P0001'; END IF;
SELECT * INTO v_session FROM public.route_sessions WHERE id=p_session_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Route session not found' USING ERRCODE='P0001'; END IF;
IF v_session.status<>'completed' THEN RAISE EXCEPTION 'Session can only be reopened from completed status' USING ERRCODE='P0001'; END IF;
IF p_target_status='pending' THEN
IF private.route_session_has_nonvoided_financial(p_session_id) THEN RAISE EXCEPTION 'Cannot reset a completed session to pending while non-voided financial records exist; reopen it as active instead' USING ERRCODE='P0001'; END IF;
IF private.route_session_has_truck_loads(p_session_id) THEN RAISE EXCEPTION 'Cannot reset a completed session to pending while truck-load stock history exists; reopen it as active instead' USING ERRCODE='P0001'; END IF;
v_new_started:=NULL; ELSE v_new_started:=COALESCE(v_session.started_at,now()); END IF;
UPDATE public.route_sessions SET status=p_target_status,started_at=v_new_started,completed_at=NULL,paused_at=NULL,stopped_by=NULL,notes=COALESCE(notes,'')||chr(10)||'[Admin reopen: '||p_target_status||' by '||p_admin_id::text||' at '||now()::text||']' WHERE id=p_session_id;
INSERT INTO public.corrections(table_name,record_id,action,old_values,new_values,corrected_by,reason) VALUES ('route_sessions',p_session_id,'edit',jsonb_build_object('status',v_session.status,'started_at',v_session.started_at,'completed_at',v_session.completed_at),jsonb_build_object('status',p_target_status,'started_at',v_new_started,'completed_at',NULL),p_admin_id::text,'Administrative route-session recovery; financial records preserved');
RETURN jsonb_build_object('success',true,'session_id',p_session_id,'previous_status',v_session.status,'new_status',p_target_status,'financial_records_preserved',true); END $$;
RESET ROLE;
GRANT route_session_admin TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN FALSE;
REVOKE CREATE ON SCHEMA public FROM route_session_admin;
COMMIT;
