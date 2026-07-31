BEGIN;

-- No-actor overloads exist only for the historical migration chain. Remove
-- EXECUTE from PUBLIC and from the owning migration role. PostgreSQL
-- superusers still bypass ACLs, which keeps isolated migration fixtures usable
-- without exposing these entrypoints to application roles.
REVOKE ALL ON FUNCTION "createAdipometryDraft"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP WITHOUT TIME ZONE,
  TIMESTAMP WITHOUT TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "createAdipometryDraft"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMP WITHOUT TIME ZONE,
  TIMESTAMP WITHOUT TIME ZONE
) FROM CURRENT_USER;

REVOKE ALL ON FUNCTION "createAdipometryDraft"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TIMESTAMP WITH TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "createAdipometryDraft"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TIMESTAMP WITH TIME ZONE
) FROM CURRENT_USER;

COMMIT;
