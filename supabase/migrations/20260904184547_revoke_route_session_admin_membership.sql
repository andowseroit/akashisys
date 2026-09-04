-- Revoke any application-created membership path to the dedicated lifecycle role.
REVOKE route_session_admin FROM postgres;
