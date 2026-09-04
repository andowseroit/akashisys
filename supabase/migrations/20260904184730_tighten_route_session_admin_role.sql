BEGIN;
GRANT USAGE ON SCHEMA auth TO route_session_admin;
GRANT route_session_admin TO postgres WITH INHERIT FALSE, SET FALSE, ADMIN FALSE;
COMMIT;
