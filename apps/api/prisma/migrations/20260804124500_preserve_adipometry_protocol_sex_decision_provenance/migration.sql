BEGIN;

-- A repeated form submission may resend the same effective protocol-sex
-- decision while changing only measurements or notes. In that case the
-- clinical confirmer, confirmation instant and profile snapshot must remain
-- attached to the original decision instead of being reassigned to the editor.
CREATE OR REPLACE FUNCTION "preserveAdipometryProtocolSexDecisionProvenance"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."protocolSex" IS NOT DISTINCT FROM OLD."protocolSex"
     AND NEW."protocolSexSource" IS NOT DISTINCT FROM OLD."protocolSexSource"
     AND NULLIF(BTRIM(NEW."protocolSexOverrideReason"), '')
         IS NOT DISTINCT FROM NULLIF(BTRIM(OLD."protocolSexOverrideReason"), '')
  THEN
    NEW."profileSexSnapshot" := OLD."profileSexSnapshot";
    NEW."protocolSexOverrideReason" := OLD."protocolSexOverrideReason";
    NEW."protocolSexConfirmedByUserId" := OLD."protocolSexConfirmedByUserId";
    NEW."protocolSexConfirmedAt" := OLD."protocolSexConfirmedAt";
  END IF;

  RETURN NEW;
END;
$$;

-- Reduced legacy-chain gates intentionally install only the early ADPT
-- foundation. Install the production trigger only when the complete decision
-- provenance columns are present; the full production chain always satisfies
-- this condition.
DO $install_provenance_trigger$
DECLARE
  v_column_count INTEGER;
BEGIN
  IF TO_REGCLASS('"AdipometryAssessment"') IS NOT NULL THEN
    SELECT COUNT(DISTINCT columns.column_name)
      INTO v_column_count
    FROM information_schema.columns columns
    WHERE columns.table_schema = CURRENT_SCHEMA()
      AND columns.table_name = 'AdipometryAssessment'
      AND columns.column_name IN (
        'protocolSex',
        'profileSexSnapshot',
        'protocolSexSource',
        'protocolSexConfirmedByUserId',
        'protocolSexConfirmedAt',
        'protocolSexOverrideReason'
      );

    IF v_column_count = 6 THEN
      EXECUTE 'DROP TRIGGER IF EXISTS "AdipometryAssessment_preserve_protocol_sex_provenance" ON "AdipometryAssessment"';
      EXECUTE $trigger$
        CREATE TRIGGER "AdipometryAssessment_preserve_protocol_sex_provenance"
        BEFORE UPDATE OF
          "protocolSex",
          "profileSexSnapshot",
          "protocolSexSource",
          "protocolSexConfirmedByUserId",
          "protocolSexConfirmedAt",
          "protocolSexOverrideReason"
        ON "AdipometryAssessment"
        FOR EACH ROW
        EXECUTE FUNCTION "preserveAdipometryProtocolSexDecisionProvenance"()
      $trigger$;
    END IF;
  END IF;
END;
$install_provenance_trigger$;

-- PostgreSQL regression control for ADPT-AUD-001. The temporary table exercises
-- the same trigger function without introducing fixture rows into business
-- tables. The migration aborts if an unchanged effective decision can renew
-- provenance, or if a real decision change cannot transfer provenance.
CREATE TEMP TABLE "AdipometryProtocolSexDecisionProvenanceControl" (
  id TEXT PRIMARY KEY,
  "protocolSex" TEXT,
  "profileSexSnapshot" TEXT,
  "protocolSexSource" TEXT,
  "protocolSexConfirmedByUserId" TEXT,
  "protocolSexConfirmedAt" TIMESTAMPTZ,
  "protocolSexOverrideReason" TEXT
) ON COMMIT DROP;

CREATE TRIGGER "AdipometryProtocolSexDecisionProvenanceControl_trigger"
BEFORE UPDATE OF
  "protocolSex",
  "profileSexSnapshot",
  "protocolSexSource",
  "protocolSexConfirmedByUserId",
  "protocolSexConfirmedAt",
  "protocolSexOverrideReason"
ON "AdipometryProtocolSexDecisionProvenanceControl"
FOR EACH ROW
EXECUTE FUNCTION "preserveAdipometryProtocolSexDecisionProvenance"();

INSERT INTO "AdipometryProtocolSexDecisionProvenanceControl" (
  id,
  "protocolSex",
  "profileSexSnapshot",
  "protocolSexSource",
  "protocolSexConfirmedByUserId",
  "protocolSexConfirmedAt",
  "protocolSexOverrideReason"
) VALUES (
  'control',
  'male',
  'male',
  'profile',
  'professional-a',
  TIMESTAMPTZ '2026-08-04 10:00:00+00',
  NULL
);

UPDATE "AdipometryProtocolSexDecisionProvenanceControl"
SET
  "protocolSex" = 'male',
  "profileSexSnapshot" = 'female',
  "protocolSexSource" = 'profile',
  "protocolSexConfirmedByUserId" = 'professional-b',
  "protocolSexConfirmedAt" = TIMESTAMPTZ '2026-08-04 11:00:00+00',
  "protocolSexOverrideReason" = '   '
WHERE id = 'control';

DO $$
DECLARE
  control_row "AdipometryProtocolSexDecisionProvenanceControl"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT control_row
  FROM "AdipometryProtocolSexDecisionProvenanceControl"
  WHERE id = 'control';

  IF control_row."profileSexSnapshot" IS DISTINCT FROM 'male'
     OR control_row."protocolSexOverrideReason" IS NOT NULL
     OR control_row."protocolSexConfirmedByUserId" IS DISTINCT FROM 'professional-a'
     OR control_row."protocolSexConfirmedAt" IS DISTINCT FROM TIMESTAMPTZ '2026-08-04 10:00:00+00'
  THEN
    RAISE EXCEPTION
      'ADPT-AUD-001 regression: unchanged protocol-sex decision renewed clinical provenance';
  END IF;
END;
$$;

UPDATE "AdipometryProtocolSexDecisionProvenanceControl"
SET
  "protocolSex" = 'female',
  "profileSexSnapshot" = 'male',
  "protocolSexSource" = 'professional_override',
  "protocolSexConfirmedByUserId" = 'professional-b',
  "protocolSexConfirmedAt" = TIMESTAMPTZ '2026-08-04 11:00:00+00',
  "protocolSexOverrideReason" = 'Decisão clínica revisada.'
WHERE id = 'control';

DO $$
DECLARE
  control_row "AdipometryProtocolSexDecisionProvenanceControl"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT control_row
  FROM "AdipometryProtocolSexDecisionProvenanceControl"
  WHERE id = 'control';

  IF control_row."protocolSex" IS DISTINCT FROM 'female'
     OR control_row."profileSexSnapshot" IS DISTINCT FROM 'male'
     OR control_row."protocolSexSource" IS DISTINCT FROM 'professional_override'
     OR control_row."protocolSexConfirmedByUserId" IS DISTINCT FROM 'professional-b'
     OR control_row."protocolSexConfirmedAt" IS DISTINCT FROM TIMESTAMPTZ '2026-08-04 11:00:00+00'
     OR control_row."protocolSexOverrideReason" IS DISTINCT FROM 'Decisão clínica revisada.'
  THEN
    RAISE EXCEPTION
      'ADPT-AUD-001 regression: changed protocol-sex decision did not record new provenance';
  END IF;
END;
$$;

COMMIT;
