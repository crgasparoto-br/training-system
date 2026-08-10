-- Issue #263 follow-up: preserve contract history and validate the current pointer.

ALTER TABLE "GeneratedContract"
  DROP CONSTRAINT IF EXISTS "GeneratedContract_collaboratorId_fkey";
ALTER TABLE "GeneratedContract"
  ADD CONSTRAINT "GeneratedContract_collaboratorId_fkey"
  FOREIGN KEY ("collaboratorId") REFERENCES "Professor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollaboratorContract"
  DROP CONSTRAINT IF EXISTS "CollaboratorContract_collaboratorId_fkey";
ALTER TABLE "CollaboratorContract"
  ADD CONSTRAINT "CollaboratorContract_collaboratorId_fkey"
  FOREIGN KEY ("collaboratorId") REFERENCES "Professor"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Any invalid pointer from a partially applied or manually changed environment is
-- cleared before the trigger and uniqueness constraint are installed.
UPDATE "Professor" p
SET "currentCollaboratorContractId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE p."currentCollaboratorContractId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CollaboratorContract" cc
    WHERE cc."id" = p."currentCollaboratorContractId"
      AND cc."collaboratorId" = p."id"
      AND cc."status" = 'active'::"CollaboratorContractStatus"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "Professor_currentCollaboratorContractId_key"
  ON "Professor"("currentCollaboratorContractId")
  WHERE "currentCollaboratorContractId" IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_professor_current_collaborator_contract()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."currentCollaboratorContractId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "CollaboratorContract" cc
    WHERE cc."id" = NEW."currentCollaboratorContractId"
      AND cc."collaboratorId" = NEW."id"
      AND cc."status" = 'active'::"CollaboratorContractStatus"
  ) THEN
    RAISE EXCEPTION 'Current collaborator contract must be active and belong to the same collaborator';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Professor_validate_current_collaborator_contract" ON "Professor";
CREATE CONSTRAINT TRIGGER "Professor_validate_current_collaborator_contract"
AFTER INSERT OR UPDATE OF "currentCollaboratorContractId"
ON "Professor"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_professor_current_collaborator_contract();
