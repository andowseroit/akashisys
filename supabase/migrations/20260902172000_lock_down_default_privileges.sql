BEGIN;

-- Stop future tables created by postgres in the public schema
-- from automatically granting API roles access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Stop future functions created by postgres in the public schema
-- from automatically being callable by API roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

COMMIT;