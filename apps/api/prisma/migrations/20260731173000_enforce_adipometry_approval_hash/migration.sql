BEGIN;

-- Issue #246 independent-audit remediation.
-- Reproduce the service-side recursively sorted JSON representation at the
-- persistence boundary so a syntactically valid but unrelated SHA-256 cannot
-- be recorded as the approved clinical specification hash.
CREATE OR REPLACE FUNCTION "canonicalizeAdipometrySpecificationJson"(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $canonical$
DECLARE
  v_type TEXT;
  v_result TEXT;
BEGIN
  v_type := JSONB_TYPEOF(p_value);

  CASE v_type
    WHEN 'object' THEN
      SELECT '{' || COALESCE(
        STRING_AGG(
          TO_JSONB(entry.key)::TEXT || ':' ||
          "canonicalizeAdipometrySpecificationJson"(entry.value),
          ',' ORDER BY entry.key COLLATE "C"
        ),
        ''
      ) || '}'
      INTO v_result
      FROM JSONB_EACH(p_value) AS entry(key, value);
      RETURN v_result;

    WHEN 'array' THEN
      SELECT '[' || COALESCE(
        STRING_AGG(
          "canonicalizeAdipometrySpecificationJson"(item.value),
          ',' ORDER BY item.ordinality
        ),
        ''
      ) || ']'
      INTO v_result
      FROM JSONB_ARRAY_ELEMENTS(p_value) WITH ORDINALITY AS item(value, ordinality);
      RETURN v_result;

    WHEN 'number' THEN
      -- JSON.parse in the Node service materializes JSON numbers as IEEE-754
      -- values before JSON.stringify. Converting through double precision keeps
      -- the database representation aligned for the bounded clinical values.
      RETURN TO_JSONB((p_value #>> '{}')::DOUBLE PRECISION)::TEXT;

    ELSE
      RETURN p_value::TEXT;
  END CASE;
END;
$canonical$;

CREATE OR REPLACE FUNCTION "buildAdipometrySpecificationHash"(
  p_code TEXT,
  p_version INTEGER,
  p_reference TEXT,
  p_definition_snapshot JSONB
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $hash$
  SELECT ENCODE(
    SHA256(
      CONVERT_TO(
        "canonicalizeAdipometrySpecificationJson"(
          JSONB_BUILD_OBJECT(
            'code', p_code,
            'version', p_version,
            'reference', p_reference,
            'definitionSnapshot', p_definition_snapshot
          )
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$hash$;

CREATE OR REPLACE FUNCTION "guardAdipometryProtocolApprovalHash"()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
  v_expected_hash TEXT;
BEGIN
  v_expected_hash := "buildAdipometrySpecificationHash"(
    NEW."protocolCode",
    NEW."protocolVersion",
    NEW."protocolReferenceSnapshot",
    NEW."protocolDefinitionSnapshot"
  );

  IF NEW."approvedSpecificationHash" IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'ADIPOMETRY_SPECIFICATION_HASH_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$guard$;

-- The reduced legacy-chain verification installs migrations that are not part
-- of the ADPT chain before the governance tables exist. Keep that compatibility
-- path safe while installing the guard normally whenever the approval table is
-- present (the production migration order and complete upgrade gates).
DO $install_hash_guard$
DECLARE
  v_invalid BOOLEAN;
BEGIN
  IF TO_REGCLASS('"AdipometryProtocolApproval"') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS
    "AdipometryProtocolApproval_01_specification_hash_guard"
    ON "AdipometryProtocolApproval"';
  EXECUTE 'CREATE TRIGGER
    "AdipometryProtocolApproval_01_specification_hash_guard"
    BEFORE INSERT OR UPDATE ON "AdipometryProtocolApproval"
    FOR EACH ROW EXECUTE FUNCTION "guardAdipometryProtocolApprovalHash"()';

  EXECUTE 'SELECT EXISTS (
    SELECT 1
    FROM "AdipometryProtocolApproval" approval
    WHERE approval."approvedSpecificationHash" IS DISTINCT FROM
      "buildAdipometrySpecificationHash"(
        approval."protocolCode",
        approval."protocolVersion",
        approval."protocolReferenceSnapshot",
        approval."protocolDefinitionSnapshot"
      )
  )' INTO v_invalid;

  IF v_invalid THEN
    RAISE EXCEPTION 'ADIPOMETRY_EXISTING_APPROVAL_HASH_MISMATCH';
  END IF;
END;
$install_hash_guard$;

COMMIT;
