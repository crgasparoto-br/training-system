-- Issue #263: generalize electronic contracts for students and collaborators.

DO $$
BEGIN
  CREATE TYPE "ContractPartyType" AS ENUM ('STUDENT', 'COLLABORATOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ContractTemplateApplicability" AS ENUM ('STUDENT', 'COLLABORATOR', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ContractLinkOrigin" AS ENUM ('ELECTRONIC', 'LEGACY_PDF', 'LEGACY_DECLARATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CollaboratorContractStatus" AS ENUM ('draft', 'pending_signature', 'active', 'expired', 'canceled', 'terminated', 'legacy');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ContractTemplate"
  ADD COLUMN IF NOT EXISTS "applicability" "ContractTemplateApplicability" NOT NULL DEFAULT 'STUDENT';

ALTER TABLE "GeneratedContract"
  ADD COLUMN IF NOT EXISTS "partyType" "ContractPartyType" NOT NULL DEFAULT 'STUDENT',
  ADD COLUMN IF NOT EXISTS "collaboratorId" TEXT,
  ADD COLUMN IF NOT EXISTS "origin" "ContractLinkOrigin" NOT NULL DEFAULT 'ELECTRONIC';

ALTER TABLE "GeneratedContract"
  ALTER COLUMN "alunoId" DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE "GeneratedContract"
    ADD CONSTRAINT "GeneratedContract_collaboratorId_fkey"
    FOREIGN KEY ("collaboratorId") REFERENCES "Educator"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "GeneratedContract"
    ADD CONSTRAINT "GeneratedContract_exactly_one_party_check"
    CHECK (
      ("partyType" = 'STUDENT' AND "alunoId" IS NOT NULL AND "collaboratorId" IS NULL)
      OR
      ("partyType" = 'COLLABORATOR' AND "alunoId" IS NULL AND "collaboratorId" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "GeneratedContract_partyType_idx"
  ON "GeneratedContract"("partyType");
CREATE INDEX IF NOT EXISTS "GeneratedContract_collaboratorId_idx"
  ON "GeneratedContract"("collaboratorId");
CREATE INDEX IF NOT EXISTS "ContractTemplate_contractId_applicability_status_idx"
  ON "ContractTemplate"("contractId", "applicability", "status");

CREATE TABLE IF NOT EXISTS "CollaboratorContract" (
  "id" TEXT NOT NULL,
  "collaboratorId" TEXT NOT NULL,
  "contractId" TEXT,
  "status" "CollaboratorContractStatus" NOT NULL DEFAULT 'draft',
  "origin" "ContractLinkOrigin" NOT NULL DEFAULT 'ELECTRONIC',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "notes" TEXT,
  "legacyDocumentUrl" TEXT,
  "legacySourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CollaboratorContract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollaboratorContract_contractId_key" UNIQUE ("contractId"),
  CONSTRAINT "CollaboratorContract_legacySourceKey_key" UNIQUE ("legacySourceKey"),
  CONSTRAINT "CollaboratorContract_collaboratorId_fkey"
    FOREIGN KEY ("collaboratorId") REFERENCES "Educator"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollaboratorContract_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CollaboratorContract_origin_shape_check" CHECK (
    ("origin" = 'ELECTRONIC' AND "contractId" IS NOT NULL AND "legacyDocumentUrl" IS NULL AND "legacySourceKey" IS NULL)
    OR
    ("origin" = 'LEGACY_PDF' AND "contractId" IS NULL AND "legacyDocumentUrl" IS NOT NULL AND "legacySourceKey" IS NOT NULL AND "status" = 'legacy')
    OR
    ("origin" = 'LEGACY_DECLARATION' AND "contractId" IS NULL AND "legacyDocumentUrl" IS NULL AND "legacySourceKey" IS NOT NULL AND "status" = 'legacy')
  )
);

CREATE INDEX IF NOT EXISTS "CollaboratorContract_collaboratorId_idx"
  ON "CollaboratorContract"("collaboratorId");
CREATE INDEX IF NOT EXISTS "CollaboratorContract_status_idx"
  ON "CollaboratorContract"("status");
CREATE INDEX IF NOT EXISTS "CollaboratorContract_startDate_idx"
  ON "CollaboratorContract"("startDate");
CREATE INDEX IF NOT EXISTS "CollaboratorContract_endDate_idx"
  ON "CollaboratorContract"("endDate");

ALTER TABLE "Educator"
  ADD COLUMN IF NOT EXISTS "currentCollaboratorContractId" TEXT;

DO $$
BEGIN
  ALTER TABLE "Educator"
    ADD CONSTRAINT "Educator_currentCollaboratorContractId_fkey"
    FOREIGN KEY ("currentCollaboratorContractId") REFERENCES "CollaboratorContract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Educator_currentCollaboratorContractId_idx"
  ON "Educator"("currentCollaboratorContractId");

-- Preserve history before adding the partial unique indexes. When an inconsistent
-- database contains more than one active link, keep the pointer-selected record,
-- then the most recently updated record, and terminate the remaining duplicates.
WITH ranked AS (
  SELECT
    sc."id",
    ROW_NUMBER() OVER (
      PARTITION BY sc."alunoId"
      ORDER BY
        CASE WHEN a."currentStudentContractId" = sc."id" THEN 0 ELSE 1 END,
        sc."updatedAt" DESC,
        sc."createdAt" DESC,
        sc."id" DESC
    ) AS position
  FROM "StudentContract" sc
  JOIN "Athlete" a ON a."id" = sc."alunoId"
  WHERE sc."status" = 'active'
)
UPDATE "StudentContract" sc
SET
  "status" = 'terminated',
  "endDate" = COALESCE(sc."endDate", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE sc."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentContract_one_active_per_aluno_key"
  ON "StudentContract"("alunoId")
  WHERE "status" = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS "CollaboratorContract_one_active_per_collaborator_key"
  ON "CollaboratorContract"("collaboratorId")
  WHERE "status" = 'active';

-- Idempotent legacy backfill. It never fabricates an electronic document,
-- signature, token, hash, IP address, acceptance instant or active vigency.
INSERT INTO "CollaboratorContract" (
  "id",
  "collaboratorId",
  "contractId",
  "status",
  "origin",
  "legacyDocumentUrl",
  "legacySourceKey",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || md5(p."id"),
  p."id",
  NULL,
  'legacy',
  CASE
    WHEN NULLIF(BTRIM(p."signedContractDocumentUrl"), '') IS NOT NULL THEN 'LEGACY_PDF'::"ContractLinkOrigin"
    ELSE 'LEGACY_DECLARATION'::"ContractLinkOrigin"
  END,
  NULLIF(BTRIM(p."signedContractDocumentUrl"), ''),
  'professor:' || p."id",
  CASE
    WHEN NULLIF(BTRIM(p."signedContractDocumentUrl"), '') IS NOT NULL THEN 'Documento legado importado'
    ELSE 'Contrato informado no cadastro legado, sem documento verificável'
  END,
  p."createdAt",
  CURRENT_TIMESTAMP
FROM "Educator" p
WHERE p."hasSignedContract" = TRUE
   OR NULLIF(BTRIM(p."signedContractDocumentUrl"), '') IS NOT NULL
ON CONFLICT ("legacySourceKey") DO UPDATE
SET
  "origin" = EXCLUDED."origin",
  "legacyDocumentUrl" = EXCLUDED."legacyDocumentUrl",
  "notes" = EXCLUDED."notes",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "CollaboratorContract"."status" = 'legacy';

CREATE OR REPLACE FUNCTION validate_generated_contract_party()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ContractTemplate" t
    WHERE t."id" = NEW."templateId"
      AND t."contractId" = NEW."companyContractId"
  ) THEN
    RAISE EXCEPTION 'Template and generated contract must belong to the same tenant';
  END IF;

  IF NEW."professorId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Educator" p
    WHERE p."id" = NEW."professorId"
      AND p."contractId" = NEW."companyContractId"
  ) THEN
    RAISE EXCEPTION 'Responsible professor and generated contract must belong to the same tenant';
  END IF;

  IF NEW."partyType" = 'STUDENT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "Athlete" a
      JOIN "Educator" p ON p."id" = a."professorId"
      WHERE a."id" = NEW."alunoId"
        AND p."contractId" = NEW."companyContractId"
    ) THEN
      RAISE EXCEPTION 'Student and generated contract must belong to the same tenant';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM "Educator" p
      WHERE p."id" = NEW."collaboratorId"
        AND p."contractId" = NEW."companyContractId"
    ) THEN
      RAISE EXCEPTION 'Collaborator and generated contract must belong to the same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "GeneratedContract_validate_party" ON "GeneratedContract";
CREATE TRIGGER "GeneratedContract_validate_party"
BEFORE INSERT OR UPDATE OF "companyContractId", "templateId", "partyType", "alunoId", "collaboratorId", "professorId"
ON "GeneratedContract"
FOR EACH ROW EXECUTE FUNCTION validate_generated_contract_party();

CREATE OR REPLACE FUNCTION validate_student_contract_document_party()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "GeneratedContract" c
    WHERE c."id" = NEW."contractId"
      AND c."partyType" = 'STUDENT'
      AND c."alunoId" = NEW."alunoId"
  ) THEN
    RAISE EXCEPTION 'Student link and generated document party must match';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "StudentContract_validate_document_party" ON "StudentContract";
CREATE TRIGGER "StudentContract_validate_document_party"
BEFORE INSERT OR UPDATE OF "alunoId", "contractId"
ON "StudentContract"
FOR EACH ROW EXECUTE FUNCTION validate_student_contract_document_party();

CREATE OR REPLACE FUNCTION validate_collaborator_contract_document_party()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."origin" = 'ELECTRONIC' AND NOT EXISTS (
    SELECT 1 FROM "GeneratedContract" c
    WHERE c."id" = NEW."contractId"
      AND c."partyType" = 'COLLABORATOR'
      AND c."collaboratorId" = NEW."collaboratorId"
  ) THEN
    RAISE EXCEPTION 'Collaborator link and generated document party must match';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CollaboratorContract_validate_document_party" ON "CollaboratorContract";
CREATE TRIGGER "CollaboratorContract_validate_document_party"
BEFORE INSERT OR UPDATE OF "collaboratorId", "contractId", "origin"
ON "CollaboratorContract"
FOR EACH ROW EXECUTE FUNCTION validate_collaborator_contract_document_party();
