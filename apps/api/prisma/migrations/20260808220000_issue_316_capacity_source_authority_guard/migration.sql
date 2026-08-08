-- Issue #316 audit remediation: capacity_source is backend-owned.
--
-- The public TypeScript contract already excludes role=capacity_source from
-- client-provided dataRefs. This database guard closes the runtime boundary for
-- adversarial/untyped callers by requiring every capacity_source row to match a
-- canonical CapacityPrescriptionSource belonging to one of the capacity
-- versions selected by the same consolidated version. Because the service
-- persists canonical refs before additional client refs, a second identical
-- capacity_source is rejected as a client-forged duplicate and the surrounding
-- transaction rolls back.

CREATE OR REPLACE FUNCTION "validate_consolidated_data_ref_scope"()
RETURNS TRIGGER AS $$
DECLARE
  assembly_contract TEXT;
BEGIN
  SELECT v."contractId" INTO assembly_contract
  FROM "ConsolidatedPrescriptionVersion" v
  WHERE v."id" = NEW."assemblyVersionId";

  IF assembly_contract IS NULL THEN
    RAISE EXCEPTION 'data reference outside consolidated version' USING ERRCODE = '23514';
  END IF;

  IF NEW."responsibleProfessorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Professor" p
    WHERE p."id" = NEW."responsibleProfessorId" AND p."contractId" = assembly_contract
  ) THEN
    RAISE EXCEPTION 'data reference professor outside contract' USING ERRCODE = '23514';
  END IF;

  IF NEW."role" = 'capacity_source' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "ConsolidatedPrescriptionCapacityBlock" block
      JOIN "CapacityPrescriptionSource" source
        ON source."versionId" = block."capacityPrescriptionVersionId"
      WHERE block."assemblyVersionId" = NEW."assemblyVersionId"
        AND source."sourceType" = NEW."sourceType"
        AND source."sourceId" = NEW."sourceId"
        AND source."label" IS NOT DISTINCT FROM NEW."label"
        AND source."assessedAt" IS NOT DISTINCT FROM NEW."assessedAt"
        AND source."origin" IS NOT DISTINCT FROM NEW."origin"
        AND source."sourceVersion" IS NOT DISTINCT FROM NEW."sourceVersion"
        AND source."responsibleProfessorId" IS NOT DISTINCT FROM NEW."responsibleProfessorId"
    ) THEN
      RAISE EXCEPTION 'capacity_source must match a selected canonical capacity source'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "ConsolidatedPrescriptionDataRef" existing
      WHERE existing."assemblyVersionId" = NEW."assemblyVersionId"
        AND existing."role" = 'capacity_source'
        AND existing."sourceType" = NEW."sourceType"
        AND existing."sourceId" = NEW."sourceId"
        AND existing."sourceVersion" IS NOT DISTINCT FROM NEW."sourceVersion"
    ) THEN
      RAISE EXCEPTION 'capacity_source references are backend-owned and cannot be duplicated'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
